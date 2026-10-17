import { createFromSource } from "fumadocs-core/search/server"
import { attackSource } from "@/lib/marketing/source"

// Built once at build time and served as a static index the browser searches locally.
export const revalidate = false
export const { staticGET: GET } = createFromSource(attackSource)
