import { LogOut } from "lucide-react"
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
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="icon" title="Sign out" className="size-8">
          <LogOut className="size-4" />
        </Button>
      </form>
    </div>
  )
}
