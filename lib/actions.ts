"use server"

import { signOut } from "@/lib/auth"

/**
 * Named, not inline.
 *
 * `action={async () => { "use server"; ... }}` buries a server action inside
 * JSX, where it cannot be read, reused or tested apart from the markup it sits
 * in. Actions live here.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}
