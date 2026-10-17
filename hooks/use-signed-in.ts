"use client"

import { useEffect, useSyncExternalStore } from "react"
import { api } from "@/lib/api-client"
import type { SessionStatus } from "@/lib/session-check"

let status: SessionStatus = "unknown"
let inflight: Promise<SessionStatus> | null = null
const listeners = new Set<() => void>()

// One request at a time, shared by every button on the page. A failed check leaves the status unknown.
export function checkSession(): Promise<SessionStatus> {
  inflight ??= api<{ signedIn: boolean }>("/api/session")
    .then((r): SessionStatus => (r.signedIn ? "signed-in" : "signed-out"))
    .catch((): SessionStatus => "unknown")
    .then((result) => {
      status = result
      inflight = null
      listeners.forEach((listener) => listener())
      return result
    })
  return inflight
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useSignedIn(): SessionStatus {
  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && void checkSession()
    const idle = window.requestIdleCallback ? window.requestIdleCallback(() => void checkSession()) : window.setTimeout(() => void checkSession(), 1)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])
  return useSyncExternalStore(subscribe, () => status, () => "unknown")
}
