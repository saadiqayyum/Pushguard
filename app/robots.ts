import type { MetadataRoute } from "next"
import { AI_BOTS, PUBLIC_PAGES } from "@/lib/bots"
import { env } from "@/lib/env"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...AI_BOTS], disallow: "/" },
      {
        userAgent: "*",
        allow: [...PUBLIC_PAGES.map((page) => (page === "/" ? "/$" : page)), "/_next/static/", "/icon", "/opengraph-image"],
        disallow: "/",
      },
    ],
    sitemap: new URL("/sitemap.xml", env().AUTH_URL).href,
  }
}
