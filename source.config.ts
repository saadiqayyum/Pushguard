import { defineCollections, defineConfig, defineDocs, frontmatterSchema } from "fumadocs-mdx/config"
import { z } from "zod"
import { parseAttackDoc } from "./lib/marketing/parse"
import { remarkStripHead } from "./lib/marketing/remark-strip-head"
import { remarkStripInternal } from "./lib/marketing/remark-strip-internal"

// The write-ups carry no frontmatter: the title and status come from the markdown itself.
const fromSource = ({ source }: { source: string }) => {
  const doc = parseAttackDoc(source)
  return z.object({
    title: z.string().default(doc.title),
    description: z.string().default(doc.summary.replace(/`/g, "")),
    when: z.string().default(doc.when),
    kind: z.string().default(doc.type),
    status: z.string().default(doc.status),
  })
}

export const attacks = defineDocs({
  dir: "docs/attacks",
  docs: { files: ["*/*.md"], schema: fromSource },
})

export const catalog = defineCollections({
  type: "doc",
  dir: "docs",
  files: ["THREAT_CATALOG.md"],
  schema: fromSource,
})

export const legal = defineCollections({
  type: "doc",
  dir: "content/legal",
  files: ["*.md"],
  schema: frontmatterSchema.extend({ updated: z.string().max(40) }),
})

export default defineConfig({
  mdxOptions: { remarkPlugins: (plugins) => [remarkStripHead, remarkStripInternal, ...plugins] },
})
