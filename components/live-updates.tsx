"use client"

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"

export type LiveEvent = "sync" | "alert" | "scan" | "installation"
type Listener = (event: LiveEvent) => void

const REFRESH_DEBOUNCE_MS = 400
const EVENTS: LiveEvent[] = ["sync", "alert", "scan", "installation"]

const LiveContext = createContext<Set<Listener> | null>(null)

let shared: SupabaseClient | null | undefined

// One client per tab. Realtime only: no auth session is created or stored.
function realtimeClient(): SupabaseClient | null {
  if (shared !== undefined) return shared
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  shared = url && anonKey
    ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null
  return shared
}

// Subscribes to the org topics the server handed over. Each nudge re-renders
// server components and tells client listeners; nothing polls. Without the
// public Supabase settings it stays silent and pages update on their next load.
export function LiveUpdates({ topics, children }: { topics: string[]; children?: ReactNode }) {
  const router = useRouter()
  const [listeners] = useState(() => new Set<Listener>())
  const key = topics.join(",")

  useEffect(() => {
    const client = realtimeClient()
    if (!client || key === "") return

    let timer: ReturnType<typeof setTimeout> | undefined
    const onEvent = (event: LiveEvent) => {
      for (const listener of listeners) listener(event)
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS)
    }

    const channels: RealtimeChannel[] = key.split(",").map((topic) => {
      const channel = client.channel(topic)
      for (const event of EVENTS) channel.on("broadcast", { event }, () => onEvent(event))
      return channel.subscribe()
    })
    return () => {
      clearTimeout(timer)
      for (const channel of channels) void client.removeChannel(channel)
    }
  }, [key, listeners, router])

  return <LiveContext.Provider value={listeners}>{children}</LiveContext.Provider>
}

export function useLive(event: LiveEvent, handler: () => void) {
  const listeners = useContext(LiveContext)
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    if (!listeners) return
    const listener: Listener = (fired) => {
      if (fired === event) latest.current()
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [event, listeners])
}
