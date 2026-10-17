package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type entry struct {
	name, body, link string
	kind             byte
}

func tarball(t *testing.T, entries ...entry) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for _, e := range entries {
		kind := e.kind
		if kind == 0 {
			kind = tar.TypeReg
		}
		hdr := &tar.Header{Name: e.name, Typeflag: kind, Mode: 0o644, Size: int64(len(e.body)), Linkname: e.link}
		if kind != tar.TypeReg {
			hdr.Size = 0
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatal(err)
		}
		if kind == tar.TypeReg {
			tw.Write([]byte(e.body))
		}
	}
	tw.Close()
	gz.Close()
	return &buf
}

func TestUnpackStripsTopDirectory(t *testing.T) {
	dest := t.TempDir()
	err := unpack(tarball(t,
		entry{name: "acme-api-abc123/", kind: tar.TypeDir},
		entry{name: "acme-api-abc123/package.json", body: "{}"},
		entry{name: "acme-api-abc123/lib/link", link: "../package.json", kind: tar.TypeSymlink},
	), dest)
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "package.json")); string(b) != "{}" {
		t.Fatalf("got %q", b)
	}
}

func TestUnpackRefusesEscapes(t *testing.T) {
	cases := map[string][]entry{
		"absolute":       {{name: "/etc/passwd", body: "x"}},
		"dotdot":         {{name: "top/../../evil", body: "x"}},
		"abs symlink":    {{name: "top/l", link: "/etc", kind: tar.TypeSymlink}},
		"escape symlink": {{name: "top/l", link: "../../..", kind: tar.TypeSymlink}},
		"through link":   {{name: "top/l", link: ".", kind: tar.TypeSymlink}, {name: "top/l/x", body: "x"}},
		"hardlink":       {{name: "top/h", link: "top/x", kind: tar.TypeLink}},
	}
	for name, entries := range cases {
		dest := t.TempDir()
		if err := unpack(tarball(t, entries...), dest); err == nil {
			t.Errorf("%s: expected refusal", name)
		}
	}
}

func TestUnpackCapsSizeAndCount(t *testing.T) {
	defer func(b int64, f int) { maxUnpackBytes, maxUnpackFiles = b, f }(maxUnpackBytes, maxUnpackFiles)
	maxUnpackBytes, maxUnpackFiles = 25, 3
	body := strings.Repeat("a", 10)
	three := []entry{{name: "top/a", body: body}, {name: "top/b", body: body}, {name: "top/c", body: body}}
	if err := unpack(tarball(t, three...), t.TempDir()); err == nil || !strings.Contains(err.Error(), "expands") {
		t.Fatalf("expected size cap, got %v", err)
	}
	maxUnpackBytes = 1 << 20
	four := append(three, entry{name: "top/d", body: body})
	if err := unpack(tarball(t, four...), t.TempDir()); err == nil || !strings.Contains(err.Error(), "entries") {
		t.Fatalf("expected count cap, got %v", err)
	}
}
