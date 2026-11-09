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
  primary action, built from neutral `PoracodeCircleButton` or
  `PoracodeCircleMenu`; do not recreate the floating circle, blur, padding, or
  safe-area inset per page.
- **Compact action chrome:** prefer icon-only native circular controls for
  familiar actions, with localized accessibility labels. Search goes lower
  leading, add/create lower trailing. Avoid word buttons, accent-colored
  ordinary icons, and detached rows that consume vertical space.
- **Tabs:** mutually exclusive modes use one selection control, not
  independent circular buttons in the center. Floating mode switches near the
  bottom action area use `PoracodeGlassTabs` (one interactive glass platter,
  accent only on the selected segment); segmented choices inside content or a
  top bar stay a native segmented `Picker`. Keep switches as native `Toggle`
  with `.poracodeSwitchStyle()` on every switch, which gives the on state the
  theme accent as in the PWA. Style modifiers set on the theme root do not
  reach sheet content (environment values do), so a root-level
  `.toggleStyle` leaves sheet switches in the neutral root tint. On iOS 26 the
  system draws glass thumbs for both controls, so do not restyle them further.
- **Liquid Glass:** functional controls and chrome get Liquid Glass through the
  shared layer in `Features/Components/` (`PoracodeGlass.swift`,
  `PoracodeButtonStyles.swift`, `GlassHelpers.swift`,
  `ActionComponents.swift`). Features never call `glassEffect`,
  `GlassEffectContainer`, glass or bordered button styles,
  `safeAreaBar`/`safeAreaInset`, or zoom-transition APIs directly;
  `testLiquidGlassPrimitivesLiveOnlyInTheSharedComponentLayer` enforces this,
  and every primitive carries its iOS 17 fallback. `PoracodeButtonStyles.swift`
  stays portable (`#available(iOS 26.0, macOS 26.0, *)`, no iOS-only API)
  because the macOS contract packages under `ios/App/AppTests/*/Package.swift`
  symlink it next to the feature sources they compile.
  - Buttons: `poracodeGlassButtonStyle()` for neutral actions on a page, list,
    sheet, or transcript; `poracodeSurfaceButtonStyle()` for buttons that sit
    on a glass, composer, or banner surface, because glass never stacks on
    glass. Like the PWA's neutral primary buttons, ordinary primary actions
    also use `poracodeGlassButtonStyle()`. The accent-filled
    `poracodeProminentButtonStyle()` is limited to the pairing forward actions
    (connect, confirm, Scan QR) and destructive fills (`tint: .red`);
    `testAccentIsReservedForPrimaryActions` holds the allowlist. Neutral
    styles default to a primary label.
  - Bars: attach bottom and top chrome with `poracodeBottomBar` and
    `poracodeTopBar` (a safe-area bar with the system scroll-edge effect) and
    use `poracodeBarBackground()` instead of `.background(.bar)`. On iOS 26 the
    controls float with no bar background. The exception is chrome that hosts
    the expanding UIKit composer editor: `safeAreaBar` keeps it from expanding
    on tap, so the thread composer uses a measured bottom overlay on phones and
    `poracodeComposerInset` in the wide layout.
  - Groups and morphs: wrap neighboring floating controls in
    `PoracodeGlassGroup` with a spacing below their resting gap so they do not
    fuse at rest. Give pieces that morph into each other a shared
    `poracodeGlassID`, and zoom sheets out of their trigger with
    `poracodeZoomSource` and `poracodeZoomTransition`.
  - Surfaces: composer bars, floating bubbles, and transient banners are glass.
    Content cards, list rows, and decorative glyph backgrounds stay material
    or plain, and sheets keep the system presentation background.
  - Identity: stay as neutral as the desktop app and PWA. The theme root sets
    a neutral `.tint(Color.primary)` and injects the theme accent as
    `\.poracodeAccent`. Only these read it: the composer send and Home start
    soft wash (accent at 20% with a primary glyph), switch on states, markdown
    links, the terminal's active modifier key, and the allowlisted prominent
    buttons. Selection, checkmarks, tabs, icons, toolbar text, and create
    buttons stay neutral. The app has no AccentColor asset, so
    `Color.accentColor` resolves to the neutral tint or to system blue; it is
    banned outside `Features/Components/` and `AppTheme.swift`.
- **Row actions:** touch first. List rows carry no small trailing "…" or icon
  buttons that open menus. Tap performs the primary action, and a long press
  opens the same items through `.contextMenu`, mirrored in
  `.accessibilityActions` so VoiceOver keeps them. A non-interactive status
  glyph, such as the neutral check on the selected host, may stay.
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

## Android (Jetpack Compose, Poracode PWA language)

Android follows the compact PWA's design language, not stock Material 3: Compose
and Material components stay the toolkit, but colors, type, shapes, icons, and
page chrome come from the Poracode design system in
`android/app/src/main/kotlin/com/poracode/app/ui/theme/` (feature packages in
`.../ui/<name>/`). Never clone iOS styling on Android.

- **Tokens and themes:** `PoracodeColors` comes from
  `PoracodeThemePresets.kt`, generated by
  `bun scripts/generate-android-themes.ts` from the PWA's
  `src/renderer/theme/themePresets.ts` and the compact overrides in
  `styles.css`. The generated presets match the PWA and iOS theme gallery
  (Appearance ▸ Theme, persisted as `themeId`), and the default preset
  reproduces the hand-tuned palette. Rerun the generator after a PWA theme
  change; `--check` fails when the file is stale. `PoracodeTheme` maps the
  colors onto the Material color scheme; there is no wallpaper-based dynamic
  color. Read `PoracodeTheme.colors` for Poracode roles (`listRow`, `glass`,
  `composerSurface`, `muted`, `hairline`, …) instead of Material roles.
- **Neutral accent:** as in the PWA, buttons and focus are neutral. The Material
  scheme maps `primary` to the foreground, so stock TextButton, OutlinedButton,
  progress, checkbox, radio, and focus colors stay neutral. Neutral filled
  actions use `FilledTonalButton`. The accent appears only through explicit
  opt-ins: `PoracodeSwitch` on states, the composer send and Home start soft
  wash (`accentSoft` with a foreground glyph), markdown links (accent +
  underline), the terminal's active Ctrl key, pairing visuals,
  `PoracodeAccentButton` for the pairing forward actions, the brand wordmark
  dot, and the active project filter. Never call Material `Switch` directly.
- **Glass:** floating chrome over scrolling content blurs what is behind it,
  matching the PWA's backdrop blur and iOS Liquid Glass. Wrap the screen in
  `PoracodeHazeHost` (Haze) and apply its backdrop modifier to the scrolling
  content; `poracodeFloatingSurface` then blurs automatically. Without a host it
  falls back to the translucent fill.
- **Android touches:** keep the PWA/iOS visuals, but let interaction feel
  native. Circle buttons, pills, chips, and segments spring-scale on press
  (`rememberPressScale`, off under reduced motion); switches, segments, and row
  long-presses give haptics; in-app back uses the shared predictive-back
  helper. `MotionScheme.expressive()` is internal in the resolved material3
  1.4.0, so don't add it until a stable release exposes it.
- **Git summaries:** read per-thread git state through `GitSummaryResolver`,
  which uses the precomputed `gitSummaryByTarget` index (published summaries
  first, then the served `gitState` targets). Never decode git JSON in
  composition; list rows must stay O(1).
- **Type and icons:** Geist / Geist Mono (`res/font`, OFL) at the PWA scale
  (`PoracodeTypography`, `PoracodeTextStyles`). Icons are the PWA's lucide set
  through `PoracodeIcons`, generated by `scripts/generate-android-icons.mjs`;
  add a lucide mapping there instead of using `material-icons`.
- **Shared components** (`ui/components/`): reuse these instead of restyling
  Material components per screen.
  - Headers: `PoracodeHomeHeader`, `PoracodePageHeader`, and
    `PoracodeTopAppBar`, all 48 dp.
  - Bottom row: `PoracodeBottomBar` with `PoracodeCircleButton` and
    `PoracodeFloatingPill`. Search or refresh sits lower leading; add or more
    sits lower trailing. Lists under it reserve about 96 dp of bottom padding.
  - Rows: `PoracodeListRow` for thread, connection, project, and port rows;
    `PoracodeNavRow` (icon tile, title, subtitle, chevron) for settings and
    index pages; `PoracodeSectionLabel` for group headings;
    `PoracodeProjectHostLine` for the project/host meta line.
  - Drawers: `PoracodeSheet` and `PoracodeSheetAction`, with `PoracodeTone`
    (Warning for archive, Danger for delete or disconnect) and
    `PoracodeSheetDivider`. `PoracodeSheetSections` holds the shared option,
    toggle, and choice sections for controls sheets.
  - Controls: `PoracodeSegmentedControl` for 2–4 exclusive choices,
    `PoracodeChip` for quiet picker chips, and `PoracodeTextField` for inputs
    (label above a flat field).
- **Interaction:** touch first. A long press on any list row (threads,
  connections, projects, environments, MCP servers, forwards, schedules) opens
  its actions drawer through `combinedClickable(onLongClick = …,
  onLongClickLabel = …)`; rows carry no small trailing "…" buttons. Tap keeps
  the row's primary action. The thread header keeps one "…" drawer. The thread
  composer is a one-line pill that expands into its toolbar card on focus or
  content.

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
