package main

import (
	"bufio"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
)

// Set at build time: -ldflags "-X main.checkScriptPublicKey=<base64 SPKI DER>", the
// same key as PLAYBOOK_PUBLIC_KEY. Empty means no check script is ever run.
var checkScriptPublicKey string

// Mirrored by MAX_CHECK_BYTES in schemas/staff-rule.ts.
const (
	maxCheckScript   = 64 << 10
	maxCheckOutput   = 1 << 20
	maxCheckLine     = 16 << 10
	maxCheckFindings = 50
	maxCheckLines    = 5
)

var (
	kebabShape  = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	sha256Shape = regexp.MustCompile(`^[0-9a-f]{64}$`)
	severities  = map[string]bool{"low": true, "medium": true, "high": true, "critical": true}
	interpreter = map[string]string{"sh": "/bin/sh", "node": "node", "python": "python3"}
)

type checkMeta struct {
	ID        string `json:"id"`
	Version   int    `json:"version"`
	Language  string `json:"language"`
	Sha256    string `json:"sha256"`
	Signature string `json:"signature"`
	Bytes     int    `json:"bytes"`
}

type checkScript struct {
	meta checkMeta
	body []byte
}

// Reads the script that precedes the tarball. A malformed header is fatal to the
// fetch, because the body boundary is then unknown.
func readCheck(header string, body io.Reader) (*checkScript, error) {
	raw, err := base64.RawURLEncoding.DecodeString(header)
	if err != nil {
		return nil, err
	}
	var meta checkMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, err
	}
	if meta.Bytes < 0 || meta.Bytes > maxCheckScript {
		return nil, fmt.Errorf("check script of %d bytes", meta.Bytes)
	}
	buf := make([]byte, meta.Bytes)
	if _, err := io.ReadFull(body, buf); err != nil {
		return nil, err
	}
	return &checkScript{meta: meta, body: buf}, nil
}

// The bytes lib/platform/signing.ts signs: canonicalJson({id, version, body: {language, sha256}}).
func checkPayload(m checkMeta) string {
	return fmt.Sprintf(`{"body":{"language":"%s","sha256":"%s"},"id":"%s","version":%d}`, m.Language, m.Sha256, m.ID, m.Version)
}

func verifyCheck(c *checkScript, publicKeyB64 string) error {
	if publicKeyB64 == "" {
		return errors.New("this detonator was built without a check-script public key")
	}
	m := c.meta
	if !kebabShape.MatchString(m.ID) || len(m.ID) > 64 || m.Version < 1 || interpreter[m.Language] == "" || !sha256Shape.MatchString(m.Sha256) {
		return errors.New("check script metadata is malformed")
	}
	sum := sha256.Sum256(c.body)
	if hex.EncodeToString(sum[:]) != m.Sha256 {
		return errors.New("check script body does not match its signed hash")
	}
	der, err := base64.StdEncoding.DecodeString(publicKeyB64)
	if err != nil {
		return errors.New("embedded public key is not base64")
	}
	parsed, err := x509.ParsePKIXPublicKey(der)
	key, ok := parsed.(ed25519.PublicKey)
	if err != nil || !ok {
		return errors.New("embedded public key is not an ed25519 SPKI key")
	}
	sig, err := base64.StdEncoding.DecodeString(m.Signature)
	if err != nil || !ed25519.Verify(key, []byte(checkPayload(m)), sig) {
		return errors.New("check script signature does not verify")
	}
	return nil
}

type checkLine struct {
	Finding *struct {
		ID       string   `json:"id"`
		Severity string   `json:"severity"`
		Lines    []string `json:"lines"`
	} `json:"finding"`
}

// Only well-formed finding lines count; anything else the script prints is ignored.
func parseCheckOutput(id string, r io.Reader) (findings []ScannerFinding, truncated bool) {
	sc := bufio.NewScanner(io.LimitReader(r, maxCheckOutput))
	sc.Buffer(make([]byte, 0, 4096), maxCheckLine)
	for sc.Scan() {
		var line checkLine
		if json.Unmarshal(sc.Bytes(), &line) != nil || line.Finding == nil {
			continue
		}
		f := line.Finding
		if !kebabShape.MatchString(f.ID) || len(f.ID) > 64 || !severities[f.Severity] {
			continue
		}
		if len(findings) >= maxCheckFindings {
			return findings, true
		}
		lines := f.Lines
		if len(lines) > maxCheckLines {
			lines = lines[:maxCheckLines]
		}
		findings = append(findings, ScannerFinding{Tool: "check:" + id, RuleID: f.ID, Severity: f.Severity, Message: strings.Join(lines, " | ")})
	}
	return findings, sc.Err() != nil
}
