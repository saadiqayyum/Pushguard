import { Bug, Eye, GitBranch, GitCommitHorizontal, KeyRound, Lock, Package, Radar, Shield, Terminal, Workflow, Fingerprint, type LucideIcon } from "lucide-react"

type Drift = { icon: LucideIcon; top: string; left: string; size: number; tone: string; seconds: number; dx: string; dy: string; turn: string; wide?: boolean }

// Positions are percentages of the viewport, so nothing can push the page wider at 360px.
const ICONS: Drift[] = [
  { icon: Shield, top: "12%", left: "6%", size: 44, tone: "--cat-ci-cd", seconds: 32, dx: "18px", dy: "-22px", turn: "8deg" },
  { icon: Bug, top: "22%", left: "88%", size: 36, tone: "--cat-ai", seconds: 27, dx: "-20px", dy: "16px", turn: "-12deg" },
  { icon: Lock, top: "68%", left: "4%", size: 30, tone: "--cat-multi-stage", seconds: 36, dx: "14px", dy: "18px", turn: "10deg" },
  { icon: KeyRound, top: "80%", left: "84%", size: 40, tone: "--cat-packages", seconds: 24, dx: "-16px", dy: "-20px", turn: "-8deg" },
  { icon: GitBranch, top: "44%", left: "94%", size: 28, tone: "--cat-hidden-code", seconds: 30, dx: "-12px", dy: "20px", turn: "14deg", wide: true },
  { icon: GitCommitHorizontal, top: "6%", left: "52%", size: 26, tone: "--cat-ci-cd", seconds: 22, dx: "22px", dy: "12px", turn: "-6deg", wide: true },
  { icon: Package, top: "56%", left: "46%", size: 52, tone: "--cat-packages", seconds: 38, dx: "-18px", dy: "-14px", turn: "6deg", wide: true },
  { icon: Terminal, top: "34%", left: "2%", size: 24, tone: "--cat-ai", seconds: 26, dx: "16px", dy: "-12px", turn: "-10deg", wide: true },
  { icon: Eye, top: "90%", left: "30%", size: 32, tone: "--cat-hidden-code", seconds: 34, dx: "20px", dy: "-16px", turn: "12deg" },
  { icon: Radar, top: "30%", left: "70%", size: 56, tone: "--cat-multi-stage", seconds: 40, dx: "-14px", dy: "22px", turn: "-5deg", wide: true },
  { icon: Workflow, top: "74%", left: "62%", size: 28, tone: "--cat-ci-cd", seconds: 29, dx: "12px", dy: "-18px", turn: "9deg", wide: true },
  { icon: Fingerprint, top: "4%", left: "28%", size: 34, tone: "--cat-ai", seconds: 35, dx: "-16px", dy: "14px", turn: "-9deg", wide: true },
]

// Landing page only. Fixed behind the content, transform-only motion, static when reduced motion is asked for.
export function DriftIcons() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {ICONS.map(({ icon: Icon, top, left, size, tone, seconds, dx, dy, turn, wide }, index) => (
        <Icon
          key={index}
          className={`drift-icon absolute opacity-[0.13] dark:opacity-[0.16] ${wide ? "hidden sm:block" : ""}`}
          strokeWidth={1.5}
          style={
            {
              top,
              left,
              width: size,
              height: size,
              color: `var(${tone})`,
              animationDuration: `${seconds}s`,
              animationDelay: `-${index * 3}s`,
              "--dx": dx,
              "--dy": dy,
              "--turn": turn,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
