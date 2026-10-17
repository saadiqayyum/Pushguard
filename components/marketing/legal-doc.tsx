import type { Metadata } from "next"
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page"
import { mdxComponents } from "@/components/marketing/mdx"
import { legalDoc, type LegalSlug } from "@/lib/marketing/source"

export function legalMetadata(slug: LegalSlug): Metadata {
  const { title, description } = legalDoc(slug)
  const url = `/${slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: "Pushguard", title, description, url },
  }
}

export function LegalDoc({ slug }: { slug: LegalSlug }) {
  const doc = legalDoc(slug)
  const Body = doc.body
  return (
    <DocsPage toc={doc.toc} tableOfContent={{ style: "clerk" }}>
      <header className="border-b pb-6">
        <h1 className="doc-title text-[clamp(2rem,4.5vw,2.75rem)]!">{doc.title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated {doc.updated}</p>
      </header>
      <DocsBody>
        <Body components={mdxComponents()} />
      </DocsBody>
    </DocsPage>
  )
}
