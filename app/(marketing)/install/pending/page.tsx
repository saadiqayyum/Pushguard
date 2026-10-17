import type { Metadata } from "next"
import { CONTAINER } from "@/components/app-header"
import { CTA } from "@/components/site-chrome"
import { SignInLink } from "@/components/signin-dialog"

export const metadata: Metadata = { title: "Installation requested. Pushguard" }

// GitHub returns setup_action=request when the installer is not an org owner.
export default function InstallPendingPage() {
  return (
    <div className={`${CONTAINER} pt-14 sm:pt-20`}>
      <p className="eyebrow">Waiting on an owner</p>
      <h1 className="mt-5 text-balance">Request sent to the organization owners.</h1>
      <SignInLink href="/dashboard" className={`${CTA} mt-8`}>
        Sign in
      </SignInLink>
    </div>
  )
}
