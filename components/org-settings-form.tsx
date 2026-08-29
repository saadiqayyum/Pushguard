"use client"

import { useState } from "react"
import { Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api, ApiClientError } from "@/lib/api-client"

const SOURCE_REPO = "__source__"
const NO_MENTION = "__none__"

type Props = {
  org: string
  owner: string
  repos: string[]
  teams: string[]
  alertsRepo: string | null
  alertMention: string | null
}

// A value the app can no longer see (repo access revoked, team deleted) must
// stay selectable, otherwise saving anything else silently drops it.
function withCurrent(options: string[], current: string | null): string[] {
  return current && !options.includes(current) ? [current, ...options] : options
}

export function OrgSettingsForm(props: Props) {
  const [alertsRepo, setAlertsRepo] = useState(props.alertsRepo ?? SOURCE_REPO)
  // Stored with a leading @; the picker works in bare `org/team` values.
  const [alertMention, setAlertMention] = useState(props.alertMention?.replace(/^@/, "") ?? NO_MENTION)
  const [saving, setSaving] = useState(false)

  const repoOptions = withCurrent(props.repos, props.alertsRepo)
  // The owner is always offered and is the default: a personal account has no
  // teams at all, and an org handle on its own notifies nobody on GitHub.
  const mentionOptions = withCurrent(
    [...new Set([props.owner, ...props.teams])],
    props.alertMention?.replace(/^@/, "") ?? null,
  )

  async function save() {
    setSaving(true)
    try {
      await api(`/api/installations/${props.org}`, {
        method: "PATCH",
        body: {
          alertsRepo: alertsRepo === SOURCE_REPO ? "" : alertsRepo,
          alertMention: alertMention === NO_MENTION ? "" : `@${alertMention}`,
        },
      })
      toast.success("Settings saved")
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="alerts-repo">Alerts repository</Label>
        <Select value={alertsRepo} onValueChange={setAlertsRepo}>
          <SelectTrigger id="alerts-repo" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SOURCE_REPO}>Same repository as the push (default)</SelectItem>
            {repoOptions.map((repo) => (
              <SelectItem key={repo} value={repo}>
                {repo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {props.repos.length === 0
            ? "No repositories connected yet. Add them to the Pushguard installation on GitHub."
            : "By default each alert is filed in the repository that triggered it. Pick a repository to collect every alert in one place instead."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="alert-mention">Alert mention</Label>
        <Select value={alertMention} onValueChange={setAlertMention}>
          <SelectTrigger id="alert-mention" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MENTION}>No mention</SelectItem>
            {mentionOptions.map((name) => (
              <SelectItem key={name} value={name}>
                @{name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {props.teams.length === 0
            ? `Mentioned on high and critical alerts; GitHub emails them. ${props.org} has no teams, so only the owner can be mentioned.`
            : "Mentioned on high and critical alerts; GitHub emails the team's members."}
        </p>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="size-4" />
          Save
        </Button>
      </div>
    </div>
  )
}
