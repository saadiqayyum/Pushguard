package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Scanner output past this is cut; a truncated SARIF fails to parse and is reported.
const maxScannerOutput = 32 << 20

// Fixed path the workflow installs rules to; yara without rules is reported as skipped.
const yaraRules = "/opt/pushguard/rules.yar"

type sarif struct {
	Runs []struct {
		Tool struct {
			Driver struct {
				Name string `json:"name"`
			} `json:"driver"`
		} `json:"tool"`
		Results []struct {
			RuleID  string `json:"ruleId"`
			Level   string `json:"level"`
			Message struct {
				Text string `json:"text"`
			} `json:"message"`
			Locations []struct {
				PhysicalLocation struct {
					ArtifactLocation struct {
						URI string `json:"uri"`
					} `json:"artifactLocation"`
					Region struct {
						StartLine int `json:"startLine"`
					} `json:"region"`
				} `json:"physicalLocation"`
			} `json:"locations"`
		} `json:"results"`
	} `json:"runs"`
}

// Secrets and malicious-package hits are never "warnings", whatever level the tool picks.
var toolSeverity = map[string]string{"gitleaks": "high", "guarddog": "high", "yara": "high"}

func levelSeverity(level string) string {
	switch level {
	case "error":
		return "high"
	case "note", "none":
		return "low"
	}
	return "medium"
}

// Snippets are ignored on purpose: gitleaks puts the secret there.
func parseSARIF(tool string, data []byte, root string) ([]ScannerFinding, error) {
	var doc sarif
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	var out []ScannerFinding
	for _, run := range doc.Runs {
		for _, r := range run.Results {
			f := ScannerFinding{Tool: tool, RuleID: r.RuleID, Severity: levelSeverity(r.Level), Message: r.Message.Text}
			if s, ok := toolSeverity[tool]; ok {
				f.Severity = s
			}
			if len(r.Locations) > 0 {
				loc := r.Locations[0].PhysicalLocation
				f.File = relativeURI(loc.ArtifactLocation.URI, root)
				f.Line = max(loc.Region.StartLine, 0)
			}
			if f.RuleID == "" {
				f.RuleID = "unnamed"
			}
			out = append(out, f)
		}
	}
	return out, nil
}

func relativeURI(uri, root string) string {
	p := strings.TrimPrefix(uri, "file://")
	if rel, err := filepath.Rel(root, p); err == nil && !strings.HasPrefix(rel, "..") {
		return rel
	}
	return p
}

// yara prints "RuleName /path/to/file" per match.
func parseYara(data []byte, root string) []ScannerFinding {
	var out []ScannerFinding
	sc := bufio.NewScanner(bytes.NewReader(data))
	for sc.Scan() {
		rule, file, ok := strings.Cut(strings.TrimSpace(sc.Text()), " ")
		if !ok {
			continue
		}
		out = append(out, ScannerFinding{Tool: "yara", RuleID: rule, Severity: "high", File: relativeURI(file, root), Message: "YARA rule " + rule + " matched"})
	}
	return out
}

type scanner struct {
	name  string
	args  func(dir string) ([]string, string)
	parse func(out []byte, dir string) ([]ScannerFinding, error)
}

func sarifParser(tool string) func([]byte, string) ([]ScannerFinding, error) {
	return func(out []byte, dir string) ([]ScannerFinding, error) { return parseSARIF(tool, out, dir) }
}

var scanners = []scanner{
	{"semgrep", func(dir string) ([]string, string) {
		return []string{"scan", "--config", "p/default", "--sarif", "--metrics", "off", "--quiet", dir}, ""
	}, sarifParser("semgrep")},
	{"gitleaks", func(dir string) ([]string, string) {
		return []string{"detect", "--no-git", "--redact", "--exit-code", "0", "--report-format", "sarif", "--report-path", "/dev/stdout", "--source", dir}, ""
	}, sarifParser("gitleaks")},
	{"guarddog", func(dir string) ([]string, string) {
		lock := filepath.Join(dir, "package-lock.json")
		if _, err := os.Stat(lock); err != nil {
			return nil, "no package-lock.json to verify"
		}
		return []string{"npm", "verify", lock, "--output-format", "sarif"}, ""
	}, sarifParser("guarddog")},
	{"yara", func(dir string) ([]string, string) {
		if _, err := os.Stat(yaraRules); err != nil {
			return nil, "no rules at " + yaraRules
		}
		return []string{"-r", "-w", yaraRules, dir}, ""
	}, func(out []byte, dir string) ([]ScannerFinding, error) { return parseYara(out, dir), nil }},
}

// Runs every scanner on PATH against the pristine copy, as the unprivileged user.
func scanPhase(dir string, budget time.Duration) (Phase, []ScannerFinding) {
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), budget)
	defer cancel()
	var findings []ScannerFinding
	var ran, gaps []string
	for _, s := range scanners {
		bin, err := exec.LookPath(s.name)
		if err != nil {
			gaps = append(gaps, s.name+" not installed")
			continue
		}
		args, skip := s.args(dir)
		if skip != "" {
			gaps = append(gaps, s.name+": "+skip)
			continue
		}
		out, err := runCapped(ctx, bin, args, dir)
		if ctx.Err() != nil {
			gaps = append(gaps, s.name+" cut off at the scan budget")
			continue
		}
		if err != nil {
			gaps = append(gaps, fmt.Sprintf("%s failed: %v", s.name, err))
			continue
		}
		got, err := s.parse(out, dir)
		if err != nil {
			gaps = append(gaps, fmt.Sprintf("%s output unreadable: %v", s.name, err))
			continue
		}
		ran = append(ran, s.name)
		findings = append(findings, got...)
	}
	phase := Phase{Name: "scan", Status: "ran", DurationMs: time.Since(start).Milliseconds()}
	switch {
	case ctx.Err() != nil:
		phase.Status = "timed_out"
	case len(ran) == 0:
		phase.Status = "skipped"
	}
	if len(gaps) > 0 {
		phase.Reason = strings.Join(gaps, "; ")
	}
	return phase, findings
}

type cappedBuffer struct {
	bytes.Buffer
	over bool
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	if c.Len()+len(p) > maxScannerOutput {
		c.over = true
		return len(p), nil
	}
	return c.Buffer.Write(p)
}

func runCapped(ctx context.Context, bin string, args []string, dir string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = dir
	cmd.Env = toolEnv()
	cmd.SysProcAttr = unprivileged()
	var out cappedBuffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	if out.over {
		return nil, fmt.Errorf("output over %d bytes", maxScannerOutput)
	}
	return out.Bytes(), nil
}
