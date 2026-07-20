import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { createPageMetadata, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/seo";

// Geist is the Poracode brand typeface (branding/BRAND.md §7). Exposed as CSS
// vars that globals.css maps onto Tailwind's --font-sans / --font-mono.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

// Token from Google Search Console's "HTML tag" verification method. Set it as
// the GOOGLE_SITE_VERIFICATION env var (Vercel → Project → Settings → Env Vars);
// the <meta name="google-site-verification"> tag is emitted only when present.
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const ROOT_METADATA: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  ...createPageMetadata({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  title: {
    default: SITE_TITLE,
    template: `%s - ${SITE_NAME}`,
  },
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Developer Tools",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "358x358" },
    ],
    apple: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
  },
  manifest: "/manifest.webmanifest",
  ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
};

export function SiteDocument({
  children,
  lang,
}: Readonly<{ children: React.ReactNode; lang: string }>) {
  return (
    <html
      lang={lang}
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-night text-moon antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
