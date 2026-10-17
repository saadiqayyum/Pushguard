import { AsyncLocalStorage } from "node:async_hooks"
import pLimit from "p-limit"

export type GitHubMeter = { calls: number; limit: ReturnType<typeof pLimit> }

const meters = new AsyncLocalStorage<GitHubMeter>()

// Every GitHub request made inside `fn` is counted and held to `concurrency` in flight.
export async function withGitHubMeter<T>(concurrency: number, fn: (meter: GitHubMeter) => Promise<T>): Promise<T> {
  const meter: GitHubMeter = { calls: 0, limit: pLimit(concurrency) }
  return meters.run(meter, () => fn(meter))
}

// Token minting runs inside another request's hook, so waiting for a slot there
// would deadlock a full limiter. It is counted, never queued.
export function metered<T>(url: string, send: () => Promise<T>): Promise<T> {
  const meter = meters.getStore()
  if (!meter) return send()
  meter.calls++
  return url.startsWith("/app/") ? send() : meter.limit(send)
}

type Hookable = {
  hook: {
    wrap(name: "request", wrapper: (request: (options: { url: string }) => Promise<unknown>, options: { url: string }) => Promise<unknown>): void
  }
}

export function githubMeterPlugin(octokit: Hookable): void {
  octokit.hook.wrap("request", (request, options) => metered(options.url, () => request(options)))
}
