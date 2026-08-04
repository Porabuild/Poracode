import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import contact from "../../../../../branding/contact.json";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Poracode Privacy Policy",
  description:
    "How the Poracode mobile companion and website handle pairing, camera, push notification, and usage data.",
  path: "/privacy",
});

const EFFECTIVE_DATE = "July 15, 2026";

export default function PrivacyPage() {
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
          href="/support"
          className="text-sm font-medium text-gray-400 transition-colors hover:text-white"
        >
          Support →
        </Link>
      </nav>

      <main className="relative z-10 mx-auto max-w-3xl px-8 py-12">
        <header className="mb-12 border-b border-white/10 pb-8">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-lg text-gray-400">Effective and last updated {EFFECTIVE_DATE}</p>
        </header>

        <div className="space-y-10 text-[15px] leading-7 text-gray-300">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Overview</h2>
            <p>
              Poracode mobile is a companion for a Poracode desktop app that you control. It does
              not run product analytics or third-party crash reporting in mobile sessions, show ads,
              or sell personal information. This policy also explains the limited services used by
              the Poracode website and optional push notifications.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Data handled by the app</h2>
            <p>
              When you pair a desktop, the app stores connection details such as the desktop name
              and identifier, endpoint, access token, and your mobile preferences. It also receives
              and caches the projects, threads, terminal output, files, and settings that your
              paired desktop makes available. This data is used to provide the features you request.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Camera and QR scanning</h2>
            <p>
              Camera access is optional and is used only to scan a pairing QR code. Video frames are
              decoded on your device. Poracode does not record, store, or upload camera images or
              video. You can pair by entering the endpoint and token instead.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              Desktop connections and storage
            </h2>
            <div className="space-y-3">
              <p>
                App requests and live updates travel between your device and the paired desktop.
                Native builds keep pairing credentials in the operating system&apos;s secure
                storage; the web app uses encrypted browser storage when supported. Removing a
                paired desktop deletes its saved connection data from the app.
              </p>
              <p>
                Connections can use HTTPS or, in native builds, HTTP on a trusted local network.
                HTTPS encrypts data in transit; plain HTTP does not. Only use an HTTP endpoint on a
                network you trust.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Optional push notifications</h2>
            <p>
              If you enable notifications, the native app receives an Apple Push Notification
              service (APNs) or Firebase Cloud Messaging (FCM) token; an installed web app creates a
              browser Push API subscription. The app sends that registration to your paired desktop.
              The desktop may send the registration and notification content through Poracode&apos;s
              hosted service at poracode.com, which forwards the message to APNs, FCM, or the
              browser push service. Notification content can include a project or thread name and
              status needed to show the alert; desktop privacy settings can redact identifying
              titles. Apple, Google, Mozilla, Microsoft, and Poracode&apos;s hosting provider may
              process delivery data under their own terms. You can disable notifications or remove
              the paired desktop to unregister the device.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Website analytics</h2>
            <p>
              The public Poracode website uses Vercel Analytics and Speed Insights to understand
              aggregate site usage and performance. These website services are separate from the
              mobile companion session, where product analytics and remote diagnostics are disabled.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Sharing and retention</h2>
            <div className="space-y-3">
              <p>
                Poracode does not sell or rent mobile data or use it for advertising. Data is shared
                only when needed to connect to services you choose through the paired desktop, to
                deliver optional notifications, to operate the website, or when required by law.
              </p>
              <p>
                Pairing data and cached content remain on your device until you remove the desktop
                or clear the app&apos;s data. Push registrations remain on the paired desktop until
                they are unregistered or removed. Hosting and notification providers may retain
                operational or security logs according to their policies.
              </p>
              <p>
                If you email support or open a GitHub issue, Poracode receives the information you
                choose to provide and uses it to investigate the request and respond.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Security and children</h2>
            <p>
              Poracode uses access tokens and platform security features to protect connections and
              stored credentials, but no system is completely secure. Poracode is a developer tool
              and is not directed to children under 13.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Changes and contact</h2>
            <p>
              We may update this policy as Poracode changes and will publish the new effective date
              here. Questions or privacy requests can be sent to{" "}
              <a
                href={`mailto:${contact.supportEmail}`}
                className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
              >
                {contact.supportEmail}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
