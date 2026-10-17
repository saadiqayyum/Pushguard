import type { ComponentProps } from "react"
import Link from "next/link"
import defaultMdxComponents from "fumadocs-ui/mdx"
import { resolveDocHref } from "@/lib/marketing/parse"

// Outside sources open in a new tab with no opener; any scheme other than http(s)
// or mailto renders as plain text, so a write-up cannot carry a script URL.
export function mdxComponents(from?: string) {
  function SafeLink({ href = "", children, ...props }: ComponentProps<"a">) {
    if (/^https?:\/\//i.test(href)) {
      return (
        <a {...props} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("mailto:")) return <span>{children}</span>
    return (
      <Link {...props} href={from ? resolveDocHref(href, from) : href}>
        {children}
      </Link>
    )
  }
  return { ...defaultMdxComponents, a: SafeLink }
}
