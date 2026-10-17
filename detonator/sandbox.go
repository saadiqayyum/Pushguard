package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// isolate's default first_uid/gid plus box 0: the uid the payload runs as.
const (
	boxID        = 0
	boxUID       = 60000 + boxID
	boxMemKB     = 2 << 20
	boxProcesses = 256
	boxFileKB    = 1 << 20
	maxSnapshot  = 100_000
)

// Owner of everything run outside the box: the sudo caller, never root.
var (
	toolUID  uint32 = 65534
	toolGID  uint32 = 65534
	toolHome string
)

func unprivileged() *syscall.SysProcAttr {
	if os.Geteuid() != 0 {
		return nil
	}
	return &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: toolUID, Gid: toolGID}}
}

func toolEnv() []string {
	env := []string{}
	for _, kv := range scrubEnv(os.Environ()) {
		if !strings.HasPrefix(kv, "HOME=") {
			env = append(env, kv)
		}
	}
	return append(env, "HOME="+toolHome)
}

func chownTree(root string, uid, gid int) error {
	return filepath.WalkDir(root, func(p string, _ fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		return os.Lchown(p, uid, gid)
	})
}

func token(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// Decoy credentials, each carrying a unique value, at the paths stealers read first.
func stageHome(home string) ([]string, error) {
	key := base64.StdEncoding.EncodeToString([]byte("openssh-key-v1\x00pushguard-canary-" + token(24)))
	files := map[string]string{
		".ssh/id_ed25519":     "-----BEGIN OPENSSH PRIVATE KEY-----\n" + key + "\n-----END OPENSSH PRIVATE KEY-----\n",
		".ssh/id_ed25519.pub": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA" + token(16) + " " + sandboxUser + "@laptop\n",
		".gitconfig":          "[user]\n\tname = Alex Morgan\n\temail = alex." + token(4) + "@users.noreply.github.com\n",
		".npmrc":              "//registry.npmjs.org/:_authToken=npm_" + token(18) + "\n",
	}
	var paths []string
	for rel, body := range files {
		p := filepath.Join(home, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			return nil, err
		}
		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			return nil, err
		}
		paths = append(paths, p)
	}
	return paths, nil
}

// size, mtime and mode per file under root, minus the project the payload may freely change.
func snapshot(root, skip string) map[string]string {
	out := map[string]string{}
	filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if len(out) >= maxSnapshot {
			return filepath.SkipAll
		}
		if err != nil {
			return nil
		}
		if p == skip || p == filepath.Join(root, ".npm") {
			return filepath.SkipDir
		}
		if info, err := d.Info(); err == nil {
			out[p] = fmt.Sprintf("%d:%d:%v", info.Size(), info.ModTime().UnixNano(), info.Mode())
		}
		return nil
	})
	return out
}

func changed(before, after map[string]string) []string {
	var out []string
	for p, v := range after {
		if before[p] != v {
			out = append(out, p)
		}
	}
	for p := range before {
		if _, ok := after[p]; !ok {
			out = append(out, p+" (deleted)")
		}
	}
	return out
}

type box struct {
	isolate, strace string
	dir             string
	work            string
	home, project   string
	cg              bool
	note            string
}

func openBox(isolate, strace, work, home, project string) (*box, error) {
	b := &box{isolate: isolate, strace: strace, work: work, home: home, project: project, cg: true}
	out, err := exec.Command(isolate, "--box-id="+strconv.Itoa(boxID), "--cg", "--init").Output()
	if err != nil {
		exec.Command(isolate, "--box-id="+strconv.Itoa(boxID), "--cleanup").Run()
		b.cg, b.note = false, "cgroup v2 limits unavailable, so no memory cap; process and file-size rlimits still apply"
		if out, err = exec.Command(isolate, "--box-id="+strconv.Itoa(boxID), "--init").Output(); err != nil {
			return nil, fmt.Errorf("isolate --init: %w", err)
		}
	}
	b.dir = filepath.Join(strings.TrimSpace(string(out)), "box")
	return b, nil
}

func (b *box) cleanup() {
	args := []string{"--box-id=" + strconv.Itoa(boxID), "--cleanup"}
	if b.cg {
		args = append(args, "--cg")
	}
	exec.Command(b.isolate, args...).Run()
}

// Runs one phase in the box, with no network, and under strace when tr is set.
func (b *box) run(name, shell string, budget time.Duration, tr *tracer, extra ...string) Phase {
	start := time.Now()
	meta := filepath.Join(b.work, "meta-"+name)
	secs := strconv.Itoa(max(int(budget.Seconds()), 1))
	args := []string{
		"--box-id=" + strconv.Itoa(boxID), "--meta=" + meta,
		"--wall-time=" + secs, "--time=" + secs, "--extra-time=5",
		"--processes=" + strconv.Itoa(boxProcesses), "--fsize=" + strconv.Itoa(boxFileKB),
		"--dir=/etc", "--dir=" + b.home + "=" + b.home + ":rw", "--chdir=" + b.project,
	}
	if b.cg {
		args = append(args, "--cg", "--cg-mem="+strconv.Itoa(boxMemKB))
	}
	for _, kv := range curatedEnv(b.home) {
		args = append(args, "--env="+kv)
	}
	args = append(args, extra...)
	if tr != nil {
		args = append(args, "--run", "--", b.strace, "-f", "-x", "-s", "256", "-e", "trace=network,process,file",
			"-o", "/box/trace-"+name, "/bin/sh", "-c", shell)
	} else {
		args = append(args, "--run", "--", "/bin/sh", "-c", shell)
	}

	ctx, cancel := context.WithTimeout(context.Background(), budget+time.Minute)
	defer cancel()
	exec.CommandContext(ctx, b.isolate, args...).Run()
	phase := Phase{Name: name, Status: "ran"}
	status, detail := readMeta(meta)
	switch status {
	case "TO":
		phase.Status, phase.Reason = "timed_out", "cut off at the "+secs+"s budget"
	case "RE", "SG":
		phase.Reason = detail
	case "XX":
		phase.Status, phase.Reason = "failed", "isolate internal error: "+detail
	}
	if ctx.Err() != nil {
		phase.Status, phase.Reason = "timed_out", "isolate did not return within the budget"
	}
	if tr != nil {
		trace, err := os.Open(filepath.Join(b.dir, "trace-"+name))
		if err != nil {
			phase.Status, phase.Reason = "failed", "strace produced no trace, so nothing was observed"
		} else {
			tr.parse(trace)
			trace.Close()
		}
	}
	phase.DurationMs = time.Since(start).Milliseconds()
	return phase
}

func readMeta(path string) (status, detail string) {
	f, err := os.Open(path)
	if err != nil {
		return "XX", "no meta file"
	}
	defer f.Close()
	fields := map[string]string{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		k, v, _ := strings.Cut(sc.Text(), ":")
		fields[k] = v
	}
	switch fields["status"] {
	case "RE":
		return "RE", "exited with status " + fields["exitcode"]
	case "SG":
		return "SG", "killed by signal " + fields["exitsig"]
	case "XX":
		return "XX", fields["message"]
	}
	return fields["status"], ""
}

// Runs a verified check script in the same box as the payload, untraced so its
// own reads are not reported as the payload's. An unverified script never runs.
func (b *box) runCheck(c *checkScript, work string) (Phase, []ScannerFinding) {
	if c == nil {
		return Phase{Name: "check", Status: "skipped", Reason: "no verified check script was served"}, nil
	}
	if err := verifyCheck(c, checkScriptPublicKey); err != nil {
		return Phase{Name: "check", Status: "skipped", Reason: err.Error()}, nil
	}
	dir := filepath.Join(work, "check")
	if err := os.Mkdir(dir, 0o755); err != nil {
		return Phase{Name: "check", Status: "failed", Reason: "could not stage the check script"}, nil
	}
	if err := os.WriteFile(filepath.Join(dir, "script"), c.body, 0o644); err != nil {
		return Phase{Name: "check", Status: "failed", Reason: "could not stage the check script"}, nil
	}
	out := filepath.Join(b.dir, "check-stdout")
	os.RemoveAll(out)
	phase := b.run("check", interpreter[c.meta.Language]+" /pushguard-check/script", checkBudget, nil,
		"--dir=/pushguard-check="+dir, "--stdout=/box/check-stdout")
	f, err := os.OpenFile(out, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return phase, nil
	}
	defer f.Close()
	if info, err := f.Stat(); err != nil || !info.Mode().IsRegular() {
		return phase, nil
	}
	findings, truncated := parseCheckOutput(c.meta.ID, f)
	if truncated {
		phase.Reason = strings.TrimPrefix(phase.Reason+"; check output was cut at its cap", "; ")
	}
	return phase, findings
}
