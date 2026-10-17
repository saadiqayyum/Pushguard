import { createHash, randomBytes } from "node:crypto"

// Per-org MCP bearer tokens. Shown once at creation; only the SHA-256 is kept.
// A prefix makes a leaked token recognisable to secret scanners.
export const MCP_TOKEN_PREFIX = "pgmcp_"
const TOKEN_BYTES = 32
const MAX_HEADER_CHARS = 200

export function newMcpToken(): { token: string; hash: string; hint: string } {
  const token = `${MCP_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`
  return { token, hash: hashMcpToken(token), hint: token.slice(-4) }
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

// The token from an Authorization header, or null when it is not one of ours.
export function bearerToken(header: string | null): string | null {
  if (!header || header.length > MAX_HEADER_CHARS) return null
  const match = /^Bearer\s+(\S+)$/.exec(header.trim())
  return match && match[1].startsWith(MCP_TOKEN_PREFIX) ? match[1] : null
}

// A token reaches only repositories its own org's installation covers.
export function repoAllowed(org: string, repo: string, record: { org: string } | null): boolean {
  return /^[^/\s]+\/[^/\s]+$/.test(repo) && record !== null && record.org.toLowerCase() === org.toLowerCase()
}
