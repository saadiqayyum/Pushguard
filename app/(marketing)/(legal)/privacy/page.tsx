import { LegalDoc, legalMetadata } from "@/components/marketing/legal-doc"

export const metadata = legalMetadata("privacy")

export default function PrivacyPage() {
  return <LegalDoc slug="privacy" />
}
