import type { Heading, Root, RootContent } from "mdast"
import { toString } from "mdast-util-to-string"
import { visit } from "unist-util-visit"
import type { VFile } from "vfile"

// The docs stay complete for the team; the public pages must not tell an attacker
// which attacks Pushguard catches, how, or where it is blind.
const INTERNAL_SECTION = /^How Pushguard catches it/
const PUBLIC_CATALOG_SECTION = /^[12]\. /
const INTERNAL_ROW = /^(Best layer|Gap)$/
const INTERNAL_SENTENCE = /Pushguard|push monitor|outside it/

const isH2 = (node: RootContent): node is Heading => node.type === "heading" && node.depth === 2

function keepSections(tree: Root, keep: (title: string) => boolean) {
  let kept = keep("")
  tree.children = tree.children.filter((node) => {
    if (isH2(node)) kept = keep(toString(node))
    return kept
  })
}

function stripCatalog(tree: Root) {
  keepSections(tree, (title) => PUBLIC_CATALOG_SECTION.test(title))
  visit(tree, "heading", (node) => {
    const text = node.children[0]
    if (text?.type === "text") text.value = text.value.replace(/ and the layer that catches each$/, "")
  })
  visit(tree, "table", (node) => {
    node.children = node.children.filter((row) => !INTERNAL_ROW.test(toString(row.children[0] ?? "")))
  })
  visit(tree, "text", (node) => {
    if (!INTERNAL_SENTENCE.test(node.value)) return
    node.value = node.value
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !INTERNAL_SENTENCE.test(sentence))
      .join(" ")
  })
}

export function remarkStripInternal() {
  return (tree: Root, file: VFile) => {
    const path = file.path ?? ""
    if (path.endsWith("THREAT_CATALOG.md")) stripCatalog(tree)
    else if (/docs\/attacks\//.test(path)) keepSections(tree, (title) => !INTERNAL_SECTION.test(title))
  }
}
