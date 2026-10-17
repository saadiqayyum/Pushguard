import { RootProvider } from "fumadocs-ui/provider/next"

// The site's ThemeProvider already owns light and dark; Fumadocs only supplies search.
export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }} search={{ options: { type: "static", api: "/research/search" } }}>
      {children}
    </RootProvider>
  )
}
