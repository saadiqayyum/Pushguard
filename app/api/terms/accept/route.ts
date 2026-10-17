import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { acceptTerms, TERMS_VERSION } from "@/lib/terms"
import { termsAcceptBody, termsAcceptOut } from "@/schemas/terms"

export const POST = userRoute(
  "/api/terms/accept",
  async (request, _context, { login }) => {
    const { version } = termsAcceptBody.parse(await request.json())
    await acceptTerms(login, version)
    logger.info("terms_accepted", { login, version: TERMS_VERSION, via: "dialog" })
    return respond(termsAcceptOut, { version: TERMS_VERSION })
  },
  { termsExempt: true },
)
