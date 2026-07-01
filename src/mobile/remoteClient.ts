// The remote transport now lives in `@/shared/remote/client` so the desktop
// renderer can use it too (desktop-as-client). This re-export keeps the PWA's
// existing `./remoteClient` import sites working unchanged.
export * from "@/shared/remote/client";
