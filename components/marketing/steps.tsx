export function Steps({ steps, className }: { steps: [string, string][]; className?: string }) {
  return (
    <ol className={`grid gap-x-8 ${className ?? ""}`}>
      {steps.map(([title, body], index) => (
        <li key={title} className="gutter-row">
          <span className="gutter-mark" data-mark="n" aria-hidden>
            {index + 1}
          </span>
          <div className="min-w-0">
            <h3>{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
