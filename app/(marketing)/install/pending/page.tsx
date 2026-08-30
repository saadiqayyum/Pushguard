import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Installation requested. Pushguard" }

// GitHub returns setup_action=request when the installer is not an owner of the
// organization and an owner has to approve. There is no installation to sign
// into yet, so this is the whole of the state.
export default function InstallPendingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-8">
      <p className="eyebrow">Waiting on an owner</p>
      <h1 className="mt-5 text-balance">Your request went to the organization owners.</h1>
      <p className="mt-6 text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
        GitHub asks an owner to approve apps installed by members. Nothing is watching yet, once
        someone approves it, sign in and the dashboard will have your repositories in it.
      </p>
      <Link
        href="/signin"
        className="mt-8 inline-flex h-12 items-center rounded-xl bg-[var(--ink)] px-6 font-sans text-[0.9375rem] font-medium text-[var(--paper)] transition-opacity hover:opacity-90"
      >
        Sign in
      </Link>
    </div>
  )
}
