// The package ships no types. Only the two entry points Pushguard uses are
// declared; `hasConfusablesInFiles` reads from disk and has no place here.
declare module "anti-trojan-source" {
  export type ConfusableFinding = {
    line: number
    column: number
    /** `U+202E`. */
    codePoint: string
    /** `RIGHT-TO-LEFT OVERRIDE`. */
    name: string
    /** Unicode general category, e.g. `Cf (Format)`. */
    category: string
    severity: "high" | "low"
    snippet: string
  }

  export function hasConfusables(options: {
    sourceText: string
    detailed: true
    /** Also flag homoglyphs. Off by default: noisier, and a different attack. */
    extended?: boolean
  }): ConfusableFinding[]

  export function hasConfusables(options: {
    sourceText: string
    detailed?: false
    extended?: boolean
  }): boolean
}
