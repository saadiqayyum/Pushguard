// Below the shared 4rem header, full width: sidebar, article, TOC. The article takes what is left.
export const DOCS_FRAME = {
  "--fd-banner-height": "4rem",
  gridTemplate: `"sidebar header toc" "sidebar toc-popover toc" "sidebar main toc" 1fr / var(--fd-sidebar-col) minmax(0, 1fr) var(--fd-toc-width)`,
} as React.CSSProperties
