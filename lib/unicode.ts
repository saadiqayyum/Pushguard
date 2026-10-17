const ZWJ_IN_EMOJI = /(?<=[\p{Extended_Pictographic}\p{Emoji_Modifier}]️?)‍(?=[\p{Extended_Pictographic}\p{Emoji_Modifier}])/gu
const EMOJI_PRESENTATION = /(?<=\p{Extended_Pictographic})[︎️]|(?<=[0-9#*])️(?=⃣)/gu
const FLAG_TAGS = /(?<=\u{1F3F4})[\u{E0061}-\u{E007A}]{2,6}\u{E007F}/gu

// Blanks the joiners and selectors that well-formed emoji need, keeping UTF-16
// columns, so a Unicode check only sees ones that sit where emoji cannot explain them.
export function neutralizeEmoji(text: string, keepNbsp: boolean): string {
  const blank = (match: string) => " ".repeat(match.length)
  const out = text.replace(ZWJ_IN_EMOJI, blank).replace(EMOJI_PRESENTATION, blank).replace(FLAG_TAGS, blank)
  return keepNbsp ? out : out.replaceAll(" ", " ")
}
