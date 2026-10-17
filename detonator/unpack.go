package main

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Zip-bomb caps: a repository past these is not unpacked at all. Vars only so tests can shrink them.
var (
	maxUnpackBytes int64 = 1 << 30
	maxUnpackFiles       = 100_000
)

// Unpacks a GitHub tarball into dest, dropping its "owner-repo-sha/" top directory.
// Absolute names, "..", hard links, devices and escaping symlinks are refused, and
// nothing is written through a symlink, so a crafted archive cannot leave dest.
func unpack(r io.Reader, dest string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return err
	}
	tr := tar.NewReader(gz)
	var files int
	budget := maxUnpackBytes
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		if hdr.Typeflag == tar.TypeXGlobalHeader {
			continue
		}
		if files++; files > maxUnpackFiles {
			return fmt.Errorf("more than %d entries", maxUnpackFiles)
		}
		rel, err := entryPath(hdr.Name)
		if err != nil || rel == "" {
			if err != nil {
				return err
			}
			continue
		}
		target := filepath.Join(dest, rel)
		if err := noSymlinkParents(dest, rel); err != nil {
			return err
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if hdr.Size > budget {
				return fmt.Errorf("archive expands past %d bytes", maxUnpackBytes)
			}
			budget -= hdr.Size
			if err := writeFile(target, tr, hdr); err != nil {
				return err
			}
		case tar.TypeSymlink:
			if err := linkInside(dest, rel, hdr.Linkname); err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			if err := os.Symlink(hdr.Linkname, target); err != nil {
				return err
			}
		default:
			return fmt.Errorf("refusing entry type %q: %s", hdr.Typeflag, hdr.Name)
		}
	}
}

func entryPath(name string) (string, error) {
	if strings.HasPrefix(name, "/") || filepath.IsAbs(name) {
		return "", fmt.Errorf("absolute path: %s", name)
	}
	for _, part := range strings.Split(name, "/") {
		if part == ".." {
			return "", fmt.Errorf("parent reference: %s", name)
		}
	}
	_, rest, _ := strings.Cut(filepath.Clean(name), string(filepath.Separator))
	return rest, nil
}

func noSymlinkParents(dest, rel string) error {
	dir := dest
	parts := strings.Split(filepath.Dir(rel), string(filepath.Separator))
	for _, part := range parts {
		if part == "." {
			continue
		}
		dir = filepath.Join(dir, part)
		info, err := os.Lstat(dir)
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("path through symlink: %s", rel)
		}
	}
	return nil
}

func linkInside(dest, rel, link string) error {
	if filepath.IsAbs(link) || strings.HasPrefix(link, "/") {
		return fmt.Errorf("absolute symlink: %s -> %s", rel, link)
	}
	resolved := filepath.Join(dest, filepath.Dir(rel), link)
	if resolved != dest && !strings.HasPrefix(resolved, dest+string(filepath.Separator)) {
		return fmt.Errorf("symlink escapes: %s -> %s", rel, link)
	}
	return nil
}

func writeFile(target string, r io.Reader, hdr *tar.Header) error {
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	mode := os.FileMode(0o644)
	if hdr.Mode&0o111 != 0 {
		mode = 0o755
	}
	f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := io.CopyN(f, r, hdr.Size); err != nil {
		return err
	}
	return f.Close()
}
