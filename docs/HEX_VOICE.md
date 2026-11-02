# Native Hex voice input

Poracode's optional Hex backend uses the Hex service API version 2. Audio
settings can install or remove the pinned Hex 3.1.1 engine on supported hosts.
Downloads are verified against the release's pinned size and SHA-256 before
execution. ELF/PE architecture and format checks, Authenticode on Windows,
codesign/notarization and arm64 verification on macOS, and a bounded SDK service
probe are required before an installation is promoted. Managed files live in the
host's cache. Removing a managed engine does not remove Hex-owned model data.
Linux managed assets require glibc 2.39 or newer. Other platforms and
architectures do not have a managed release.

Audio settings keep model selection and test dictation on the page. **Set up
Hex…** or **Manage Hex…** opens a responsive engine-management dialog with
compatibility, installation progress, updates, removal and license information.
Opening it never starts a download; installation requires an explicit action.
Closing it does not cancel installation or model preparation.

An externally installed executable remains supported. Resolution order is the
host-only `PORACODE_HEX_EXECUTABLE` absolute path, the managed engine, then
`PATH`; renderer settings cannot provide an executable or download URL. The
managed release currently supports Linux x64/arm64 with glibc 2.39 or newer,
Windows x64/arm64, and macOS arm64. Other platforms and architectures must use
an externally installed compatible executable.

The `@kitlangton/hex` SDK and managed engine include the upstream MIT notice.
The native Hex service and downloaded models have their own third-party terms
that are not covered by the SDK's MIT license; review those terms before
preparing a model. Engine installation, model preparation, and transcription
are explicit operations. Poracode does not silently switch to the built-in
backend when Hex is unavailable or fails.

The engine pointer uses manifest schema 1. No earlier managed manifest was
released; schema 1 accepts safe versioned release directories for older
semver engine versions so a failed upgrade keeps the previous working engine
selected. Unknown schemas are refused and preserved rather than overwritten by an install. Model readiness
is checked before recording and never downloads a model implicitly. Model
preparation runs on the host after it starts and survives settings navigation
or renderer disconnects; settings can recover the latest preparation status.
The settings UI's optional retry retains at most two minutes of captured audio
in memory and retries only with the original host session, model, and language.

PWA voice input requires HTTPS (or localhost) and microphone permission. With
the built-in Transformers.js backend, audio is processed client-side. With Hex,
microphone audio is transmitted to the connected Poracode host for local
native processing; it is not sent to a cloud transcription service. The
built-in Transformers.js backend remains available as an explicit alternative.
