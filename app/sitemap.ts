import type { MetadataRoute } from "next"
import { env } from "@/lib/env"
import { attackSource } from "@/lib/marketing/source"

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/how-to-use", "/research", "/research/catalog", "/terms", "/privacy", ...attackSource.getPages().map((page) => page.url)]
  return paths.map((path) => ({ url: new URL(path, env().AUTH_URL).href }))
}
