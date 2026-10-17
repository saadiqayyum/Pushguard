import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page"
import { CategoryIcon } from "@/components/marketing/category-icon"
import { mdxComponents } from "@/components/marketing/mdx"
import { StatusBadge } from "@/components/marketing/status-badge"
import { attackStatus } from "@/lib/marketing/parse"
import { CATEGORIES, type CategoryId } from "@/lib/marketing/categories"
import { attackSource } from "@/lib/marketing/source"

type Params = { params: Promise<{ category: string; slug: string }> }

const isCategory = (id: string): id is CategoryId => CATEGORIES.some((c) => c.id === id)

export function generateStaticParams() {
  return attackSource.getPages().map((page) => ({ category: page.slugs[0], slug: page.slugs[1] }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, slug } = await params
  const page = attackSource.getPage([category, slug])
  if (!page) return {}
  const { title, description } = page.data
  return {
    title,
    description,
    alternates: { canonical: page.url },
    openGraph: { type: "article", siteName: "Pushguard", title, description, url: page.url },
  }
}

export default async function AttackPage({ params }: Params) {
  const { category, slug } = await params
  const page = attackSource.getPage([category, slug])
  if (!page || !isCategory(category)) notFound()
  const Body = page.data.body

  return (
    <DocsPage toc={page.data.toc} tableOfContent={{ style: "clerk" }}>
      <header data-cat={category} className="border-b pb-6">
        <h1 className="doc-title text-[clamp(2rem,4.5vw,2.75rem)]!">{page.data.title}</h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground tabular-nums">
          <CategoryIcon category={category} size="sm" />
          <StatusBadge status={attackStatus(page.data.status)} />
          {page.data.when}
        </p>
      </header>
      <DocsBody>
        <Body components={mdxComponents(page.path)} />
      </DocsBody>
    </DocsPage>
  )
}
