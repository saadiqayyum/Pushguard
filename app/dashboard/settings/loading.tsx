import { Plus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Bar } from "@/components/page-skeleton"
import { SettingsRow } from "@/components/settings/settings-row"
import { Button } from "@/components/ui/button"

const ROWS = ["Alert destinations", "Threat indicator branches"]

export default function SettingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PageHeader
        title="Settings"
        description={<Bar />}
        actions={
          <Button size="sm" disabled>
            <Plus className="size-4" />
            Add destination
          </Button>
        }
      />
      <ul className="divide-y rounded-lg border">
        {ROWS.map((label) => (
          <SettingsRow
            key={label}
            label={label}
            action={
              <Button size="sm" variant="outline" disabled>
                Edit
              </Button>
            }
          >
            <Bar width="w-32" />
          </SettingsRow>
        ))}
      </ul>
    </div>
  )
}
