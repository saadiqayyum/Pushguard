import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { installUrl } from "@/lib/install-url"

// The install button sends signed-in users here; anyone else goes back to the landing page.
export async function GET() {
  const url = installUrl()
  if (!url || !(await auth())?.user) redirect("/")
  redirect(url)
}
