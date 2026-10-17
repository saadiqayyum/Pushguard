package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Mirrored by PHASE_BUDGET_MS in lib/runner/limits.ts; the server flags claims above them.
const (
	installBudget = 10 * time.Minute
	importBudget  = 2 * time.Minute
	executeBudget = 5 * time.Minute
	scanBudget    = 10 * time.Minute
	checkBudget   = 2 * time.Minute
	fetchTimeout  = 5 * time.Minute
	reportTimeout = time.Minute
	maxTarball    = 200 << 20
)

const installScript = "npm rebuild --foreground-scripts && npm run --if-present preinstall && npm run --if-present install && npm run --if-present postinstall && npm run --if-present prepare"

var (
	tokenShape = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	repoShape  = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
)

func main() {
	log.SetFlags(0)
	nonce, endpoint, kind := os.Getenv("PUSHGUARD_NONCE"), strings.TrimRight(os.Getenv("PUSHGUARD_ENDPOINT"), "/"), os.Getenv("PUSHGUARD_KIND")
	if uid, err := strconv.ParseUint(os.Getenv("SUDO_UID"), 10, 32); err == nil {
		toolUID = uint32(uid)
	}
	if gid, err := strconv.ParseUint(os.Getenv("SUDO_GID"), 10, 32); err == nil {
		toolGID = uint32(gid)
	}
	for _, name := range []string{"PUSHGUARD_NONCE", "PUSHGUARD_ENDPOINT", "PUSHGUARD_KIND"} {
		os.Unsetenv(name)
	}
	if !tokenShape.MatchString(nonce) || !strings.HasPrefix(endpoint, "https://") || (kind != "scan" && kind != "detonate") {
		log.Fatal("detonator: PUSHGUARD_NONCE, an https PUSHGUARD_ENDPOINT and PUSHGUARD_KIND=scan|detonate are required")
	}

	work, err := os.MkdirTemp("", "pushguard-")
	if err != nil {
		log.Fatal(err)
	}
	defer os.RemoveAll(work)
	os.Chmod(work, 0o711)
	toolHome = filepath.Join(work, "tool")
	os.Mkdir(toolHome, 0o700)
	os.Lchown(toolHome, int(toolUID), int(toolGID))

	tarball, reportToken, repo, plan, err := fetch(endpoint, nonce, work)
	if err != nil {
		log.Fatalf("detonator: fetch: %v", err)
	}
	report := analyse(kind, tarball, repo, work, plan)
	report.fit()
	if err := post(endpoint, reportToken, report); err != nil {
		log.Fatalf("detonator: report: %v", err)
	}
}

// The nonce is spent here, before any repository code exists on disk.
func fetch(endpoint, nonce, work string) (tarball, reportToken, repo string, plan runPlan, err error) {
	body, _ := json.Marshal(map[string]string{"nonce": nonce})
	client := http.Client{Timeout: fetchTimeout}
	resp, err := client.Post(endpoint+"/fetch", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", "", "", plan, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", "", plan, fmt.Errorf("status %d", resp.StatusCode)
	}
	reportToken, repo = resp.Header.Get("X-Pushguard-Report-Token"), resp.Header.Get("X-Pushguard-Repo")
	if !tokenShape.MatchString(reportToken) || !repoShape.MatchString(repo) {
		return "", "", "", plan, errors.New("malformed fetch response headers")
	}
	plan = planFrom(resp.Header.Get("X-Pushguard-Phases"))
	if header := resp.Header.Get("X-Pushguard-Check"); header != "" {
		if plan.check, err = readCheck(header, resp.Body); err != nil {
			return "", "", "", plan, fmt.Errorf("check script: %w", err)
		}
	}
	tarball = filepath.Join(work, "repo.tar.gz")
	f, err := os.OpenFile(tarball, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", "", "", plan, err
	}
	defer f.Close()
	n, err := io.Copy(f, io.LimitReader(resp.Body, maxTarball+1))
	if err != nil {
		return "", "", "", plan, err
	}
	if n > maxTarball {
		return "", "", "", plan, fmt.Errorf("tarball over %d bytes", maxTarball)
	}
	return tarball, reportToken, repo, plan, f.Close()
}

func analyse(kind, tarball, repo, work string, plan runPlan) Report {
	var r Report
	pristine := filepath.Join(work, "src")
	if err := unpackFile(tarball, pristine); err != nil {
		reason := "archive refused: " + err.Error()
		if kind == "detonate" {
			r.Phases = skipped("failed", reason)
		}
		r.Phases = append(r.Phases, Phase{Name: "scan", Status: "failed", Reason: reason})
		return r
	}
	if kind == "detonate" {
		var checked []ScannerFinding
		r.Phases, r.Observations, r.Truncated, checked = detonate(tarball, repo, work, plan)
		r.ScannerFindings = append(r.ScannerFindings, checked...)
	} else {
		r.Observations = emptyObservations()
	}
	scan, findings := scanPhase(pristine, scanBudget)
	r.Phases = append(r.Phases, scan)
	r.ScannerFindings = append(r.ScannerFindings, findings...)
	return r
}

func unpackFile(tarball, dest string) error {
	f, err := os.Open(tarball)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	return unpack(f, dest)
}

func skipped(status, reason string) []Phase {
	return []Phase{{Name: "install", Status: status, Reason: reason}, {Name: "import", Status: status, Reason: reason}, {Name: "execute", Status: status, Reason: reason}}
}

func emptyObservations() Observations {
	var s set
	return Observations{Hosts: s.list(), Processes: s.list(), EnvReads: s.list(), WritesOutsideProject: s.list(), CanaryTouches: s.list()}
}

// Never falls back to running the payload outside isolate: a missing piece is a skipped phase.
func detonate(tarball, repo, work string, plan runPlan) ([]Phase, Observations, bool, []ScannerFinding) {
	skip := func(reason string) ([]Phase, Observations, bool, []ScannerFinding) {
		return plan.skippedAll(reason), emptyObservations(), false, nil
	}
	if runtime.GOOS != "linux" {
		return skip("detonation needs Linux")
	}
	if os.Geteuid() != 0 {
		return skip("detonator is not root, so it cannot stage a home for the box user")
	}
	isolate, err := exec.LookPath("isolate")
	if err != nil {
		return skip("isolate is not installed and the payload is never run unsandboxed")
	}
	strace, err := exec.LookPath("strace")
	if err != nil {
		return skip("strace is not installed, so nothing could be observed")
	}
	npm, err := exec.LookPath("npm")
	if err != nil {
		return skip("npm is not installed")
	}

	home := "/home/" + sandboxUser
	if _, err := os.Lstat(home); err == nil {
		return skip(home + " already exists on this runner")
	}
	project := filepath.Join(home, "projects", path.Base(repo))
	if err := unpackFile(tarball, project); err != nil {
		return skip("could not unpack into the staged home: " + err.Error())
	}
	pkg, err := os.ReadFile(filepath.Join(project, "package.json"))
	if err != nil {
		return skip("no package.json: only npm projects are detonated")
	}
	if err := chownTree(home, int(toolUID), int(toolGID)); err != nil {
		return skip("could not hand the project to the prefetch user: " + err.Error())
	}

	start := time.Now()
	if err := prefetch(npm, project); err != nil {
		phases := plan.skippedAll("install did not complete")
		phases[0] = Phase{Name: "install", Status: "failed", Reason: "dependency prefetch failed: " + err.Error(), DurationMs: time.Since(start).Milliseconds()}
		return phases, emptyObservations(), false, nil
	}
	prefetchTime := time.Since(start)

	canaries, err := stageHome(home)
	if err != nil {
		return skip("could not stage decoy credentials: " + err.Error())
	}
	before := snapshot(home, project)
	if err := chownTree(home, boxUID, boxUID); err != nil {
		return skip("could not hand the home to the box user: " + err.Error())
	}
	b, err := openBox(isolate, strace, work, home, project)
	if err != nil {
		return skip(err.Error())
	}
	defer b.cleanup()

	tr := newTracer(traceScope{home: home, project: project, canaries: canaries})
	install := plan.notRequested("install")
	if plan.wants("install") {
		install = b.run("install", installScript, max(installBudget-prefetchTime, time.Second), tr)
		install.DurationMs += prefetchTime.Milliseconds()
	}
	if b.note != "" {
		install.Reason = strings.TrimPrefix(install.Reason+"; "+b.note, "; ")
	}
	phases := []Phase{install, plan.notRequested("import")}
	if plan.wants("import") {
		phases[1] = b.run("import", `node -e "require('./')"`, importBudget, tr)
	}
	switch {
	case !plan.wants("execute"):
		phases = append(phases, plan.notRequested("execute"))
	case hasTestScript(pkg):
		phases = append(phases, b.run("execute", "npm test", executeBudget, tr))
	default:
		phases = append(phases, Phase{Name: "execute", Status: "skipped", Reason: "package.json has no test script"})
	}

	for _, p := range changed(before, snapshot(home, project)) {
		tr.writes.add(p)
		for _, c := range canaries {
			if strings.HasPrefix(p, c) {
				tr.canary.add(p + " (modified)")
			}
		}
	}
	obs, dropped := tr.observations()
	var checked []ScannerFinding
	if plan.wants("check") {
		var check Phase
		check, checked = b.runCheck(plan.check, work)
		phases = append(phases, check)
	}
	return phases, obs, dropped, checked
}

// Outside the box, with network, and with --ignore-scripts so no package code runs here.
func prefetch(npm, project string) error {
	args := []string{"install", "--ignore-scripts", "--no-audit", "--no-fund"}
	if _, err := os.Stat(filepath.Join(project, "package-lock.json")); err == nil {
		args[0] = "ci"
	}
	ctx, cancel := context.WithTimeout(context.Background(), installBudget)
	defer cancel()
	cmd := exec.CommandContext(ctx, npm, args...)
	cmd.Dir = project
	cmd.Env = toolEnv()
	cmd.SysProcAttr = unprivileged()
	return cmd.Run()
}

func hasTestScript(pkg []byte) bool {
	var manifest struct {
		Scripts map[string]string `json:"scripts"`
	}
	return json.Unmarshal(pkg, &manifest) == nil && strings.TrimSpace(manifest.Scripts["test"]) != ""
}

func post(endpoint, reportToken string, report Report) error {
	body, err := json.Marshal(report)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, endpoint+"/report", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+reportToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: reportTimeout}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}
