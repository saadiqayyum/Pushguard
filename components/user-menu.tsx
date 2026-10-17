"use client"

import { LogOut, Repeat } from "lucide-react"
import { useState } from "react"
import { SignInDialog } from "@/components/signin-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOutAction } from "@/lib/actions"

export function UserMenu({ login }: { login: string }) {
  const [switching, setSwitching] = useState(false)
  return (
    <>
      <SignInDialog open={switching} onOpenChange={setSwitching} switching />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label={`Account, ${login}`}>
            <Avatar className="size-8">
              <AvatarFallback className="text-xs font-semibold uppercase">{login.slice(0, 2)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{login}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSwitching(true)}>
            <Repeat className="size-4" />
            Switch account
          </DropdownMenuItem>
          <form action={signOutAction}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOut className="size-4" />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
