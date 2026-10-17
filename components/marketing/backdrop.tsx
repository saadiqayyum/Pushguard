// Fixed behind the page so the shapes never change layout or scroll height.
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="backdrop-shape top-[-12rem] left-[-10rem] size-[34rem] bg-[var(--blob-1)]" />
      <div className="backdrop-shape top-[20vh] right-[-12rem] size-[30rem] bg-[var(--blob-2)]" />
      <div className="backdrop-shape bottom-[-14rem] left-[30vw] size-[26rem] rounded-[38%] bg-[var(--blob-3)]" />
    </div>
  )
}
