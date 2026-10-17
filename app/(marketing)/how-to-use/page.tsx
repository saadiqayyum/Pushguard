import type { Metadata } from "next"
import { CONTAINER } from "@/components/app-header"
import { Backdrop } from "@/components/marketing/backdrop"
import { Controls } from "@/components/marketing/how/controls"
import { Flow } from "@/components/marketing/how/flow"
import { Permissions } from "@/components/marketing/how/permissions"
import { StartCta } from "@/components/marketing/start-cta"

const TITLE = "How it works"
const DESCRIPTION = "Install Pushguard on your GitHub account. It watches every change and opens an alert when one looks like a known attack."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/how-to-use" },
  openGraph: { title: TITLE, description: DESCRIPTION },
}

export default function HowToUsePage() {
  return (
    <>
      <Backdrop />

      <section aria-labelledby="how" className={`${CONTAINER} pt-12 pb-12 sm:pt-16 lg:pt-24`}>
        <h1 id="how" className="max-w-3xl">How it works</h1>
        <p className="mt-6 max-w-xl text-[1.125rem] leading-relaxed text-muted-foreground">
          Install it once, keep working as usual, and hear about it when a change looks like an attack.
        </p>
        <div className="mt-10">
          <Flow />
        </div>
      </section>

      <section aria-labelledby="controls" className={`${CONTAINER} py-12`}>
        <h2 id="controls" className="max-w-2xl">What you control</h2>
        <div className="mt-8">
          <Controls />
        </div>
      </section>

      <section aria-labelledby="access" className={`${CONTAINER} py-12`}>
        <h2 id="access" className="max-w-2xl">What it asks GitHub for</h2>
        <div className="mt-8">
          <Permissions />
        </div>
      </section>

      <section aria-labelledby="start" className={`${CONTAINER} pt-12`}>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="start" className="max-w-md">
            Start with one repository.
          </h2>
          <StartCta />
        </div>
      </section>
    </>
  )
}
