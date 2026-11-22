---
name: android-tablet-design
description: Design, implement, or review native Android tablet interfaces (Expanded 840–1199dp and Large 1200dp+), canonical List-Detail and Supporting Pane workspaces, docked sidebars, side-sheet inspectors, and keyboard/pointer ergonomics.
---

# Android tablet design

Read [Android design foundations](../android-design-foundations/SKILL.md) and
[Android Design System & Architecture](../../docs/android-design-system.md). In
Poracode, also apply [mobile-apps](../mobile-apps/SKILL.md) and verify parity
with iPad and desktop workflows.

- **Canonical List-Detail & Supporting Pane layouts:**
  - **Expanded (`840–1199dp`) & Large (`1200dp+`) landscape:** Use a persistent,
    collapsible docked sidebar (`280–340dp` default, draggable-resizable within
    `240–400dp` via an Android drag handle pill inside a subtle pane divider) +
    a flexible main detail pane (`24dp` horizontal margins, centered reading
    measure `maxWidth = 840dp` for transcript & composer).
  - **Supporting Pane (Right Inspector):** On wide detail viewports (`>= 800dp`
    available detail width), dock the switchable Thread Inspector (`320–400dp`,
    resizable) cleanly beside the conversation as a Material 3 standard side
    sheet (`colors.surface` tonal fill + `1dp hairline` separator). On narrower
    viewports (`600–799dp`), present it as a modal side sheet (`24dp` leading
    corners). Opening the inspector is always an explicit user toggle.
  - **Tablet portrait (`600–839dp` Medium):** Prefer a full-width detail canvas
    with a toggleable modal navigation drawer so conversations and code diffs
    remain comfortable to read.
- **Android-idiomatic panel chrome (no iOS glass cloning):**
  - Sidebar header, search input, workspace selector, and footer shortcuts use
    flat tonal Material 3 surfaces (`RoundedCornerShape(12.dp)` for inputs and
    selectors, clean docked footer strip with `48dp` targets and subtle
    `hairline` top divider) — never stacked floating iOS glass capsules.
  - Inspector panel switching (`Info`, `Files`, `Git`, `Terminal`, `Notes`,
    `Browser`, `Ports`) uses a clean Material 3 docked icon tab bar with a
    tonal active pill indicator (`RoundedCornerShape(12.dp)`), keeping tabs
    visually anchored to the inspector pane rather than floating in space.
- **Two-column utility & settings screens:** Use canonical two-pane splits on
  `>= 720–760dp` for Settings (persistent Device + Desktop navigation pane +
  centered `maxWidth = 720dp` detail pane), Projects, and Connections. Keep
  dialogs and Quick Compose as centered compact modal cards (`maxWidth = 640dp`,
  `24dp` corners) rather than full-width edge-to-edge sheets.
- **Keyboard, mouse, & multi-window support:** Support hardware keyboard
  shortcuts (`Ctrl/Cmd+\` sidebar, `Ctrl/Cmd+I` inspector, `Ctrl/Cmd+N` new
  thread, `Ctrl/Cmd+,` settings, `Escape` dismiss), resizable multi-window /
  DeX / desktop windowing transitions, and large-font fallback (`fontScale >= 1.5f`).

Sources: [Material 3 Expanded breakpoint](https://m3.material.io/foundations/layout/breakpoints/expanded),
[Material 3 Large & Extra-Large breakpoints](https://m3.material.io/foundations/layout/breakpoints/large-extra-large),
[Canonical layouts](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts),
[Supporting pane layout](https://developer.android.com/develop/adaptive-apps/guides/build-a-supporting-pane-layout),
and [Material 3 Side Sheets](https://m3.material.io/components/side-sheets/specs).
