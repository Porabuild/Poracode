import { ROOT_METADATA, SiteDocument } from "@/app/site-document";

export const metadata = ROOT_METADATA;

export default function DefaultRootLayout({ children }: { children: React.ReactNode }) {
  return <SiteDocument lang="en">{children}</SiteDocument>;
}
