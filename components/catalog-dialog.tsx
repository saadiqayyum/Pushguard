"use client";

import { useState } from "react";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SeverityBadge } from "@/components/severity-badge";
import type { Rule } from "@/schemas/rule";

export type CatalogPack = { id: string; title: string; blurb: string };

/**
 * The catalog, as a searchable picker rather than rows in the table.
 *
 * Listing 76 shipped rules alongside the handful an account actually wrote
 * buried the ones that were theirs, and paging through them was worse: the
 * pager did not carry the scope, so page two of the catalog silently fell back
 * to the account's own rules and rendered empty. A dialog has no pages to get
 * out of step.
 *
 * Selecting a rule opens the rule form filled in from it. That is `duplicate`
 * and not `edit` on purpose: these rules already run, so the useful action is
 * starting your own variant from one. Editing a catalog rule in place is done
 * from its own row, which is where the override belongs.
 */
export function CatalogDialog({
  rules,
  packs,
  onSelect,
}: {
  rules: Rule[];
  packs: CatalogPack[];
  onSelect: (rule: Rule) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Library className="size-4" />
        Browse catalog ({rules.length})
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Rule catalog"
        description="Every rule Pushguard ships. Pick one to start your own from it."
        // CommandDialog hides its header for screen readers only, and defaults
        // to no close button because a command palette is driven by the
        // keyboard. This one is browsed with a mouse, so it needs a way out
        // that is not Escape.
        showCloseButton
        // Sized for a browsable catalog rather than a command palette.
        // DialogContent defaults to sm:max-w-sm and a grid, and CommandDialog
        // adds top-1/3; 76 rules with descriptions do not fit in a 384px box a
        // third of the way down the page.
        //
        // Centred rather than offset from the top. `top-1/3` plus a max height
        // have to be kept in step by hand, and getting it wrong leaves the
        // dialog pinned against one edge; centring makes the margin above and
        // below equal at every size with no number to maintain.
        //
        // The height is bounded here and the list flexes into what is left,
        // which is what gives it something to scroll inside. Unbounded, the
        // dialog just grows to fit all 76 rules. dvh rather than vh so a mobile
        // browser collapsing its chrome cannot push the bottom off screen.
        className="top-1/2 flex max-h-[80dvh] -translate-y-1/2 flex-col overflow-hidden sm:max-w-3xl"
      >
        {/* This CommandDialog renders its children straight into DialogContent
            and does not provide the cmdk context itself, unlike the variant
            that wraps internally. Without this, CommandInput has no store to
            subscribe to and throws on mount. */}
        {/* `min-h-0` so this can shrink inside the flex column at all: a flex
            child defaults to min-height:auto and refuses to go below its
            content, which is what makes the list push past the dialog instead
            of scrolling inside it.
            `h-auto` because Command ships with `size-full`, and a hard
            height:100% on a parent that only has a max-height fights the flex
            sizing the scroll depends on. */}
        <Command className="h-auto min-h-0 flex-1">
          <CommandInput placeholder="Search rules, packs, or what they detect..." />
          {/* max-h-none drops the component's built-in max-h-72 (288px), which is
              the cap a palette wants and a catalog does not. */}
          <CommandList className="max-h-none min-h-0 flex-1">
            <CommandEmpty>No rule matches that.</CommandEmpty>
            {packs.map((pack) => {
              const inPack = rules.filter((rule) => rule.pack === pack.id);
              if (inPack.length === 0) return null;
              return (
                <CommandGroup
                  key={pack.id}
                  heading={`${pack.title} — ${pack.blurb}`}
                >
                  {inPack.map((rule) => (
                    <CommandItem
                      key={rule.id}
                      // cmdk matches on this string, so the description and pack
                      // are searchable and not only the id.
                      value={`${rule.id} ${pack.id} ${rule.description ?? ""}`}
                      onSelect={() => {
                        setOpen(false);
                        onSelect(rule);
                      }}
                      className="items-center gap-3 py-2"
                    >
                      {/* Fixed-width so the names line up down the list instead
                          of stepping in and out with each badge's width. */}
                      <span className="w-16 shrink-0">
                        <SeverityBadge severity={rule.severity} />
                      </span>
                      <span className="w-64 shrink-0 truncate font-medium">
                        {rule.id}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {rule.description}
                      </span>
                      {!rule.enabled && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          off
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
