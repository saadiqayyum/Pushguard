import Image from "next/image"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { auth, signIn } from "@/lib/auth"

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect("/")

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image src="/logo.svg" alt="Pushguard" width={56} height={56} priority />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Pushguard</h1>
            <p className="text-sm text-muted-foreground">
              Push monitoring for your GitHub organizations.
            </p>
          </div>
        </div>

        <form
          action={async () => {
            "use server"
            await signIn("github", { redirectTo: "/" })
          }}
        >
          <Button type="submit" className="w-full" size="lg">
            <GitHubMark className="size-4" />
            Continue with GitHub
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Access is limited to members of organizations that installed the app.
        </p>
      </div>
    </div>
  )
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}
