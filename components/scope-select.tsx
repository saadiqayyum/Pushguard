"use client"

import { Check, ChevronsUpDown, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ScopeOption = { value: string; label: string; group: string }

// shadcn's Combobox pattern (Popover + Command). Search, keyboard navigation,
// grouping, empty state and a scrolling list all come from cmdk rather than
// being hand-rolled here.
//
// Values not in the list (hand-written globs like `acme/payments-*`) still show
// as chips, so editing a rule never silently drops them.
export function ScopeSelect({
  options,
  selected,
  onChange,
  addLabel,
  emptyLabel,
}: {
  options: ScopeOption[]
  selected: string[]
  onChange: (next: string[]) => void
  addLabel: string
  emptyLabel: string
}) {
  const groups = [...new Set(options.map((o) => o.group))]

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  return (
    <div className="space-y-2">
      {/* modal: the dialog locks page scroll with react-remove-scroll, and this
          popover portals outside the dialog's subtree. So without its own lock
          the list refuses wheel input even though it overflows. */}
      <Popover modal>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            <span className={selected.length === 0 ? "text-muted-foreground" : undefined}>
              {selected.length === 0 ? addLabel : `${selected.length} selected`}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput placeholder="Search repositories…" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              {groups.map((group) => (
                <CommandGroup key={group} heading={group}>
                  {options
                    .filter((o) => o.group === group)
                    .map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => toggle(option.value)}
                      >
                        <Check
                          className={cn(
                            "size-4",
                            selected.includes(option.value) ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1 font-normal">
              {value}
              <button
                type="button"
                onClick={() => onChange(selected.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
