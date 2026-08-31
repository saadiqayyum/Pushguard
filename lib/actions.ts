"use server"

import { signOut } from "@/lib/auth"

// Named, not inline.
export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}
