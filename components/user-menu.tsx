import { LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { signOutAction } from "@/lib/actions"

export function UserMenu({ login }: { login: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs font-semibold uppercase">{login.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{login}</span>
      <form action={signOutAction}>
        <button
          type="submit"
          title="Sign out"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  )
}
