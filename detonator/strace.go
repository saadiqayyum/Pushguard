package main

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"path"
	"regexp"
	"strconv"
	"strings"
)

// Lines are produced by: strace -f -x -s 256 -e trace=network,process,file -o FILE.
var (
	pidLine  = regexp.MustCompile(`^(\d+)\s+(.*)$`)
	quoted   = regexp.MustCompile(`"((?:[^"\\]|\\.)*)"`)
	execLine = regexp.MustCompile(`^execve\("((?:[^"\\]|\\.)*)", \[(.*?)\]`)
	openLine = regexp.MustCompile(`^(open|openat|openat2|creat)\((?:[^",]+, )?"((?:[^"\\]|\\.)*)"(?:, ([A-Z0-9_|]+))?`)
	forkLine = regexp.MustCompile(`^(?:clone3?|fork|vfork|<\.\.\. (?:clone3?|fork|vfork) resumed>).*= (\d+)$`)
	connLine = regexp.MustCompile(`^connect\(\d+, \{sa_family=AF_INET6?, sin6?_port=htons\((\d+)\),.*?(?:inet_addr\("([^"]+)"\)|inet_pton\(AF_INET6, "([^"]+)")`)
	sendLine = regexp.MustCompile(`^(sendto|sendmsg|sendmmsg)\(`)
	pathCall = regexp.MustCompile(`^(mkdir|mkdirat|unlink|unlinkat|rmdir|rename|renameat|renameat2|symlink|symlinkat|link|linkat|chmod|fchmodat|truncate|utimensat)\(`)
)

const writeFlags = "O_WRONLY|O_RDWR|O_CREAT|O_TRUNC|O_APPEND"

// Paths a well-behaved install writes to that are not the project.
var writeAllowed = []string{"/dev/", "/proc/", "/tmp/", "/box/"}

type traceScope struct {
	home     string
	project  string
	canaries []string
}

type tracer struct {
	scope     traceScope
	label     map[string]string
	hosts     set
	processes set
	envReads  set
	writes    set
	canary    set
}

func newTracer(scope traceScope) *tracer {
	return &tracer{scope: scope, label: map[string]string{}}
}

func (t *tracer) parse(r io.Reader) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		t.line(sc.Text())
	}
	return sc.Err()
}

func (t *tracer) line(raw string) {
	m := pidLine.FindStringSubmatch(raw)
	if m == nil {
		return
	}
	pid, call := m[1], m[2]
	if f := forkLine.FindStringSubmatch(call); f != nil {
		t.label[f[1]] = t.label[pid]
		return
	}
	if e := execLine.FindStringSubmatch(call); e != nil {
		exe := unescape(e[1])
		t.processes.add(exe)
		t.label[pid] = processLabel(exe, e[2])
		return
	}
	if o := openLine.FindStringSubmatch(call); o != nil {
		write := o[1] == "creat" || hasAnyFlag(o[3], writeFlags)
		t.path(pid, unescape(o[2]), write)
		return
	}
	if pathCall.MatchString(call) {
		for _, q := range quoted.FindAllStringSubmatch(call, -1) {
			t.path(pid, unescape(q[1]), true)
		}
		return
	}
	if c := connLine.FindStringSubmatch(call); c != nil {
		addr := c[2] + c[3]
		if ip := net.ParseIP(addr); ip != nil && !ip.IsLoopback() && !ip.IsUnspecified() {
			t.hosts.add(net.JoinHostPort(addr, c[1]))
		}
		return
	}
	if sendLine.MatchString(call) {
		for _, q := range quoted.FindAllStringSubmatch(call, -1) {
			if name := dnsQuestion([]byte(unescape(q[1]))); name != "" {
				t.hosts.add("dns:" + name)
			}
		}
	}
}

// ponytail: a relative path is taken as cwd-relative (the project), so a dirfd-relative
// open is misattributed; track fd->path from openat results if that matters.
func (t *tracer) path(pid, p string, write bool) {
	if p == "" {
		return
	}
	if !strings.HasPrefix(p, "/") {
		p = path.Join(t.scope.project, p)
	}
	p = path.Clean(p)
	by := t.label[pid]
	if procEnviron(p) {
		t.envReads.add(fmt.Sprintf("%s (by %s)", p, by))
	}
	if t.isCanary(p) && !expectedReader(p, by) {
		t.canary.add(fmt.Sprintf("%s (by %s)", p, by))
	}
	if write && !t.inside(p) {
		t.writes.add(p)
	}
}

func (t *tracer) inside(p string) bool {
	if p == t.scope.project || strings.HasPrefix(p, t.scope.project+"/") || p == "/dev/null" {
		return true
	}
	if strings.HasPrefix(p, t.scope.home+"/.npm/") {
		return true
	}
	for _, prefix := range writeAllowed {
		if strings.HasPrefix(p, prefix) {
			return true
		}
	}
	return false
}

func (t *tracer) isCanary(p string) bool {
	ssh := t.scope.home + "/.ssh"
	if p == ssh || strings.HasPrefix(p, ssh+"/") {
		return true
	}
	for _, c := range t.scope.canaries {
		if p == c {
			return true
		}
	}
	return false
}

// npm reads ~/.npmrc and git reads ~/.gitconfig on every run; anyone else reading them is the signal.
func expectedReader(p, by string) bool {
	switch path.Base(p) {
	case ".npmrc":
		return by == "npm"
	case ".gitconfig":
		return strings.HasPrefix(by, "git")
	}
	return false
}

func procEnviron(p string) bool {
	parts := strings.Split(p, "/")
	return len(parts) == 4 && parts[1] == "proc" && parts[3] == "environ" && parts[2] != ""
}

// "node .../npm-cli.js" is npm, not node.
func processLabel(exe, argv string) string {
	if strings.Contains(argv, "npm-cli.js") {
		return "npm"
	}
	if strings.Contains(argv, "npx-cli.js") {
		return "npx"
	}
	return path.Base(exe)
}

func hasAnyFlag(flags, want string) bool {
	for _, f := range strings.Split(flags, "|") {
		for _, w := range strings.Split(want, "|") {
			if f == w {
				return true
			}
		}
	}
	return false
}

// Reverses strace's string escaping (-x prints non-printables as \xHH).
func unescape(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] != '\\' || i+1 >= len(s) {
			b.WriteByte(s[i])
			continue
		}
		i++
		switch c := s[i]; c {
		case 'n':
			b.WriteByte('\n')
		case 't':
			b.WriteByte('\t')
		case 'r':
			b.WriteByte('\r')
		case 'v':
			b.WriteByte('\v')
		case 'f':
			b.WriteByte('\f')
		case 'x':
			if i+2 < len(s) {
				if v, err := strconv.ParseUint(s[i+1:i+3], 16, 8); err == nil {
					b.WriteByte(byte(v))
					i += 2
					continue
				}
			}
			b.WriteByte(c)
		default:
			if c >= '0' && c <= '7' {
				j := i
				for j < len(s) && j < i+3 && s[j] >= '0' && s[j] <= '7' {
					j++
				}
				v, _ := strconv.ParseUint(s[i:j], 8, 8)
				b.WriteByte(byte(v))
				i = j - 1
				continue
			}
			b.WriteByte(c)
		}
	}
	return b.String()
}

// The name in a single-question DNS query, or "" if the bytes are not one.
func dnsQuestion(msg []byte) string {
	if len(msg) < 17 || msg[2]&0x80 != 0 || msg[4] != 0 || msg[5] != 1 {
		return ""
	}
	var labels []string
	i := 12
	for i < len(msg) {
		n := int(msg[i])
		if n == 0 {
			if len(labels) == 0 || i+5 > len(msg) {
				return ""
			}
			return strings.Join(labels, ".")
		}
		if n > 63 || i+1+n > len(msg) {
			return ""
		}
		label := msg[i+1 : i+1+n]
		for _, c := range label {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
				return ""
			}
		}
		labels = append(labels, string(label))
		i += 1 + n
	}
	return ""
}

func (t *tracer) observations() (Observations, bool) {
	return Observations{
		Hosts:                t.hosts.list(),
		Processes:            t.processes.list(),
		EnvReads:             t.envReads.list(),
		WritesOutsideProject: t.writes.list(),
		CanaryTouches:        t.canary.list(),
	}, t.hosts.dropped || t.processes.dropped || t.envReads.dropped || t.writes.dropped || t.canary.dropped
}
