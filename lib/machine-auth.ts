import { createHash, timingSafeEqual } from "node:crypto"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"

// Hashing both sides first gives equal-length buffers, so the comparison
// leaks neither the secret's bytes nor its length through timing.
export function requireBearer(request: Request): void {
  const header = request.headers.get("authorization") ?? ""
  const given = createHash("sha256").update(header).digest()
  const expected = createHash("sha256").update(`Bearer ${env().CRON_SECRET}`).digest()
  if (!timingSafeEqual(given, expected)) throw new AppError("unauthorized", "Bad credentials")
}
