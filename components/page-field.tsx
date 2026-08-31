// Decoration behind the whole marketing surface, drifting upward like the push
// stream the product watches. Positions are fixed rather than random so the
// server and client agree.
const MARKS: [string, string, string, string, string][] = [
  ["+", "add", "3%", "18%", "26s"],
  ["postinstall", "flag", "6%", "63%", "33s"],
  ["refs/heads/main", "brand", "9%", "88%", "37s"],
  ["-", "flag", "13%", "34%", "31s"],
  ["chmod 777", "flag", "17%", "8%", "29s"],
  ["~", "ai", "21%", "74%", "24s"],
  ["git push --force", "flag", "26%", "96%", "35s"],
  ["package.json", "brand", "31%", "78%", "39s"],
  ["+", "add", "36%", "12%", "27s"],
  ["eval(", "flag", "41%", "84%", "23s"],
  [".npmrc", "brand", "47%", "58%", "34s"],
  ["read_file()", "ai", "52%", "64%", "30s"],
  ["-", "flag", "57%", "92%", "25s"],
  ["a1c9f2", "brand", "64%", "34%", "34s"],
  ["curl | sh", "flag", "66%", "70%", "28s"],
  ["HEAD~1", "brand", "71%", "42%", "22s"],
  ["AWS_SECRET_ACCESS_KEY", "flag", "75%", "6%", "40s"],
  ["~", "ai", "79%", "88%", "26s"],
  [".github/workflows", "brand", "82%", "54%", "38s"],
  ["+", "add", "87%", "22%", "28s"],
  ["pull_request_target", "flag", "90%", "78%", "36s"],
  ["id_rsa", "flag", "95%", "38%", "31s"],
];

export function PageField() {
  return (
    <div className="page-field" aria-hidden>
      {MARKS.map(([glyph, tone, left, top, duration], index) => (
        <span
          key={`${glyph}-${left}`}
          className="page-mark"
          data-tone={tone}
          style={{
            left,
            top,
            animationDuration: duration,
            animationDelay: `-${index * 3}s`,
          }}
        >
          {glyph}
        </span>
      ))}
    </div>
  );
}
