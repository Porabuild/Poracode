---
name: android-design-foundations
description: Apply Google's Material 3 / Material 3 Expressive and Android Adaptive design guidelines together with Poracode's neutral-accent design tokens when designing, implementing, or reviewing Android phone, foldable, or tablet interfaces. Use with the relevant device-specific Android design skill.
---

# Android design foundations

Use the relevant `android-*-design` skill for form-factor decisions and read
[Android Design System & Architecture](../../docs/android-design-system.md) for
exact Poracode tokens, dp metrics, and shared Compose components. Follow
explicit product requirements and the repository's design system; never clone
iOS Liquid Glass chrome or stock Material You wallpaper tinting onto Android.

- **Material 3 + Poracode identity:** Build with Jetpack Compose and Material 3
  structure (tonal surface containment, crisp 4dp/8dp baseline grid, edge-to-edge
  insets, predictive back, spring feedback), styled through `PoracodeTheme.colors`
  (generated from PWA presets + custom themes), Geist / Geist Mono typography,
  and Lucide line icons (`PoracodeIcons`). Never use wallpaper dynamic color.
- **Tonal containment over faux glass:** On Android, express hierarchy through
  quiet tonal surface stepping (`background` -> `surface` -> `listRow` ->
  `default` + `1dp hairlineSoft`), not iOS-style floating frosted-glass pills
  everywhere. Reserve subtle Haze backdrop blur (`poracodeFloatingSurface`) for
  phone compact floating bottom chrome over scrolling lists; use clean docked
  tonal surfaces for tablet/foldable sidebars, headers, and inspector bars.
- **4dp / 8dp baseline grid & consistent control scale:** Align margins, gaps,
  heights, and padding to the 4dp/8dp grid (16dp compact horizontal margins,
  24dp medium/expanded pane margins, 8dp row gaps, 12dp card inner padding).
  Keep interactive touch targets >= 48x48dp (or 44dp minimum inside dense
  toolbars) while keeping visual controls compact and proportionate to Geist
  12–14sp typography — avoid oversized stadium pills, full-width chunky buttons,
  or raw unstyled `OutlinedCard` / `FilterChip` / `ModalBottomSheet` widgets.
- **One surface vocabulary:** Every framed content block across Settings,
  Inspector, Home Overview, and Controls uses `PoracodeCard` (12dp radius,
  `colors.listRow`, `1dp hairlineSoft`). Every interactive list row uses
  `PoracodeListRow` / `PoracodeNavRow`. Every drawer uses `PoracodeSheet`
  (24dp top corners, M3 grabber). Every switch uses `PoracodeSwitch` (never raw
  Material `Switch`).
- **Neutral accent contract:** Keep ordinary buttons, icons, tabs, navigation,
  and focus neutral (`foreground` / `muted`). Reserve `PoracodeTheme.colors.accent`
  strictly for explicit semantic opt-ins (`PoracodeSwitch` checked state,
  composer send soft wash, markdown links, active terminal Ctrl key, pairing
  forward action, brand wordmark dot, active filter indicator).
- **Accessibility & continuity:** Support edge-to-edge system bars
  (`statusBarsPadding`, `navigationBarsPadding`, `imePadding`), predictive back,
  TalkBack semantics (`contentDescription`, `selected`, `heading`), large font
  scales (fallback to overlay panes at `fontScale >= 1.5f`), RTL mirroring, and
  state/draft preservation across rotation, folding, and multi-window resizing.
- **Verify visually at real breakpoints:** Inspect live Android renders with
  representative data in Compact (`< 600dp`), Medium (`600–839dp`), and Expanded
  / Large (`>= 840dp`) windows in both dark and light modes.

Sources: [Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3),
[Android Adaptive Apps](https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps),
[Grids and units](https://developer.android.com/design/ui/mobile/guides/layout-and-content/grids-and-units),
[Material 3 Breakpoints](https://m3.material.io/foundations/layout/breakpoints/overview),
and [Material 3 Components](https://m3.material.io/components).
