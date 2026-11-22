---
name: android-foldable-design
description: Design, implement, or review native Android foldable interfaces across outer folded displays, unfolded inner Medium displays (600–839dp), book/tabletop hinge postures, and dynamic fold transitions.
---

# Android foldable design

Read [Android design foundations](../android-design-foundations/SKILL.md),
[Android phone design](../android-phone-design/SKILL.md), and
[Android Design System & Architecture](../../docs/android-design-system.md).

- **Folded outer vs unfolded inner displays:** Treat the folded outer display
  as Compact (`< 600dp`, single-pane phone UX) and the unfolded inner portrait
  / square display (`600–839dp`, Material 3 Medium breakpoint) as a spacious
  single-canvas workspace with 24dp horizontal margins and on-demand modal
  navigation drawer / side sheet overlays so the primary conversation or
  workspace overview keeps full readable width.
- **Hinge & posture awareness:** Observe `currentWindowAdaptiveInfoV2().windowPosture`
  (`hingeList`: `isVertical`, `isSeparating`, `isOccluding`, `bounds`).
  - **Book posture (vertical separating hinge):** When a vertical separating
    hinge splits two usable panes (`leading >= 240dp`, `trailing >= 380dp`),
    align the docked sidebar strictly to the leading side of the hinge, leave
    the exact hinge width as a neutral gutter, and place the detail canvas on
    the trailing side — never place text, buttons, or dialogs across the hinge.
  - **Tabletop posture (horizontal half-opened hinge):** Keep viewing content
    above the fold and interactive controls/composer below the fold where
    applicable; avoid dialogs straddling the horizontal crease.
- **Android-native modal drawers & side sheets:** On Medium inner screens,
  present the Home sidebar as a Material 3 modal navigation drawer (max 320dp
  wide, 24dp trailing corners, `colors.surface` container, dimmed scrim,
  predictive back to dismiss) and the thread inspector as a Material 3 modal
  side sheet (340–400dp wide, 24dp leading corners) — never an iOS floating
  glass card.
- **Seamless fold/unfold continuity:** Keep thread selection, composer focus,
  unsent drafts (`RichChatComposerDraftStore`), scroll positions, and open
  editor buffers above the adaptive container so folding, unfolding, or
  rotating never resets user work. Do not lock orientation to portrait.

Sources: [Make your app fold aware](https://developer.android.com/develop/adaptive-apps/guides/foldables/make-your-app-fold-aware),
[Foldable postures and orientation](https://developer.android.com/design/ui/mobile/guides/layout-and-content/postures-and-orientation),
[Material 3 Medium breakpoint](https://m3.material.io/foundations/layout/breakpoints/medium),
and [Material 3 Side Sheets](https://m3.material.io/components/side-sheets/specs).
