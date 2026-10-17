import { generateSigningKeys } from "@/lib/platform/signing"

// Printed once, never written to disk: paste them into the host's secret store.
const { privateKey, publicKey } = generateSigningKeys()
process.stdout.write(`PLAYBOOK_SIGNING_KEY=${privateKey}\nPLAYBOOK_PUBLIC_KEY=${publicKey}\n`)
