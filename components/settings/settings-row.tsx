export function SettingsRow({ label, children, action }: { label: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <li className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-medium">{label}</h2>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">{children}</div>
      </div>
      {action}
    </li>
  )
}
