import type { Root } from "mdast"

// The page header renders the H1 and the Type/When/Status line from parsed data,
// so the body drops them instead of showing them twice.
export function remarkStripHead() {
  return (tree: Root) => {
    tree.children = tree.children.filter((node, index) => {
      if (node.type === "heading" && node.depth === 1) return false
      const first = node.type === "paragraph" ? node.children[0] : undefined
      const isMeta = first?.type === "strong" && first.children[0]?.type === "text" && first.children[0].value === "Type:"
      return !(isMeta && index < 4)
    })
  }
}
