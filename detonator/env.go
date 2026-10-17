package main

import "strings"

// A plausible developer, not "runner": the payload sees this user, home and cwd.
const (
	sandboxUser = "alex"
	sandboxPath = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)

var ciPrefixes = []string{"GITHUB_", "RUNNER_", "ACTIONS_", "PUSHGUARD_", "INPUT_", "STATE_"}

var ciNames = map[string]bool{
	"CI": true, "CONTINUOUS_INTEGRATION": true, "BUILD_NUMBER": true, "RUN_ID": true,
	"ImageOS": true, "ImageVersion": true, "AGENT_TOOLSDIRECTORY": true, "INVOCATION_ID": true,
	"SUDO_COMMAND": true, "SUDO_USER": true, "SUDO_UID": true, "SUDO_GID": true,
}

// For tools run outside the box (prefetch, scanners): the parent env without CI tells or tokens.
func scrubEnv(environ []string) []string {
	out := make([]string, 0, len(environ))
next:
	for _, kv := range environ {
		name, _, _ := strings.Cut(kv, "=")
		if ciNames[name] {
			continue
		}
		for _, prefix := range ciPrefixes {
			if strings.HasPrefix(name, prefix) {
				continue next
			}
		}
		out = append(out, kv)
	}
	return out
}

// For the box: built from nothing, so nothing from the runner leaks in by default.
func curatedEnv(home string) []string {
	return []string{
		"HOME=" + home,
		"USER=" + sandboxUser,
		"LOGNAME=" + sandboxUser,
		"PATH=" + sandboxPath,
		"LANG=en_US.UTF-8",
		"TERM=xterm-256color",
		"SHELL=/bin/bash",
	}
}
