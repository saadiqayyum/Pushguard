// Untrusted text handed to a model, wrapped so nothing inside can close or
// open one of our own tags and pass itself off as our framing.
export const FENCE_TAGS = ["file", "tool_result", "evidence", "hop", "source"] as const
export type FenceTag = (typeof FENCE_TAGS)[number]

const OUR_TAGS = new RegExp(`<\\s*/?\\s*(${FENCE_TAGS.join("|")})\\b[^>]*>`, "gi")

export function escapeTags(text: string): string {
  return text.replaceAll(OUR_TAGS, (_, name: string) => `[${name.toLowerCase()}-tag]`)
}

export function fence(tag: FenceTag, attrs: Record<string, string | number>, body: string): string {
  const rendered = Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${String(value).replace(/["<>\n\r]/g, "'")}"`)
    .join("")
  return `<${tag}${rendered}>\n${escapeTags(body)}\n</${tag}>`
}
