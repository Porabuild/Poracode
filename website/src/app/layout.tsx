import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.lightcodeapp.com/"),
  title: "Lightcode - Universal AI Agent Orchestrator",
  description:
    "The universal desktop orchestrator for AI agents. Run terminal-native and structured chat agents side-by-side.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased dark:bg-black dark:text-white min-h-screen">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
