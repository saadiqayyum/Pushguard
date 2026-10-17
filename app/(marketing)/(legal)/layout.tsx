import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { RootProvider } from "fumadocs-ui/provider/next"
import { DOCS_FRAME } from "@/components/marketing/docs-frame"

const TREE = {
  name: "Legal",
  children: [
    { type: "page" as const, name: "Terms of Service", url: "/terms" },
    { type: "page" as const, name: "Privacy Policy", url: "/privacy" },
  ],
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
      <DocsLayout
        tree={TREE}
        nav={{ title: "Legal", url: "/terms" }}
        sidebar={{ collapsible: false }}
        searchToggle={{ enabled: false }}
        themeSwitch={{ enabled: false }}
        containerProps={{ style: DOCS_FRAME }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  )
}
