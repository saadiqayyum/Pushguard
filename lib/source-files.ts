// Files worth reading as code. A lockfile is bytes; a bundle is one line of them.
export const SOURCE_FILE =
  /\.(?:js|mjs|cjs|jsx|ts|tsx|mts|cts|py|rb|php|go|rs|java|kt|scala|cs|c|h|cc|cpp|hpp|swift|sh|bash|zsh|ps1|lua|pl|ex|exs|dart|sql|ya?ml|tf)$/i

// js-x-ray parses these and throws on everything else.
export const JS_FILE = /\.(?:js|mjs|cjs|jsx|ts|tsx|mts|cts)$/

