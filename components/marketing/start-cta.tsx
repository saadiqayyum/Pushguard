import { SignInLink } from "@/components/signin-dialog"
import { CTA, GitHubMark, InstallButton } from "@/components/site-chrome"
import { installUrl } from "@/lib/install-url"
import { INSTALL_START } from "@/lib/signin"

// Static on purpose: the button reads the signed-in hint on click, and the route checks the session.
export function StartCta() {
  if (!installUrl()) return <InstallButton href={null} />
  return (
    <SignInLink href={INSTALL_START} next={INSTALL_START} className={CTA}>
      <GitHubMark className="size-[1.125rem]" />
      Install on GitHub
    </SignInLink>
  )
}
