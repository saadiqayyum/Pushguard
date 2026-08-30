import type { Metadata } from "next";
import { InstallButton, SecondaryLink } from "@/components/site-chrome";
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

const FACTS = [
  `${SCAN_LIMITS.perDay} scans a day, ${SCAN_LIMITS.repos} repositories each, one at a time.`,
  "You can only ever scan what GitHub says you can read. The list comes from your own account.",
  "A scan reads committed code. Force pushes and deleted branches are only visible while the app is watching.",
  "Rules live in Dashboard → Rules. The builder has a dry-run tab.",
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

      <section className="mt-12">
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
