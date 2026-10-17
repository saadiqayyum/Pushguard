package main

import "strings"

// Which phases the server asked for. No header means the default three; the
// check phase runs only when asked for.
type runPlan struct {
	phases map[string]bool
	check  *checkScript
}

var detonatePhases = []string{"install", "import", "execute", "check"}

func planFrom(header string) runPlan {
	if strings.TrimSpace(header) == "" {
		return runPlan{}
	}
	p := runPlan{phases: map[string]bool{}}
	for _, name := range strings.Split(header, ",") {
		for _, known := range detonatePhases {
			if strings.TrimSpace(name) == known {
				p.phases[known] = true
			}
		}
	}
	return p
}

func (p runPlan) wants(phase string) bool {
	if p.phases == nil {
		return phase != "check"
	}
	return p.phases[phase]
}

func (p runPlan) notRequested(phase string) Phase {
	return Phase{Name: phase, Status: "skipped", Reason: "not requested for this detonation"}
}

func (p runPlan) skippedAll(reason string) []Phase {
	phases := skipped("skipped", reason)
	if p.wants("check") {
		phases = append(phases, Phase{Name: "check", Status: "skipped", Reason: reason})
	}
	return phases
}
