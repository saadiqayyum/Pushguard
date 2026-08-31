import { LogOut, Repeat } from "lucide-react"
import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { signOutAction } from "@/lib/actions"

export function UserMenu({ login }: { login: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs font-semibold uppercase">{login.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <span className="hidden max-w-32 truncate text-sm font-medium md:block">{login}</span>
      <Button asChild variant="ghost" size="icon" title="Switch account" className="size-8">
        <Link href="/signin?switch=1">
          <Repeat className="size-4" />
        </Link>
      </Button>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="icon" title="Sign out" className="size-8">
          <LogOut className="size-4" />
        </Button>
      </form>
    </div>
  )
}
