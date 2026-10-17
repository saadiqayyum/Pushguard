import { LegalDoc, legalMetadata } from "@/components/marketing/legal-doc"

export const metadata = legalMetadata("terms")

export default function TermsPage() {
  return <LegalDoc slug="terms" />
}
