import type { Metadata } from "next"
import { Archivo, Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme"
import { env } from "@/lib/env"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
})

// Code values on every surface: the product reads diffs, so paths and rule ids look like the material.
const plexMono = IBM_Plex_Mono({
  variable: "--font-code",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
})

// Public-page headings, set compressed through the width axis.
const archivo = Archivo({
  variable: "--font-display",
  axes: ["wdth"],
  subsets: ["latin"],
  display: "swap",
})

const DESCRIPTION =
  "Pushguard reads every push across a GitHub organization and files an issue when a change matches a known attack: install hooks, workflow tampering, moved tags, hidden Unicode, agent config."

export const generateMetadata = (): Metadata => ({
  metadataBase: new URL(env().AUTH_URL),
  title: { default: "Pushguard: attacks now arrive as commits", template: "%s | Pushguard" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "Pushguard", title: "Pushguard: attacks now arrive as commits", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Pushguard: attacks now arrive as commits", description: DESCRIPTION },
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${plexMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
