"use client"

import { Loader2 } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"
import { Logo } from "@/components/logo"
import { GitHubMark } from "@/components/site-chrome"
import { TermsLinks } from "@/components/terms-gate"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { checkSession, useSignedIn } from "@/hooks/use-signed-in"
import { continueWithGitHub } from "@/lib/actions"
import { clickAction } from "@/lib/session-check"
import { cn } from "@/lib/utils"

const SPINNER_DELAY_MS = 300

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <GitHubMark className="size-4" />}
      Continue with GitHub
    </Button>
  )
}

const block = (event: Event) => event.preventDefault()

// `next` defaults to the page it opens on; the server keeps it only if it is an app path.
export function SignInDialog({
  open,
  onOpenChange,
  next,
  switching = false,
  dismissable = true,
}: {
  open: boolean
  onOpenChange?: (open: boolean) => void
  next?: string
  switching?: boolean
  dismissable?: boolean
}) {
  const pathname = usePathname()
  const lock = dismissable ? undefined : block
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={dismissable}
        onEscapeKeyDown={lock}
        onPointerDownOutside={lock}
        onInteractOutside={lock}
        className="justify-items-center gap-6 p-6 text-center sm:max-w-sm"
      >
        <Logo className="size-10" />
        <div className="grid gap-2">
          <DialogTitle className="text-lg">Sign in to Pushguard</DialogTitle>
          <DialogDescription className="sr-only">Sign in with GitHub</DialogDescription>
        </div>
        <form action={continueWithGitHub} className="grid w-full gap-3">
          <input type="hidden" name="next" value={next ?? pathname} />
          {switching && <input type="hidden" name="switch" value="1" />}
          <Submit />
          <p className="text-xs leading-relaxed text-muted-foreground">
            By continuing, you agree to the <TermsLinks />
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Guarded layouts render this in place of the page; the URL stays, and GitHub returns to it.
export function SignInGate({ switching = false }: { switching?: boolean }) {
  return <SignInDialog open dismissable={false} switching={switching} />
}

// Signed in: navigate. Signed out: open the dialog in place. Unknown: wait for the
// check, with a spinner only if it is slow; the label stays laid out, so the width holds.
export function SignInLink({ href, next, className, children, ...props }: React.ComponentProps<"a"> & { href: string; next?: string }) {
  const router = useRouter()
  const status = useSignedIn()
  const [open, setOpen] = useState(false)
  const [slow, setSlow] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function act(action: "navigate" | "dialog") {
    if (action === "dialog") setOpen(true)
    else if (href.startsWith("/api/")) window.location.assign(href)
    else router.push(href)
  }

  async function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    const action = clickAction(status)
    if (action !== "wait") return act(action)
    timer.current = window.setTimeout(() => setSlow(true), SPINNER_DELAY_MS)
    const settled = clickAction(await checkSession())
    window.clearTimeout(timer.current)
    setSlow(false)
    act(settled === "dialog" ? "dialog" : "navigate")
  }

  return (
    <>
      <a href={href} onClick={onClick} aria-busy={slow || undefined} className={cn("relative", className)} {...props}>
        <span className={cn("contents", slow && "invisible")}>{children}</span>
        {slow && (
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          </span>
        )}
      </a>
      <SignInDialog open={open} onOpenChange={setOpen} next={next ?? href} />
    </>
  )
}
