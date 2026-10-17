package main

import "testing"

const semgrepSARIF = `{"runs":[{"tool":{"driver":{"name":"Semgrep"}},"results":[
 {"ruleId":"js.eval","level":"error","message":{"text":"eval of input"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"file:///work/src/lib/a.js"},"region":{"startLine":12}}}]},
 {"ruleId":"","message":{"text":"no level"},"locations":[]}]}]}`

func TestParseSARIF(t *testing.T) {
	got, err := parseSARIF("semgrep", []byte(semgrepSARIF), "/work/src")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d", len(got))
	}
	want := ScannerFinding{Tool: "semgrep", RuleID: "js.eval", Severity: "high", File: "lib/a.js", Line: 12, Message: "eval of input"}
	if got[0] != want {
		t.Fatalf("got %+v", got[0])
	}
	if got[1].Severity != "medium" || got[1].RuleID != "unnamed" {
		t.Fatalf("defaults: %+v", got[1])
	}
}

func TestParseSARIFForcesSecretSeverity(t *testing.T) {
	got, _ := parseSARIF("gitleaks", []byte(`{"runs":[{"results":[{"ruleId":"aws","level":"note","message":{"text":"secret"}}]}]}`), "/x")
	if got[0].Severity != "high" {
		t.Fatalf("got %s", got[0].Severity)
	}
	if _, err := parseSARIF("semgrep", []byte(`{"runs":[`), "/x"); err == nil {
		t.Fatal("truncated SARIF parsed")
	}
}

func TestParseYara(t *testing.T) {
	got := parseYara([]byte("Miner /work/src/bin/x\n\n"), "/work/src")
	if len(got) != 1 || got[0].RuleID != "Miner" || got[0].File != "bin/x" {
		t.Fatalf("got %+v", got)
	}
}
