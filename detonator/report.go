package main

import (
	"strings"
	"unicode/utf8"
)

// Mirrored from schemas/runner.ts. The server rejects anything larger.
const (
	maxObservations    = 500
	maxScannerFindings = 500
	maxObservationLen  = 1024
	maxReasonLen       = 600
	maxToolLen         = 80
)

type Phase struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	Reason     string `json:"reason,omitempty"`
	DurationMs int64  `json:"durationMs"`
}

type Observations struct {
	Hosts                []string `json:"hosts"`
	Processes            []string `json:"processes"`
	EnvReads             []string `json:"envReads"`
	WritesOutsideProject []string `json:"writesOutsideProject"`
	CanaryTouches        []string `json:"canaryTouches"`
}

type ScannerFinding struct {
	Tool     string `json:"tool"`
	RuleID   string `json:"ruleId"`
	Severity string `json:"severity"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	Message  string `json:"message"`
}

type Report struct {
	Phases          []Phase          `json:"phases"`
	Observations    Observations     `json:"observations"`
	ScannerFindings []ScannerFinding `json:"scannerFindings"`
	Truncated       bool             `json:"truncated"`
}

func clip(s string, n int) string {
	s = strings.ToValidUTF8(s, "?")
	if len(s) <= n {
		return s
	}
	s = s[:n]
	for len(s) > 0 && !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s
}

// An ordered, deduplicated, capped list of observations.
type set struct {
	seen    map[string]bool
	items   []string
	dropped bool
}

func (s *set) add(v string) {
	v = clip(v, maxObservationLen)
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	if s.seen[v] {
		return
	}
	if len(s.items) >= maxObservations {
		s.dropped = true
		return
	}
	s.seen[v] = true
	s.items = append(s.items, v)
}

func (s *set) list() []string {
	if s.items == nil {
		return []string{}
	}
	return s.items
}

// Caps everything to the server's limits and never sends null arrays.
func (r *Report) fit() {
	if r.Phases == nil {
		r.Phases = []Phase{}
	}
	for i := range r.Phases {
		r.Phases[i].Reason = clip(r.Phases[i].Reason, maxReasonLen)
	}
	if len(r.ScannerFindings) > maxScannerFindings {
		r.ScannerFindings = r.ScannerFindings[:maxScannerFindings]
		r.Truncated = true
	}
	if r.ScannerFindings == nil {
		r.ScannerFindings = []ScannerFinding{}
	}
	for i := range r.ScannerFindings {
		f := &r.ScannerFindings[i]
		f.Tool, f.RuleID, f.File, f.Message = clip(f.Tool, maxToolLen), clip(f.RuleID, 200), clip(f.File, maxObservationLen), clip(f.Message, maxReasonLen)
	}
}
