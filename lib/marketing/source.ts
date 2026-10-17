import { loader } from "fumadocs-core/source"
import type { Folder, Node } from "fumadocs-core/page-tree"
import { attacks, catalog, legal } from "@/.source/server"
import { CATEGORIES } from "./categories"

const order = (node: Node) => CATEGORIES.findIndex((c) => node.type === "folder" && node.$id?.endsWith(c.id))

export const attackSource = loader({
  baseUrl: "/research",
  source: attacks.toFumadocsSource(),
  pageTree: {
    transformers: [
      {
        folder: (node: Folder, folderPath: string) => ({
          ...node,
          name: CATEGORIES.find((c) => c.id === folderPath)?.title ?? node.name,
          defaultOpen: false,
        }),
        root: (root) => ({
          ...root,
          name: "Research",
          children: [
            { type: "page", name: "Library index", url: "/research" },
            { type: "page", name: "Threat catalogue", url: "/research/catalog" },
            { type: "separator", name: "Write-ups" },
            ...[...root.children].sort((a, b) => order(a) - order(b)),
          ],
        }),
      },
    ],
  },
})

export const catalogDoc = catalog[0]

export type LegalSlug = "terms" | "privacy"

export function legalDoc(slug: LegalSlug) {
  const doc = legal.find((entry) => entry.info.path === `${slug}.md`)
  if (!doc) throw new Error(`content/legal/${slug}.md is missing`)
  return doc
}
