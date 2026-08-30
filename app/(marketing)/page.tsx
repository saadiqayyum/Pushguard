import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InstallButton, SecondaryLink } from "@/components/site-chrome";
import { auth } from "@/lib/auth";
import { installUrl } from "@/lib/install-url";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const signedIn = Boolean((await auth())?.user);
  const install = installUrl();

  return (
    <>
      <section className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-24">
        <h1 className="mt-5 max-w-3xl text-balance">
          Find the commit
          <br />
          nobody reviewed.
        </h1>

        <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
          Pushguard watches every push to your organization and opens a ticket
          when something looks wrong: install hooks, workflow edits, committed
          secrets, force pushes. Scan on demand to see what is already in your
          code. Nothing reaches GitHub until you decide to file it.
        </p>

        {/* Sans, not mono: mono carries headlines and code in this system, and a
            button is neither, set in mono it reads as a sample rather than an
            action. The GitHub mark is the affordance on a button whose whole job
            is "you are about to leave for GitHub", so it replaces the arrow
            rather than sitting next to it. */}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          {signedIn ? (
            <Link
              href="/dashboard/scans"
              className="group flex h-12 items-center gap-2.5 rounded-xl bg-[var(--ink)] pl-6 pr-5 font-sans text-[0.9375rem] font-medium text-[var(--paper)] transition-opacity hover:opacity-90"
            >
              Scan your repositories
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <InstallButton href={install}>Connect GitHub</InstallButton>
          )}

          <SecondaryLink href={signedIn ? "/how-to-use" : "/login"}>
            {signedIn ? "See how it works" : "Already installed? Sign in"}
          </SecondaryLink>
        </div>
      </section>
    </>
  );
}
