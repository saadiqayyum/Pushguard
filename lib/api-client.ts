"use client"

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
}

export class ApiClientError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ?? { code: "internal", message: "Request failed" }
    throw new ApiClientError(error.code, error.message)
  }
  return payload.data as T
}
