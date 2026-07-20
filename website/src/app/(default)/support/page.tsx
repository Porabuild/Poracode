import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import Link from "next/link";

import contact from "../../../../../branding/contact.json";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Poracode Support",
  description: "Get help pairing the Poracode mobile companion or report a problem.",
  path: "/support",
});

const ISSUES_URL = "https://github.com/SDSLeon/lightcode/issues";

export default function SupportPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-black text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,_rgba(255,255,255,0.05)_0%,_transparent_100%)]" />

      <nav className="relative z-50 mx-auto flex max-w-5xl items-center justify-between gap-4 px-8 py-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          <span className="text-sm font-medium">Back to home</span>
        </Link>
        <Link
          href="/privacy"
          className="text-sm font-medium text-gray-400 transition-colors hover:text-white"
        >
          Privacy →
        </Link>
      </nav>

      <main className="relative z-10 mx-auto max-w-3xl px-8 py-12">
        <header className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Poracode Support</h1>
          <p className="mt-3 text-lg leading-8 text-gray-400">
            Help with pairing, connections, notifications, and the Poracode mobile companion.
          </p>
        </header>

        <div className="mb-12 grid gap-4 sm:grid-cols-2">
          <a
            href={`mailto:${contact.supportEmail}`}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
          >
            <Mail className="mb-4 size-5 text-gray-400" />
            <span className="block font-semibold text-white">Email support</span>
            <span className="mt-1 block text-sm text-gray-400">{contact.supportEmail}</span>
          </a>
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
          >
            <ExternalLink className="mb-4 size-5 text-gray-400" />
            <span className="block font-semibold text-white">Report a bug</span>
            <span className="mt-1 block text-sm text-gray-400">Open a GitHub issue</span>
          </a>
        </div>

        <div className="space-y-10 text-[15px] leading-7 text-gray-300">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Pair a desktop</h2>
            <ol className="list-decimal space-y-2 pl-5 marker:text-gray-500">
              <li>Open Settings → Remote Access in the Poracode desktop app.</li>
              <li>Make sure Remote Access is enabled and the desktop is running.</li>
              <li>
                Scan its QR code in the mobile app, or enter the displayed endpoint and access token
                manually.
              </li>
              <li>
                For a local connection, keep the phone and desktop on the same trusted network.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">If the app cannot connect</h2>
            <ul className="list-disc space-y-2 pl-5 marker:text-gray-500">
              <li>
                Confirm the endpoint still opens from the phone and the access token is current.
              </li>
              <li>
                A web app loaded over HTTPS cannot connect to a plain HTTP desktop endpoint because
                browsers block mixed content. Use an HTTPS endpoint or the native mobile app.
              </li>
              <li>
                Check firewall, VPN, and Wi-Fi isolation settings if the devices cannot see each
                other on the local network.
              </li>
              <li>Remove the saved desktop and pair it again if its endpoint or token changed.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Camera and notifications</h2>
            <p>
              QR scanning needs camera permission; manual pairing remains available if permission is
              denied. Push notifications are optional and need system permission plus APNs or FCM
              connectivity. You can change notification settings in the app or operating system.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Send a useful report</h2>
            <p>
              Include the Poracode desktop and mobile versions, phone model, operating system,
              connection type, steps to reproduce, and the exact error. Attach relevant logs or
              screenshots, but remove access tokens, private source code, and other secrets first.
            </p>
          </section>

          <section className="border-t border-white/10 pt-8">
            <h2 className="mb-3 text-xl font-semibold text-white">More links</h2>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/download" className="text-white underline underline-offset-4">
                Downloads
              </Link>
              <Link href="/privacy" className="text-white underline underline-offset-4">
                Privacy policy
              </Link>
              <a
                href="https://github.com/SDSLeon/lightcode"
                target="_blank"
                rel="noreferrer"
                className="text-white underline underline-offset-4"
              >
                Source code
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
