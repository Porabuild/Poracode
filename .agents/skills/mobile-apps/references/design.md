# Mobile design rules

Platform-specific visual rules for the three mobile surfaces. Behavior and
layout logic stay in parity; visual expression is idiomatic per platform.

## iOS (SwiftUI, Human Interface Guidelines)

- Use native SwiftUI navigation, sheets, context menus, SF Symbols, system
  typography/spacing, and platform conventions (swipe actions, haptics).
  Feature modules live in `ios/App/App/Features/<Name>/`.
- **Component reuse:** before styling a control locally, search
  `Features/Components/` and nearby feature conventions. Extract a focused
  shared component when two or more pages need the same placement, surface, or
  interaction pattern. Pages own their action and state; shared components own
  geometry, material, and interaction styling.
- **Menu color:** keep ordinary menu and drawer actions neutral — plain button
  styling with primary text and secondary symbols. Setting label foreground
  styles alone does not reliably override SwiftUI's default blue `Button` tint.
  Destructive actions use red text with a neutral secondary symbol unless the
  design explicitly calls for a red symbol. Use accent color only for an
  intentional semantic state such as a selected checkmark.
- **Icon color:** navigation, toolbar, composer, menu-trigger, provider, and
  ordinary action symbols are neutral primary/secondary. Apply the neutral tint
  to the owning `Button` or `Menu`, not only its nested `Image`, because native
  toolbar chrome can otherwise inherit the app accent. Reserve colored symbols
  or small status indicators for real semantic state (selection, active work,
  warning, failure, connectivity); provider identity alone is not a colored
  state.
- **Primary-action reachability:** on phone layouts, put a page's safe, central
  action in the bottom thumb-reachable area at the lower trailing side, not the
  top bar or horizontal center. Reuse `PoracodeBottomActionDock` for one action
  or `PoracodeBottomActionBar` for leading supporting actions plus a trailing
  primary action, built from `PoracodeCircleButton` or `PoracodeCircleMenu`;
  do not recreate the floating circle, blur, padding, or safe-area inset per
  page.
- **Compact action chrome:** prefer icon-only native circular controls for
  familiar actions, with localized accessibility labels. Search goes lower
  leading, add/create lower trailing. Avoid word buttons, accent-colored
  ordinary icons, and detached rows that consume vertical space.
- **Tabs:** use a real native selection control with its grouped Liquid Glass
  treatment for mutually exclusive modes, not independent circular buttons in
  the center. On phones, keep frequent mode switching near the bottom action
  area.
- **Information density:** page titles belong in the native navigation header.
  Content starts beneath the header, with only the clearance bottom controls
  and safe areas require.
- **Drawers:** native `.sheet` surfaces with `.insetGrouped` lists through
  `poracodeDrawerListStyle()` in `Features/Components/GlassHelpers.swift`. Let
  SwiftUI own presentation backgrounds, safe areas, and sheet corners; do not
  add transparent presentation backgrounds or nested rounded containers. The
  shared modifier owns scroll-content margins including bottom clearance. Size
  compact detents so every section plus that clearance is visible. Use
  `NavigationLink` inside one `NavigationStack` for drawer sublevels so they get
  native push/back animation.

## Android (Jetpack Compose, Material 3)

Follow Material 3. Theme lives in
`android/app/src/main/kotlin/com/poracode/app/ui/theme/`; feature packages in
`.../ui/<name>/`. Never clone iOS styling on Android.

## Mobile web (compact PWA)

- Follow the existing compact-layout patterns in `src/renderer/styles.css` and
  HeroUI v3 (load the `heroui-react` skill first). Reuse established shared
  components and recipes; no bespoke one-off treatments.
- **Action chrome:** put the page title in `MobilePageHeader`, remove avoidable
  top whitespace, and keep frequent actions in one thumb-reachable bottom row
  using `MobilePageBottomBar`, `MobilePageBottomAction`, `MobileCircleButton`,
  and `LightballTabs`: search lower leading, add/create lower trailing, a real
  segmented tab control between them at the same control height. Keep ordinary
  icons neutral; reserve accent color for semantic selection or status.
- **PWA-first correction:** when a live installed PWA exposes a shared mobile
  layout defect, fix and verify the compact PWA surface first, then align the
  native clients in their own idiom — unless the defect is demonstrably
  native-only.

## Visual verification

When comparing PWA and native simulators side by side, switch both to English
first, and capture the same state in light and dark appearance when theme
behavior is in scope.
