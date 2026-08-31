import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InstallButton, SecondaryLink } from "@/components/site-chrome";
import { auth } from "@/lib/auth";
import { installUrl } from "@/lib/install-url";

export const dynamic = "force-dynamic";

// The tone is the colour a finding is reported in, not a decoration: red is
// flagged, green is allowed-but-watched, violet is a model's verdict.
const SIGNALS: [string, string][] = [
  ["Install hooks", "flag"],
  ["Workflow edits", "flag"],
  ["Committed secrets", "flag"],
  ["Force pushes", "add"],
  ["Model review", "ai"],
];

const AI = [
  [
    "Rules written in English",
    "Describe what you do not want in a sentence. A model reads the changed files and answers it, so a rule can catch what no regex was written for: exfiltration, a logic bomb, a check quietly bypassed.",
  ],
  [
    "The model never holds a token",
    "It gets tools, not credentials. It names a path, our code decides whether it gets one. A request outside the rule's scope is refused and filed as a finding, which is where prompt injection surfaces.",
  ],
  [
    "Your key, your model",
    "Anthropic, OpenAI or Google, encrypted at rest, decrypted at call time. A model that timed out or ran out of context is reported, never counted as a clean result.",
  ],
];

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
          when something looks wrong. Pattern rules run free on every push; AI
          rules read the diff and judge it. Scan on demand to see what is
          already in your code. Nothing reaches GitHub until you decide to file
          it.
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          {SIGNALS.map(([label, tone]) => (
            <span key={label} className="chip" data-tone={tone}>
              {label}
            </span>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          {signedIn ? (
            <Link
              href="/dashboard/scans"
              className="group flex h-12 items-center gap-2.5 rounded-xl bg-[var(--brand)] pl-6 pr-5 font-sans text-[0.9375rem] font-medium text-[var(--paper)] transition-opacity hover:opacity-90"
            >
              Scan your repositories
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <InstallButton href={install}>Connect GitHub</InstallButton>
          )}

          <SecondaryLink href="/how-to-use">See how it works</SecondaryLink>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pb-4">
        <p className="eyebrow">AI review</p>
        <h2 className="mt-4 max-w-2xl text-balance">
          A rule you write as a sentence.
        </h2>

        <ul className="mt-8 max-w-3xl">
          {AI.map(([title, body]) => (
            <li key={title} className="gutter-row">
              <span className="gutter-mark" data-mark="~" aria-hidden>
                ~
              </span>
              <div className="min-w-0">
                <h3>{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {body}
                </p>
              </div>
            </li>
          ))}
          <div className="max-w-3xl border-t border-[var(--rule)]" />
        </ul>

        <p className="mt-6 text-sm text-[var(--ink-soft)]">
          AI can annotate or escalate a finding. It can never suppress one.
        </p>
      </section>
    </>
  );
}
