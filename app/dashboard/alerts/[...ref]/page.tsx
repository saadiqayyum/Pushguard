import Link from "next/link"
import { ChevronLeft, ExternalLink } from "lucide-react"
import { notFound, redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { alertHeadline, collapseLines } from "@/lib/alert-display"
import { SeverityBadge } from "@/components/severity-badge"
import { auth } from "@/lib/auth"
import { alertDetail } from "@/lib/db"
import { formatTimestamp } from "@/lib/format"

export const dynamic = "force-dynamic"

/**
 * One alert, in full. `/dashboard/alerts/owner/repo/12`.
 *
 * The GitHub issue is still where people reply and close; this is where the
 * evidence lives. Clicking a row used to leave the app entirely, which meant
 * the matched rule, the lines that matched and who has touched it were only
 * ever visible on github.com, and the diff was not written down anywhere at
 * all.
 */
export default async function AlertPage({ params }: { params: Promise<{ ref: string[] }> }) {
  const { ref } = await params
  const session = await auth()
  if (!session?.user) redirect("/signin")

  // owner / repo / number
  const number = Number(ref[2])
  if (ref.length !== 3 || !Number.isInteger(number)) notFound()

  const login = session.login || session.user.name || ""
  const alert = await alertDetail(login, `${ref[0]}/${ref[1]}`, number)
  if (!alert) notFound()

  const compare = alert.push
    ? alert.push.before === "0".repeat(40)
      ? `https://github.com/${alert.repo}/commit/${alert.push.after}`
      : `https://github.com/${alert.repo}/compare/${alert.push.before}...${alert.push.after}`
    : null

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 space-y-5">
      <div className="space-y-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Alerts
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <Badge variant={alert.state === "open" ? "default" : "outline"}>{alert.state}</Badge>
          <span className="text-xs text-muted-foreground">from a {alert.source}</span>
          {(alert.occurrences ?? 1) > 1 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              seen {alert.occurrences}× · last {formatTimestamp(alert.lastSeenAt)}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          {alertHeadline(alert.title, alert.repo)}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="font-mono">
            {alert.repo}#{alert.number}
          </span>
          <span>{formatTimestamp(alert.createdAt)}</span>
          <a
            href={alert.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 underline"
          >
            Open on GitHub <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      {alert.push && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {(alert.occurrences ?? 1) > 1 ? "The push that opened this" : "The push"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Pushed by">
              @{alert.push.sender}
              {alert.push.pusherEmail && ` (${alert.push.pusherEmail})`}
            </Row>
            <Row label="Branch">{alert.push.branch}</Row>
            <Row label="Force push">{alert.push.forced ? "yes" : "no"}</Row>
            {compare && (
              <Row label="Diff">
                <a href={compare} target="_blank" rel="noreferrer" className="underline">
                  {alert.push.before.slice(0, 7)}…{alert.push.after.slice(0, 7)}
                </a>
              </Row>
            )}
          </CardContent>
        </Card>
      )}

      {(alert.sightings ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Seen again {alert.sightings!.length}×
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {/* The card above is the push that opened the issue and never
                changes. These are the later ones, which are different commits
                by possibly different accounts. */}
            {alert.sightings!.map((sighting, index) => (
              <Row key={index} label={formatTimestamp(sighting.at)}>
                <span className="flex flex-wrap items-center gap-x-2">
                  <span>{sighting.ruleIds.join(", ")}</span>
                  {sighting.by && <span className="text-muted-foreground">@{sighting.by}</span>}
                  {sighting.sha && (
                    <a
                      href={`https://github.com/${alert.repo}/commit/${sighting.sha}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs underline"
                    >
                      {sighting.sha.slice(0, 7)}
                    </a>
                  )}
                </span>
              </Row>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {alert.findings.length > 0
              ? `${alert.findings.length} rule${alert.findings.length === 1 ? "" : "s"} matched`
              : "Rules matched"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {alert.findings.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {alert.ruleIds.join(", ")}. This alert predates the evidence being stored.
            </p>
          )}
          {alert.findings.map((finding, index) => (
            <div key={`${finding.ruleId}-${index}`} className="space-y-2">
              <p className="text-sm">
                <span className="font-mono font-medium">{finding.ruleId}</span>
                <span className="text-muted-foreground"> · {finding.severity}</span>
              </p>
              {finding.description && (
                <p className="text-sm text-muted-foreground">{finding.description}</p>
              )}
              {finding.files.length > 0 && (
                <p className="flex flex-wrap gap-3 font-mono text-xs text-muted-foreground">
                  {finding.files.map((file) => (
                    <a
                      key={file}
                      href={`https://github.com/${alert.repo}/blob/${alert.push?.after ?? "HEAD"}/${file}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {file}
                    </a>
                  ))}
                </p>
              )}
              {collapseLines(finding.lines).map(({ line, count }, i) => (
                <div key={i} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive">
                    + {line.trim()}
                  </p>
                  {count > 1 && (
                    <span className="shrink-0 text-xs text-muted-foreground">×{count}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span>Discussion</span>
            {alert.comments.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {alert.comments.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {alert.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody has replied. Comments made on the GitHub issue appear here.
            </p>
          ) : (
            alert.comments.map((comment) => (
              <div key={comment.id} className="space-y-1.5 border-b pb-4 last:border-0 last:pb-0">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{comment.by}</span> ·{" "}
                  {formatTimestamp(comment.at)}
                </p>
                {/* Rendered as text, never as markup: this is what somebody typed
                    into a public issue and it is not to be trusted as HTML. */}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            <a href={alert.url} target="_blank" rel="noreferrer" className="underline">
              Reply on GitHub
            </a>
            . Replies appear here within a moment.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Triage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="space-y-2">
          <Row label="Assigned to">
            {alert.assignees.length > 0 ? alert.assignees.join(", ") : "nobody"}
          </Row>
          <Row label="First seen by">
            {alert.acknowledgedBy
              ? `${alert.acknowledgedBy}, ${formatTimestamp(alert.acknowledgedAt!)}`
              : "nobody has opened this"}
          </Row>
          </dl>

          {alert.activity.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              {alert.activity
                .slice()
                .reverse()
                .map((entry, index) => (
                  // Separators rather than flex gaps alone: the words run
                  // together the moment a gap utility does not generate, and
                  // "saadiqayyumcomment created30 Aug" is unreadable.
                  <p key={index} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{entry.by ?? "Pushguard"}</span>
                    {" "}{entry.action}{" · "}{formatTimestamp(entry.at)}
                  </p>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Label and value side by side.
 *
 * The label width is an inline style, not a utility. Two attempts with
 * Tailwind arbitrary values failed silently here, `w-28` collapsed, and
 * `sm:grid-cols-[9rem_minmax(0,1fr)]` never generated at all, leaving a single
 * 864px column. A class that is not generated is indistinguishable from one
 * that is wrong, and this is a layout the page cannot be read without.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-6">
      <dt style={{ width: "9rem", flexShrink: 0 }} className="text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}
