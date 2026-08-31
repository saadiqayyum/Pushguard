import type { Metadata } from "next";
import { InstallButton } from "@/components/site-chrome";
import { installUrl } from "@/lib/install-url";
import { SCAN_LIMITS } from "@/lib/scan";

export const metadata: Metadata = {
  title: "How to use Pushguard",
  description:
    "Install, pick something to scan, read the findings, report the ones you want.",
};

// Short enough to read standing up. The long version of any of these is the
// screen it describes, not more prose here.
const STEPS = [
  [
    "Install",
    "One GitHub screen installs the app and signs you in. Pick the account and the repositories.",
  ],
  [
    "Scan",
    "Dashboard → Scans. Choose an account, a repository, and a branch. Nothing to type.",
  ],
  [
    "Read",
    "Each finding names the rule, the files, and the lines that matched.",
  ],
  [
    "Report",
    "Report issue opens one GitHub issue per repository. Until you do, nothing has reached GitHub.",
  ],
  [
    "Watch",
    "From then on every push is checked as it lands, and repeats are added to the open issue rather than opening a new one.",
  ],
];

// Two lines each. The screen itself is the long version.
const AI_STEPS = [
  [
    "Add a key",
    "Dashboard \u2192 Rules \u2192 AI. Anthropic, OpenAI or Google. It is encrypted at rest and only decrypted to make the call, and reviews run on your key, never ours.",
  ],
  [
    "Write the rule as a sentence",
    "\u201cDoes this code read a secret and send it somewhere?\u201d Pick the paths it applies to and a severity. Start from an example in the picker.",
  ],
  [
    "Pick a scope",
    "changed reads the files a push touched, inline. repository queues an agent that navigates the tree, reading files and following names.",
  ],
]

const FACTS = [
  `${SCAN_LIMITS.perDay} scans a day, ${SCAN_LIMITS.repos} repositories each, one at a time.`,
  "You can only ever scan what GitHub says you can read. The list comes from your own account.",
  "A scan reads committed code. Force pushes and deleted branches are only visible while the app is watching.",
  "Rules live in Dashboard → Rules. The builder has a dry-run tab.",
  "An AI rule fires on its own paths, never as an escalation on a pattern hit. It can add or raise a finding, never remove one.",
  "A model that timed out, hit a rate limit, or read a truncated diff files a finding saying so. A quiet reviewer is not a clean result.",
];

export default function HowToUsePage() {
  const install = installUrl();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-16 pb-8 sm:pt-20">
      <p className="eyebrow">How to use</p>
      <h1 className="mt-5 text-balance">Five steps.</h1>

      <ol className="mt-10">
        {STEPS.map(([title, body], index) => (
          <li key={title} className="gutter-row">
            <span className="gutter-mark" data-mark="n" aria-hidden>
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3>{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">
                {body}
              </p>
            </div>
          </li>
        ))}
        <div className="border-t border-[var(--rule)]" />
      </ol>

      <section className="mt-14">
        <p className="eyebrow">AI review, optional</p>
        <h2 className="mt-4 text-balance">Rules a model answers.</h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--ink-soft)]">
          Pattern rules are free and run on every push. An AI rule is metered,
          runs on your own key, and finds what you did not predict.
        </p>

        <ol className="mt-8">
          {AI_STEPS.map(([title, body]) => (
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
          <div className="border-t border-[var(--rule)]" />
        </ol>

        <p className="mt-6 text-sm leading-relaxed text-[var(--ink-soft)]">
          The model is given tools, not a token. It asks for a path and our code
          decides whether it gets one, so a file under review cannot talk it
          into reading somewhere else. Refusals are reported as findings.
        </p>
      </section>

      <section className="mt-14">
        <p className="eyebrow">Worth knowing</p>
        <ul className="mt-5 space-y-2">
          {FACTS.map((fact) => (
            <li
              key={fact}
              className="text-sm leading-relaxed text-[var(--ink-soft)]"
            >
              {fact}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-12 flex flex-wrap items-center gap-3">
        <InstallButton href={install} />
      </div>
    </div>
  );
}
