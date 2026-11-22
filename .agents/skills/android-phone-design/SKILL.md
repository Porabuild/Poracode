---
name: android-phone-design
description: Design, implement, or review native Android phone (Compact width < 600dp) interfaces using Material 3 and Poracode's Android design system. Use android-foldable-design or android-tablet-design when those form factors are in scope.
---

# Android phone design

Read [Android design foundations](../android-design-foundations/SKILL.md) and
[Android Design System & Architecture](../../docs/android-design-system.md). In
Poracode, also apply [mobile-apps](../mobile-apps/SKILL.md).

- **Compact breakpoint (`width < 600dp`):** Use a single-pane layout with 16dp
  leading/trailing screen margins (12dp inner card padding, 8dp vertical list
  row spacing). Keep top headers at 56dp (`PoracodeMetrics.headerHeight`) with
  clean start/center title alignment and plain icon actions — no cluttered
  multi-row toolbars or divider lines beneath the header.
- **Thumb-reachable bottom dock:** Keep primary phone actions in the lower
  thumb zone using a unified Material 3 floating action bar (`HomeActionDock` /
  `PoracodeBottomBar`): search lower leading, primary prompt/compose pill in
  the center, overflow/more lower trailing. Reserve sufficient bottom list
  clearance (`96dp`) plus `navigationBarsPadding()` so content and composer
  controls never collide with the Android gesture navigation pill.
- **Touch-first rows & sheets:** Keep list rows clean with no trailing `"..."`
  menu buttons; tap opens the item, long press (`combinedClickable`) triggers
  haptics and opens a `PoracodeSheet` bottom sheet (24dp top corners, drag
  handle, 48dp min row height). Use bottom sheets for filters (Active/Done +
  projects), quick actions, and pickers.
- **Keyboard & IME continuity:** Apply `imePadding()` cleanly to the composer
  and quick-compose overlays so the input card stays anchored above the soft
  keyboard without double-counting navigation bar insets. Preserve unsent
  drafts and focus across IME toggles and configuration changes.
- **Predictive back:** Wire system back via `rememberPredictiveBackModifier`
  for open threads, sheets, overlays, search, and nested Settings routes.

Sources: [Material 3 Compact breakpoint](https://m3.material.io/foundations/layout/breakpoints/compact),
[Android Content Structure](https://developer.android.com/design/ui/mobile/guides/layout-and-content/content-structure),
[Material 3 Toolbars](https://m3.material.io/components/toolbars/specs),
and [Material 3 Bottom Sheets](https://m3.material.io/components/bottom-sheets/overview).
