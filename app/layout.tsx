import type { Metadata } from "next"
import { Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

// Headlines and code on the public pages. A monospace display face because the
// thing this product reads is a diff. The type should look like the material.
const plexMono = IBM_Plex_Mono({
  variable: "--font-display",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Pushguard, find the commit nobody reviewed",
  description:
    "Scan any GitHub repository or organization for install hooks, workflow tampering, committed secrets and obfuscated payloads. No account needed. Nothing is filed on GitHub until you say so.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
