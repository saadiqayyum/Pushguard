import ReactMarkdown from "react-markdown"

// react-markdown renders no raw HTML and strips javascript: links by default.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-6 [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-medium [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  )
}
