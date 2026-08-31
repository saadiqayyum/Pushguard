// .pth file in site-packages runs on every interpreter start.
export const python = [
  {
    id: "py-install-hook-added",
    description: "Python packaging hook that runs code at install time",
    severity: "critical",
    paths: ["**/setup.py", "**/pyproject.toml", "**/setup.cfg", "**/conftest.py"],
    added_lines: "cmdclass|build_py|install_requires\\s*=|\\[build-system\\]|setuptools\\.setup",
  },
  {
    id: "py-dynamic-execution",
    description: "Dynamic execution or deserialisation that runs code",
    severity: "high",
    paths: ["**/*.py", "**/*.pyi"],
    added_lines: "\\bexec\\(|\\beval\\(|__import__\\(|pickle\\.loads|marshal\\.loads|yaml\\.load\\(",
  },
  {
    id: "py-obfuscated-payload",
    description: "Long base64 blob or encoded payload added to Python source",
    severity: "high",
    paths: ["**/*.py"],
    added_lines: "base64\\.b64decode|codecs\\.decode|[A-Za-z0-9+/]{200,}={0,2}",
  },
  {
    id: "py-requirements-from-url",
    description: "A requirement pointing at a URL, VCS ref, or extra index",
    severity: "high",
    paths: ["**/requirements*.txt", "**/constraints*.txt", "**/Pipfile"],
    added_lines: "^\\s*(-e |--extra-index-url|--index-url|git\\+|https?://)",
  },
  {
    id: "py-sitecustomize",
    description: "A module Python imports automatically at interpreter start",
    severity: "critical",
    paths: ["**/sitecustomize.py", "**/usercustomize.py", "**/*.pth"],
    change_type: ["added", "modified"],
  },
] as const
