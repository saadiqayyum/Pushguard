const PERMISSIONS: { name: string; level: "Read" | "Read and write"; why: string }[] = [
  { name: "Code", level: "Read", why: "Looks at each change." },
  { name: "Repository list", level: "Read", why: "Knows which repositories it covers." },
  { name: "Issues", level: "Read and write", why: "Opens an alert as an issue." },
  { name: "Pull requests", level: "Read", why: "Sees whether a change was reviewed." },
  { name: "Repository settings", level: "Read", why: "Notices when branch protection changes." },
  { name: "Organization members", level: "Read", why: "Matches who sees what to your GitHub roles." },
  { name: "Dependabot alerts", level: "Read", why: "Uses GitHub's own security alerts." },
  { name: "Actions", level: "Read", why: "Reads workflow run logs." },
]

export function Permissions() {
  return (
    <ul className="divide-y rounded-2xl border bg-card/80 px-4 shadow-sm backdrop-blur-sm sm:px-5">
      {PERMISSIONS.map(({ name, level, why }) => (
        <li key={name} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center sm:gap-4">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {name}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                level === "Read" ? "bg-muted text-muted-foreground" : "bg-[var(--warn-wash)] text-[var(--warn)]"
              }`}
            >
              {level}
            </span>
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">{why}</p>
        </li>
      ))}
    </ul>
  )
}
