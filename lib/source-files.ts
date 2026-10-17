// Files worth reading as code. A lockfile is bytes; a bundle is one line of them.
export const SOURCE_FILE =
  /\.(?:js|mjs|cjs|jsx|ts|tsx|mts|cts|py|rb|php|go|rs|java|kt|scala|cs|c|h|cc|cpp|hpp|swift|sh|bash|zsh|ps1|lua|pl|ex|exs|dart|sql|ya?ml|tf)$/i

// js-x-ray parses these and throws on everything else.
export const JS_FILE = /\.(?:js|mjs|cjs|jsx|ts|tsx|mts|cts)$/

// Not code, but execution surfaces whose contents the fact index reads.
export const INTEL_FILE =
  /(?:^|\/)(?:package\.json|composer\.json|Makefile[^/]*|CMakeLists\.txt|configure(?:\.ac)?|Dockerfile[^/]*|Jenkinsfile|pom\.xml|tasks\.json|launch\.json|\.mcp\.json|settings(?:\.local)?\.json|devcontainer\.json|\.envrc)$|\.(?:m4|cmake|gradle|kts)$/i
