package main

import (
	"slices"
	"strings"
	"testing"
)

func TestScrubEnvDropsCITells(t *testing.T) {
	in := []string{"CI=true", "GITHUB_TOKEN=x", "RUNNER_OS=Linux", "ACTIONS_RUNTIME_TOKEN=y", "PUSHGUARD_NONCE=n", "ImageOS=ubuntu24", "HOME=/root", "PATH=/bin", "CIRCLE=keep"}
	got := scrubEnv(in)
	want := []string{"HOME=/root", "PATH=/bin", "CIRCLE=keep"}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestCuratedEnvIsAllowlist(t *testing.T) {
	for _, kv := range curatedEnv("/home/alex") {
		name, _, _ := strings.Cut(kv, "=")
		if !slices.Contains([]string{"HOME", "USER", "LOGNAME", "PATH", "LANG", "TERM", "SHELL"}, name) {
			t.Fatalf("unexpected %s", name)
		}
		if strings.Contains(kv, "hostedtoolcache") || strings.Contains(kv, "runner") {
			t.Fatalf("CI tell in %s", kv)
		}
	}
}
