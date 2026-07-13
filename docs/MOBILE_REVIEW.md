# Poracode Mobile — review, competitive comparison & roadmap

A review of the Poracode mobile PWA (`src/mobile/`), how it stacks up against
the comparable mobile apps from Claude and Codex, the gaps that were closed on
this branch, and a prioritized backlog for the rest.

## What Poracode mobile is

A PWA that **pairs to a desktop** over an embedded HTTP + WebSocket server and
acts as a remote control for the agents running there. It reuses the desktop
renderer's components through a bridge shim, hydrates a resumable event stream
into the shared stores, and renders threads, GUI/terminal transcripts, git/PR
review, a mirrored desktop browser, settings, and provider usage.

This is the **same product category** as:

- **Codex in the ChatGPT app** — monitor/approve/steer a Codex agent running on
  your Mac; review diffs, switch models, dispatch tasks. Worker stays on the
  desktop; you can't edit code directly on the phone.
- **Claude Code mobile** (the remote feature in the Claude app) — follow a Claude
  Code session, get notified, intervene.
- Third-party relays like **Happy** and **Omnara** ("Claude & Codex mobile") —
  remote-control apps for the same desktop agents, via a cloud relay.

So the right bar isn't "a chatbot app"; it's "a remote control for a desktop
coding agent." Poracode already matches that shape and goes _further_ on some
axes (git/PR review, live browser mirroring, multi-desktop) while trailing on a
few table-stakes mobile niceties.

## Feature comparison

| Capability                                       | Poracode (before)        | Poracode (this branch)                           | Codex (ChatGPT) | Claude Code mobile |
| ------------------------------------------------ | ------------------------ | ------------------------------------------------ | --------------- | ------------------ |
| Pair / connect to desktop agent                  | ✅ QR + manual           | ✅ + **in-app camera scanner**                   | ✅ (account)    | ✅ (account)       |
| Thread/task list                                 | ✅                       | ✅ + **loading skeletons**                       | ✅              | ✅                 |
| Follow live transcript                           | ✅                       | ✅                                               | ✅              | ✅                 |
| Send / steer / interrupt                         | ✅                       | ✅                                               | ✅              | ✅                 |
| Approve tool/permission requests                 | ✅                       | ✅                                               | ✅              | ✅                 |
| Diff / PR review on phone                        | ✅ (strong)              | ✅                                               | ✅              | ➖ limited         |
| Live desktop browser mirror                      | ✅ (unique)              | ✅                                               | ❌              | ❌                 |
| Multi-desktop switching                          | ✅                       | ✅                                               | ➖              | ➖                 |
| **Reconnect / offline UX**                       | ➖ fixed retry, silent   | ✅ **backoff + online events + banner**          | ✅              | ✅                 |
| **Push notifications (turn done / needs input)** | ❌                       | ❌ (designed, not built)                         | ✅              | ✅                 |
| Installable PWA / app-store presence             | ➖ runtime-only manifest | ✅ **static PWA + Capacitor + release pipeline** | ✅ (in ChatGPT) | ✅ (in Claude)     |
| Deep link → installed app vs web                 | ❌                       | ✅ **association files + hosted QR**             | ✅              | ✅                 |
| Voice input                                      | ❌                       | ❌                                               | ➖              | ✅                 |
| Works off the LAN (anywhere)                     | ➖ LAN/HTTPS only        | ➖ (tunnel story documented)                     | ✅ (cloud)      | ✅ (cloud)         |

Legend: ✅ yes · ➖ partial/limited · ❌ none.

## What this branch shipped

Connection & loading (the explicit asks):

- **Resilient reconnect** — exponential backoff with full jitter (cap 20s),
  `online`/`offline` and `visibilitychange` listeners that reconnect instantly
  instead of waiting out a timer, a distinct `reconnecting` state, and a manual
  `reconnect()` (`src/mobile/useRemoteDesktop.ts`).
- **Connection banner** — a persistent, actionable banner for
  reconnecting/offline/expired/error states, separate from transient toasts
  (`ConnectionBanner` in `components.tsx`, wired in `RootLayout.tsx`).
- **Loading indicators** — thread-list skeletons, a thread-history progress bar,
  and pairing progress, plus shimmer styles (`styles.css`).

Onboarding & linking:

- **In-app QR scanner** — camera-based pairing via `BarcodeDetector` with a jsQR
  fallback (works on iOS Safari too) and graceful manual fallback
  (`QrScanner.tsx`, wired into `DesktopsView`).
- **Deep-link association files** — `assetlinks.json` + `apple-app-site-association`
  so a scanned link opens the installed native app or falls back to the PWA.
- **Mixed-content guard** — clear messaging when an HTTPS-hosted PWA can't reach a
  plain-HTTP LAN desktop (`isMixedContentEndpoint`).

Productionization:

- **Installable PWA** — static `manifest.webmanifest`, full icon set (192/512/
  maskable/apple-touch), and in-app service-worker registration.
- **Vercel deploy** — `vercel.json` + a mobile-only build target
  (`pnpm run build:mobile` → `dist/mobile`).
- **Native apps** — `capacitor.config.json` for iOS/Android store builds.
- **Release pipeline** — `.github/workflows/release-mobile.yml` with per-platform
  toggles (web/Android/iOS) for partial releases. See `docs/RELEASE_MOBILE.md`.

## Top remaining gap: push notifications

Both Codex and Claude Code mobile alert you when a turn **completes** or **needs
input**. Poracode has none — you must keep the app foregrounded. This is the
single highest-value next feature and the desktop already emits the needed
signals.

Recommended design (incremental):

1. **Foreground/awake** — already covered: the WebSocket streams `thread-state`
   transitions; surface an in-app toast/sound on `working → idle|attention` for
   threads other than the open one.
2. **Background, PWA** — Web Push: register a `PushManager` subscription against a
   VAPID key, have the desktop (or a relay) send a push on turn completion, and
   show it from the service worker's `push` handler. Works on Android/desktop
   PWAs and iOS 16.4+ installed PWAs.
3. **Background, native** — Capacitor Push Notifications (APNs/FCM) for the store
   apps, same desktop-side trigger.

The cross-LAN constraint applies: background push needs the desktop reachable by
a relay or push service, which dovetails with the tunnel work below.

## Prioritized backlog

1. **Push notifications** (turn complete / needs input) — Web Push + native. _(P0)_
2. **Off-LAN access story** — document/support a tunnel (Tailscale Funnel /
   Cloudflare Tunnel) so the hosted PWA and background push work outside the LAN;
   today only the LAN PWA and native apps reach a plain-HTTP desktop. _(P0)_
3. **Offline action queue** — queue sends/commands made while offline and flush on
   reconnect, instead of failing silently. _(P1)_
4. **Pull-to-refresh + haptics** on the thread list and transcripts. _(P1)_
5. **Thread search & filter** beyond the project picker. _(P2)_
6. **Live terminal** — terminal threads are read-only scrollback; a real PTY
   stream would match the GUI threads. _(P2)_
7. **Security hardening for public deployment** — token revocation, rate limiting
   on `/oauth/token`, tighter CORS than `*` (see remote-server review). _(P1 if
   hosted)_
8. **Voice input** for prompts (Claude parity; lower priority for a dev tool). _(P3)_

## Architecture & design notes

- **Reuse-the-desktop-components** approach is a real strength: the mobile app
  inherits behavior and styling for free and stays consistent with the desktop.
  Keep new mobile-only chrome in `src/mobile/styles.css` (it does) and prefer
  thin route wrappers (`routeComponents.tsx`) over forking desktop components.
- **One source of truth for connection state** — `useRemoteDesktop` owns it; the
  banner/pill/skeletons are pure consumers. Keep it that way; don't scatter
  ad-hoc `fetch` error handling across views.
- **Icons/manifest** now have a static source (`public/`) mirrored by the desktop
  server's runtime generators (`pairingPage.ts`). When changing branding, update
  both (a comment in `pairingPage.ts` points at `public/app-icon.svg`).
- **Mixed content is the defining constraint.** It cleanly splits the targets:
  LAN-PWA and native shells reach the plain-HTTP desktop; the hosted PWA needs an
  HTTPS desktop. The product should lead users to the LAN PWA or native app for
  same-network use and reserve the hosted PWA for the tunnel/HTTPS case.

## Sources

- [OpenAI improves Codex iOS experience with turn completion alerts (9to5Mac)](https://9to5mac.com/2026/05/21/openai-improves-codex-ios-experience-with-turn-completion-alerts-new-commands-more/)
- [Codex Mobile App: monitor & control your AI coding agent (ofox.ai)](https://ofox.ai/blog/codex-mobile-app-iphone-android-2026/)
- [Claude Code mobile push notifications (Medium)](https://medium.com/@joe.njenga/how-im-using-new-claude-code-mobile-push-notifications-for-hands-off-coding-79fa924709ae)
- [Using voice mode on Claude mobile apps (Anthropic)](https://support.anthropic.com/en/articles/11101966-using-voice-mode-on-claude-mobile-apps)
- [Happy: Codex & Claude Code app (App Store)](https://apps.apple.com/us/app/happy-codex-claude-code-app/id6748571505) · [Omnara: Claude & Codex mobile (App Store)](https://apps.apple.com/us/app/omnara-claude-codex-mobile/id6748426727)
