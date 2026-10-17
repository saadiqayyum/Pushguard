import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { DOCS_FRAME } from "@/components/marketing/docs-frame"
import { attackSource } from "@/lib/marketing/source"

export default function DocsFrame({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout
      tree={attackSource.pageTree}
      nav={{ title: "Attack library", url: "/research" }}
      sidebar={{ collapsible: false }}
      themeSwitch={{ enabled: false }}
      containerProps={{ style: DOCS_FRAME }}
    >
      {children}
    </DocsLayout>
  )
}
