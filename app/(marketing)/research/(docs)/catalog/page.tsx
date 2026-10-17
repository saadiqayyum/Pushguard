import type { Metadata } from "next"
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page"
import { mdxComponents } from "@/components/marketing/mdx"
import { catalogDoc } from "@/lib/marketing/source"
import { marketingStats } from "@/lib/marketing/stats"

const DESCRIPTION = "Dated incidents where attackers reached code through a repository, and the attack classes they fall into."

export const metadata: Metadata = {
  title: "Threat catalogue",
  description: DESCRIPTION,
  alternates: { canonical: "/research/catalog" },
  openGraph: {
    type: "article",
    siteName: "Pushguard",
    title: "Threat catalogue",
    description: DESCRIPTION,
    url: "/research/catalog",
  },
}

export default function CatalogPage() {
  const { incidents } = marketingStats()
  const Body = catalogDoc.body
  return (
    <DocsPage toc={catalogDoc.toc} tableOfContent={{ style: "clerk" }}>
      <header className="border-b pb-6">
        <p className="text-sm text-muted-foreground tabular-nums">
          Threat catalogue: {incidents.count} incidents, {incidents.from} to {incidents.to}
        </p>
        <h1 className="doc-title mt-3 text-[clamp(2rem,4.5vw,2.75rem)]!">{catalogDoc.title}</h1>
      </header>
      <DocsBody>
        <Body components={mdxComponents()} />
      </DocsBody>
    </DocsPage>
  )
}
