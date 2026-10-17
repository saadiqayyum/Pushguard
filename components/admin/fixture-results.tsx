import { Check, X } from "lucide-react"

export type FixtureRun = { passed: boolean; results: { fixture: string; expected: "hit" | "clean"; got: "hit" | "clean" }[] }

export function FixtureResults({ run }: { run: FixtureRun }) {
  return (
    <div className="space-y-2" role="status">
      <p className="text-sm font-medium">{run.passed ? "All fixtures pass" : "Some fixtures fail"}</p>
      <ul className="divide-y rounded-md border text-sm">
        {run.results.map((r) => {
          const ok = r.expected === r.got
          return (
            <li key={`${r.expected}-${r.fixture}`} className="flex items-center gap-2 px-3 py-2">
              {ok ? <Check className="size-4 text-muted-foreground" aria-label="pass" /> : <X className="size-4 text-destructive" aria-label="fail" />}
              <span className="min-w-0 flex-1 truncate">{r.fixture}</span>
              <span className="text-xs text-muted-foreground">
                expected {r.expected}, got {r.got}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
