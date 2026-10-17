// Docs mark code with backticks; everything between a pair renders as code.
export function InlineCode({ text }: { text: string }) {
  return text.split("`").map((part, index) =>
    index % 2 ? (
      <code key={index} className="mono rounded-sm bg-muted px-1 py-px text-[0.875em] break-words">
        {part}
      </code>
    ) : (
      part
    ),
  )
}
