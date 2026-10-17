import { inflateRawSync } from "node:zlib"

export type ZipEntry = { name: string; text: string }

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const EOCD_MIN = 22
const EOCD_SEARCH = EOCD_MIN + 0xffff

// Reads stored and deflated entries through the central directory. No zip64,
// no encryption: GitHub's log archives use neither. Entries past either cap
// are not read and `truncated` says so.
export function readZip(zip: Buffer, caps: { maxEntries: number; maxBytes: number }): { entries: ZipEntry[]; truncated: boolean } {
  let eocd = -1
  for (let i = zip.length - EOCD_MIN; i >= Math.max(0, zip.length - EOCD_SEARCH); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive")

  const count = zip.readUInt16LE(eocd + 10)
  let at = zip.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []
  let budget = caps.maxBytes
  let truncated = count > caps.maxEntries

  for (let n = 0; n < Math.min(count, caps.maxEntries); n++) {
    if (at + 46 > zip.length || zip.readUInt32LE(at) !== CENTRAL) throw new Error("Corrupt central directory")
    const method = zip.readUInt16LE(at + 10)
    const compressed = zip.readUInt32LE(at + 20)
    const nameLength = zip.readUInt16LE(at + 28)
    const next = at + 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
    const local = zip.readUInt32LE(at + 42)
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength)
    at = next

    if (name.endsWith("/")) continue
    if (local + 30 > zip.length || zip.readUInt32LE(local) !== LOCAL) throw new Error("Corrupt local header")
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const body = zip.subarray(start, start + compressed)
    let data: Buffer
    try {
      if (method === 0) data = body.subarray(0, budget + 1)
      else if (method === 8) data = inflateRawSync(body, { maxOutputLength: budget + 1 })
      else continue
    } catch (error) {
      if ((error as { code?: string }).code !== "ERR_BUFFER_TOO_LARGE") throw error
      truncated = true
      break
    }
    if (data.length > budget) {
      truncated = true
      break
    }
    budget -= data.length
    entries.push({ name, text: data.toString("utf8") })
  }
  return { entries, truncated }
}
