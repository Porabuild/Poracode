import CoreGraphics
import SwiftUI
import XCTest

@testable import App

final class HomeAdaptiveLayoutPolicyTests: XCTestCase {
  func testAnOpenNestedVoiceSheetRetainsItsNavigationContainerDuringRotation() {
    let portrait = CGSize(width: 402, height: 874), landscape = CGSize(width: 874, height: 402)
    let fromPortrait = HomeAdaptiveLayoutPolicy.resolve(for: landscape, safeAreaInsets: EdgeInsets(),
      retainingMode: .compactSinglePane)
    XCTAssertEqual(fromPortrait.mode, .compactSinglePane)
    XCTAssertEqual(fromPortrait.detailWidth, landscape.width, "The sheet still gets the rotated width")
    XCTAssertEqual(fromPortrait.containerSize, landscape)
    XCTAssertEqual(HomeAdaptiveLayoutPolicy.resolve(for: landscape).mode, .splitTwoColumn,
      "Dismissing the sheet must immediately restore normal adaptation")

    let fromLandscape = HomeAdaptiveLayoutPolicy.resolve(for: portrait, safeAreaInsets: EdgeInsets(),
      retainingMode: .splitTwoColumn)
    XCTAssertEqual(fromLandscape.mode, .splitTwoColumn)
    XCTAssertEqual(fromLandscape.sidebarPresentation, .overlay)
    XCTAssertEqual(fromLandscape.detailWidth, portrait.width)
    XCTAssertEqual(HomeAdaptiveLayoutPolicy.resolve(for: portrait).mode, .compactSinglePane)
  }

  func testPortraitKeyboardGeometryCannotEnableALandscapeInspector() {
    let portrait = CGSize(width: 402, height: 874)
    let landscape = CGSize(width: 874, height: 402)
    let stale = PoracodeKeyboardViewport.height(portrait, matching: landscape)
    XCTAssertEqual(stale, 0)
    XCTAssertFalse(RichChatInspectorCapability.resolve(size: landscape, breakpoint: 760,
      keyboardUnobstructedHeight: stale).supportsInspector)
    let tablet = CGSize(width: 1180, height: 820)
    XCTAssertEqual(PoracodeKeyboardViewport.height(tablet,
      matching: CGSize(width: 1180, height: 420)), 820, "A keyboard still preserves the same window's height")
    XCTAssertEqual(PoracodeKeyboardViewport.height(.zero, matching: landscape), 0)
  }

  func testComposerKeyboardSpaceUsesItsOwnWindowWithoutShrinkingTheWorkspace() {
    let window = CGRect(x: 0, y: 0, width: 1180, height: 820)
    let keyboard = CGRect(x: 0, y: 500, width: 1180, height: 320)
    let coveredComposer = CGRect(x: 850, y: 690, width: 280, height: 76)
    let space = PoracodeKeyboardSpace.resolve(contentFrame: coveredComposer, windowBounds: window,
      keyboardFrame: keyboard, safeBottom: 20)
    XCTAssertEqual(space.overlap, 266, "A covered 76pt composer still needs the full distance to the keyboard")
    XCTAssertEqual(space.availableHeight, 500)
    let aboveKeyboard = PoracodeKeyboardSpace.resolve(contentFrame: CGRect(x: 0, y: 400, width: 280, height: 76),
      windowBounds: window, keyboardFrame: keyboard, safeBottom: 20)
    XCTAssertEqual(aboveKeyboard.overlap, 0, "Native sheets already above the keyboard must not avoid it twice")
    XCTAssertEqual(PoracodeKeyboardSpace.resolve(contentFrame: coveredComposer, windowBounds: window,
      keyboardFrame: CGRect(x: 0, y: 800, width: 1180, height: 20), safeBottom: 20), .init())
  }

  func testKeyboardAvoidanceCannotAmplifyAnOverflowingCompactInset() {
    let window = CGRect(x: 0, y: 0, width: 402, height: 874)
    let keyboard = CGRect(x: 0, y: 540, width: 402, height: 334)
    var bottom: CGFloat = 1_419
    for _ in 0..<20 {
      let space = PoracodeKeyboardSpace.resolve(contentFrame: CGRect(x: 12, y: bottom - 280, width: 378, height: 280),
        windowBounds: window, keyboardFrame: keyboard, safeBottom: 34)
      XCTAssertEqual(space.overlap, 334, "Overflow beyond the viewport cannot become additional keyboard padding")
      XCTAssertEqual(space.availableHeight, 540)
      bottom += space.overlap
    }
  }

  private static let allLocales: Set<String> = [
    "de", "en", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
  ]

  func testInspectorTabsFitTheResolvedPanelWidth() {
    let tabs = RichChatRightPanelTab.allCases
    let narrow = RichChatPanelTabLayout.split(tabs, width: 250, reservesExpand: false)
    XCTAssertEqual(narrow.inline, [.info, .files, .git])
    XCTAssertEqual(narrow.overflow, [.terminal, .browser, .notes, .ports, .sideChat])

    let expanded = RichChatPanelTabLayout.split(tabs, width: 290, reservesExpand: true)
    XCTAssertEqual(expanded.inline, [.info, .files, .git])
    XCTAssertEqual(expanded.overflow, [.terminal, .browser, .notes, .ports, .sideChat])

    let wide = RichChatPanelTabLayout.split(tabs, width: 440, reservesExpand: false)
    XCTAssertEqual(wide.inline, tabs)
    XCTAssertTrue(wide.overflow.isEmpty)
  }

  func testNarrowPortraitDevicesUseCompactSinglePane() {
    let compactSizes: [CGSize] = [
      .zero,
      CGSize(width: 320, height: 1180), // iPad Slide Over
      CGSize(width: 375, height: 667),  // iPhone SE portrait
      CGSize(width: 393, height: 852),  // iPhone 18 Pro portrait
      CGSize(width: 440, height: 956),  // iPhone 18 Pro Max portrait
      CGSize(width: 466, height: 678),  // iPhone Duo folded portrait
      CGSize(width: 500, height: 1180), // iPad 1/2 Split View narrow
    ]

    for size in compactSizes {
      let policy = HomeAdaptiveLayoutPolicy.resolve(for: size)
      XCTAssertEqual(policy.mode, .compactSinglePane, "Expected compact for \(size)")
      XCTAssertEqual(policy.sidebarPresentation, .none, "Expected no split sidebar for \(size)")
      XCTAssertFalse(policy.isSplit, "Expected non-split for \(size)")
      XCTAssertEqual(policy.sidebarWidth, 0, "Expected zero sidebar for \(size)")
      XCTAssertEqual(policy.detailWidth, size.width, "Expected full detail width for \(size)")
      XCTAssertFalse(policy.isCompactHeight, "Expected non-compact height for \(size)")
    }
  }

  func testPhoneLandscapeAndFoldedDuoLandscapeUseDockedSplitWithCompactHeight() {
    let landscapePhoneSizes: [CGSize] = [
      CGSize(width: 667, height: 375), // iPhone SE landscape
      CGSize(width: 678, height: 466), // iPhone Duo folded landscape
      CGSize(width: 852, height: 393), // iPhone 18 Pro landscape
      CGSize(width: 956, height: 440), // iPhone 18 Pro Max landscape
    ]

    for size in landscapePhoneSizes {
      let policy = HomeAdaptiveLayoutPolicy.resolve(for: size)
      XCTAssertEqual(policy.mode, .splitTwoColumn, "Expected split for \(size)")
      XCTAssertEqual(policy.sidebarPresentation, .docked, "Expected docked sidebar for \(size)")
      XCTAssertTrue(policy.isSplit, "Expected split for \(size)")
      XCTAssertTrue(policy.usesDockedSidebar)
      XCTAssertFalse(policy.usesOverlaySidebar)
      XCTAssertFalse(policy.isPortrait, "Expected landscape for \(size)")
      XCTAssertTrue(policy.isCompactHeight, "Expected compact height for \(size)")
      XCTAssertFalse(policy.isSidebarResizable, "Compact-height phones stay fixed width")
      XCTAssertGreaterThanOrEqual(policy.sidebarWidth, HomeAdaptiveLayoutPolicy.minimumSidebarWidth)
      XCTAssertLessThanOrEqual(policy.sidebarWidth, HomeAdaptiveLayoutPolicy.maximumSidebarWidth)
      XCTAssertGreaterThanOrEqual(policy.detailWidth, HomeAdaptiveLayoutPolicy.minimumDetailWidth)
      XCTAssertEqual(policy.sidebarWidth + policy.detailWidth, size.width, accuracy: 0.5)
    }
  }

  func testWidePortraitUsesOverlaySidebarAndFullWidthDetail() {
    let widePortraitSizes: [CGSize] = [
      CGSize(width: 580, height: 1180),  // Split threshold / medium Split View portrait
      CGSize(width: 669, height: 951),   // iPhone Duo unfolded portrait
      CGSize(width: 744, height: 1133),  // iPad mini portrait
      CGSize(width: 820, height: 1180),  // iPad Air 11" portrait
      CGSize(width: 1032, height: 1376), // iPad Pro 13" portrait
    ]

    for size in widePortraitSizes {
      let policy = HomeAdaptiveLayoutPolicy.resolve(for: size)
      XCTAssertEqual(policy.mode, .splitTwoColumn, "Expected split for \(size)")
      XCTAssertEqual(policy.sidebarPresentation, .overlay, "Expected overlay sidebar for \(size)")
      XCTAssertTrue(policy.isSplit)
      XCTAssertTrue(policy.usesOverlaySidebar)
      XCTAssertFalse(policy.usesDockedSidebar)
      XCTAssertTrue(policy.isPortrait, "Expected portrait for \(size)")
      XCTAssertFalse(policy.isCompactHeight, "Expected regular height for \(size)")
      XCTAssertFalse(policy.isSidebarResizable)
      XCTAssertGreaterThanOrEqual(policy.sidebarWidth, HomeAdaptiveLayoutPolicy.minimumSidebarWidth)
      XCTAssertLessThanOrEqual(policy.sidebarWidth, HomeAdaptiveLayoutPolicy.maximumSidebarWidth)
      XCTAssertEqual(policy.detailWidth, size.width, "Overlay sidebar keeps full detail width for \(size)")
    }
  }

  func testUnfoldedDuoAndAllIPadLandscapesUseDockedSplitWithoutCompactHeight() {
    let landscapeTabletSizes: [CGSize] = [
      CGSize(width: 951, height: 669),   // iPhone Duo unfolded landscape
      CGSize(width: 1133, height: 744),  // iPad mini landscape
      CGSize(width: 1180, height: 820),  // iPad Air 11" landscape
      CGSize(width: 1376, height: 1032), // iPad Pro 13" landscape
    ]

    for size in landscapeTabletSizes {
      let policy = HomeAdaptiveLayoutPolicy.resolve(for: size)
      XCTAssertEqual(policy.mode, .splitTwoColumn, "Expected split for \(size)")
      XCTAssertEqual(policy.sidebarPresentation, .docked, "Expected docked sidebar for \(size)")
      XCTAssertTrue(policy.isSplit)
      XCTAssertTrue(policy.usesDockedSidebar)
      XCTAssertTrue(policy.isSidebarResizable, "Expected resizable sidebar for \(size)")
      XCTAssertFalse(policy.isPortrait, "Expected landscape for \(size)")
      XCTAssertFalse(policy.isCompactHeight, "Expected regular height for \(size)")
      XCTAssertGreaterThanOrEqual(policy.sidebarWidth, HomeAdaptiveLayoutPolicy.minimumSidebarWidth)
      XCTAssertLessThanOrEqual(policy.sidebarWidth, HomeAdaptiveLayoutPolicy.maximumSidebarWidth)
      XCTAssertGreaterThanOrEqual(policy.detailWidth, HomeAdaptiveLayoutPolicy.minimumDetailWidth)
      XCTAssertEqual(policy.sidebarWidth + policy.detailWidth, size.width, accuracy: 0.5)
    }
  }

  func testPreferredSidebarWidthClampsAcrossDevicesAndIgnoresCompactPhones() {
    // iPad Pro 13" landscape clamps between 220 and 420
    let proWide = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 1376, height: 1032),
      safeAreaInsets: EdgeInsets(),
      preferredSidebarWidth: 600
    )
    XCTAssertEqual(proWide.sidebarWidth, HomeAdaptiveLayoutPolicy.maximumResizableSidebarWidth)
    XCTAssertEqual(proWide.detailWidth, 1376 - 420, accuracy: 0.5)

    let proNarrow = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 1376, height: 1032),
      safeAreaInsets: EdgeInsets(),
      preferredSidebarWidth: 120
    )
    XCTAssertEqual(proNarrow.sidebarWidth, HomeAdaptiveLayoutPolicy.minimumSidebarWidth)

    // Unfolded Duo landscape supports custom width up to 420 while keeping detail >= 356
    let duoCustom = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 951, height: 669),
      safeAreaInsets: EdgeInsets(),
      preferredSidebarWidth: 380
    )
    XCTAssertEqual(duoCustom.sidebarWidth, 380)
    XCTAssertGreaterThanOrEqual(duoCustom.detailWidth, HomeAdaptiveLayoutPolicy.minimumDetailWidth)

    // Compact-height landscape phone ignores stored desktop/iPad sidebar width
    let iphone17 = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 750, height: 381),
      safeAreaInsets: EdgeInsets(top: 0, leading: 62, bottom: 21, trailing: 62),
      preferredSidebarWidth: 400
    )
    XCTAssertFalse(iphone17.isSidebarResizable)
    XCTAssertEqual(iphone17.sidebarWidth, iphone17.defaultSidebarWidth)

    // Sub-760 docked split ignores stored wide width
    let narrowSplit = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 720, height: 680),
      safeAreaInsets: EdgeInsets(),
      preferredSidebarWidth: 400
    )
    XCTAssertFalse(narrowSplit.isSidebarResizable)
    XCTAssertEqual(narrowSplit.sidebarWidth, narrowSplit.defaultSidebarWidth)
  }

  func testSafeAreaAwareResolutionHandlesFoldedDuoAndIPhoneLandscape() {
    // iPhone Duo folded landscape (678x466) with Dynamic Island L/R safe areas (59pt each)
    // leaves 560x445 inside GeometryReader; adding safe areas preserves split mode.
    let duoFoldedInsets = EdgeInsets(top: 0, leading: 59, bottom: 21, trailing: 59)
    let duoFoldedLandscape = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 560, height: 445),
      safeAreaInsets: duoFoldedInsets
    )
    XCTAssertEqual(duoFoldedLandscape.mode, .splitTwoColumn)
    XCTAssertEqual(duoFoldedLandscape.sidebarPresentation, .docked)
    XCTAssertTrue(duoFoldedLandscape.isCompactHeight)
    XCTAssertFalse(duoFoldedLandscape.isPortrait)
    XCTAssertGreaterThanOrEqual(
      duoFoldedLandscape.effectiveDockedSidebarFrameWidth,
      HomeAdaptiveLayoutPolicy.minimumDockedInnerSidebarWidth
    )
    XCTAssertGreaterThanOrEqual(
      duoFoldedLandscape.safeContentWidth - duoFoldedLandscape.effectiveDockedSidebarFrameWidth,
      HomeAdaptiveLayoutPolicy.minimumDetailWidth
    )

    // iPhone 17 landscape (874x402) with 62pt L/R and 21pt bottom safe area
    // keeps leadingSafeAreaInset + docked frame aligned with sidebarWidth.
    let iphone17Insets = EdgeInsets(top: 0, leading: 62, bottom: 21, trailing: 62)
    let iphone17Landscape = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 750, height: 381),
      safeAreaInsets: iphone17Insets
    )
    XCTAssertEqual(iphone17Landscape.mode, .splitTwoColumn)
    XCTAssertEqual(iphone17Landscape.sidebarPresentation, .docked)
    XCTAssertTrue(iphone17Landscape.isCompactHeight)
    XCTAssertFalse(iphone17Landscape.isPortrait)
    XCTAssertLessThanOrEqual(
      iphone17Landscape.leadingSafeAreaInset + iphone17Landscape.effectiveDockedSidebarFrameWidth,
      iphone17Landscape.sidebarWidth + 0.5
    )
    XCTAssertGreaterThanOrEqual(
      iphone17Landscape.safeContentWidth - iphone17Landscape.effectiveDockedSidebarFrameWidth,
      HomeAdaptiveLayoutPolicy.minimumDetailWidth
    )
  }

  func testKeyboardDoesNotChangeWindowOrientationOrSidebarPresentation() {
    let landscape = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 1180, height: 768),
      safeAreaInsets: EdgeInsets(top: 32, leading: 0, bottom: 20, trailing: 0)
    )
    let landscapeWithKeyboard = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 1180, height: 366),
      safeAreaInsets: EdgeInsets(top: 32, leading: 0, bottom: 422, trailing: 0),
      keyboardUnobstructedHeight: 768
    )
    XCTAssertEqual(landscapeWithKeyboard, landscape)
    XCTAssertEqual(landscapeWithKeyboard.sidebarPresentation, .docked)

    let portrait = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 820, height: 1128),
      safeAreaInsets: EdgeInsets(top: 24, leading: 0, bottom: 28, trailing: 0)
    )
    let portraitWithKeyboard = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 820, height: 728),
      safeAreaInsets: EdgeInsets(top: 24, leading: 0, bottom: 428, trailing: 0),
      keyboardUnobstructedHeight: 1128
    )
    XCTAssertEqual(portraitWithKeyboard, portrait)
    XCTAssertEqual(portraitWithKeyboard.sidebarPresentation, .overlay)
  }

  func testDetailSizeClassOverrideRespondsToDockedAndOverlayModes() {
    // Portrait iPad uses overlay sidebar: detail gets full 744pt width -> keeps .regular
    let iPadMiniPortrait = HomeAdaptiveLayoutPolicy.resolve(for: CGSize(width: 744, height: 1133))
    XCTAssertEqual(
      iPadMiniPortrait.detailHorizontalSizeClassOverride(inheriting: .regular, isSidebarVisible: true),
      .regular
    )
    XCTAssertEqual(
      iPadMiniPortrait.detailHorizontalSizeClassOverride(inheriting: .regular, isSidebarVisible: false),
      .regular
    )

    // Docked landscape with narrow detail column (< 620pt) compacts while sidebar is visible
    let narrowDocked = HomeAdaptiveLayoutPolicy.resolve(for: CGSize(width: 667, height: 375))
    XCTAssertEqual(
      narrowDocked.detailHorizontalSizeClassOverride(inheriting: .regular, isSidebarVisible: true),
      .compact
    )
    XCTAssertEqual(
      narrowDocked.detailHorizontalSizeClassOverride(inheriting: .regular, isSidebarVisible: false),
      .regular
    )

    // Wide iPad Air 11" landscape (1180pt total -> ~850pt detail) stays .regular
    let iPadAirLandscape = HomeAdaptiveLayoutPolicy.resolve(for: CGSize(width: 1180, height: 820))
    XCTAssertEqual(
      iPadAirLandscape.detailHorizontalSizeClassOverride(inheriting: .regular, isSidebarVisible: true),
      .regular
    )

    // Compact inherited size class stays compact even when detail pane is wide
    let duoLandscape = HomeAdaptiveLayoutPolicy.resolve(for: CGSize(width: 951, height: 669))
    XCTAssertEqual(
      duoLandscape.detailHorizontalSizeClassOverride(inheriting: .compact, isSidebarVisible: true),
      .compact
    )
  }

  func testInspectorStaysClosedByDefaultAcrossSupportedWindowSizes() {
    let wideDetail = RichChatInspectorCapability.resolve(
      size: CGSize(width: 860, height: 820), breakpoint: 760
    )
    let tallerDetail = RichChatInspectorCapability.resolve(
      size: CGSize(width: 780, height: 820), breakpoint: 760
    )
    XCTAssertEqual(wideDetail, tallerDetail)
    XCTAssertTrue(tallerDetail.supportsInspector)
    XCTAssertFalse(tallerDetail.defaultOpen)

    let portrait = RichChatInspectorCapability.resolve(
      size: CGSize(width: 820, height: 1180), breakpoint: 760
    )
    XCTAssertTrue(portrait.supportsInspector)
    XCTAssertFalse(portrait.defaultOpen)

    let standalonePortrait = RichChatInspectorCapability.resolve(
      size: CGSize(width: 780, height: 820), breakpoint: 760
    )
    XCTAssertFalse(standalonePortrait.defaultOpen)

    let tooNarrow = RichChatInspectorCapability.resolve(
      size: CGSize(width: 599, height: 820), breakpoint: 960
    )
    XCTAssertFalse(tooNarrow.supportsInspector)
    XCTAssertFalse(tooNarrow.defaultOpen)

    let keyboardVisible = RichChatInspectorCapability.resolve(
      size: CGSize(width: 860, height: 420), breakpoint: 760,
      keyboardUnobstructedHeight: 820
    )
    XCTAssertTrue(keyboardVisible.supportsInspector)
    XCTAssertFalse(keyboardVisible.defaultOpen)
    let genuinelyShortWindow = RichChatInspectorCapability.resolve(
      size: CGSize(width: 860, height: 420), breakpoint: 760,
      keyboardUnobstructedHeight: 420
    )
    XCTAssertFalse(genuinelyShortWindow.supportsInspector)
  }

  func testInspectorOverlaysUntilTheConversationHasRoomForBothColumns() {
    for width: CGFloat in [600, 760, 820, 959] {
      let capability = RichChatInspectorCapability.resolve(size: CGSize(width: width, height: 820), breakpoint: 960)
      XCTAssertTrue(capability.supportsInspector)
      XCTAssertFalse(capability.docksInspector, "A narrow inspector must cover the chat instead of squeezing it")
      let range = RichChatInspectorGeometry.widthRange(available: width, docked: false)
      XCTAssertGreaterThanOrEqual(range.lowerBound, 360)
      XCTAssertLessThanOrEqual(range.upperBound, width - 24)
    }
    for width: CGFloat in [960, 1024, 1180, 1366] {
      let capability = RichChatInspectorCapability.resolve(size: CGSize(width: width, height: 820), breakpoint: 960)
      XCTAssertTrue(capability.docksInspector)
      let range = RichChatInspectorGeometry.widthRange(available: width, docked: true)
      XCTAssertGreaterThanOrEqual(range.lowerBound, 360)
      XCTAssertGreaterThanOrEqual(width - range.upperBound, 560, "Resizing must preserve a readable main chat")
      XCTAssertFalse(capability.defaultOpen)
    }
    XCTAssertFalse(RichChatInspectorCapability.resolve(size: CGSize(width: 1180, height: 820),
      breakpoint: .infinity).supportsInspector, "Auxiliary conversations do not acquire another inspector")
  }

  func testAccessibilitySizesGiveTheConversationAndSidebarMoreRoom() {
    let policy = HomeAdaptiveLayoutPolicy.resolve(
      for: CGSize(width: 1180, height: 820),
      safeAreaInsets: EdgeInsets(),
      preferredSidebarWidth: 260,
      accessibilitySize: true
    )
    XCTAssertEqual(policy.sidebarPresentation, .overlay)
    XCTAssertEqual(policy.detailWidth, 1180)
    XCTAssertEqual(policy.sidebarWidth, 560)
    XCTAssertFalse(policy.isSidebarResizable)

    let inspector = RichChatInspectorCapability.resolve(
      size: CGSize(width: 1180, height: 820), breakpoint: 760,
      accessibilitySize: true
    )
    XCTAssertFalse(inspector.supportsInspector)
    XCTAssertFalse(inspector.defaultOpen)
  }

  func testSplitHomeStringsTranslatedInAll13Locales() throws {
    let appRoot = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    let homeCatalog = appRoot.appendingPathComponent("App/Features/Home/Home.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: homeCatalog)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])

    let splitKeys = [
      "home.split.emptyTitle",
      "home.split.emptyDescription",
      "home.split.newTask",
      "home.split.toggleSidebar",
      "home.split.hideSidebar",
      "home.split.recentThreads",
      "home.split.toggleInspector",
      "home.split.resizeSidebar",
      "home.split.resizeInspector",
      "home.split.inspectorPanels",
      "home.split.expandPanel",
      "home.split.threadInfo",
      "home.split.threadInfo.path",
      "home.split.threadInfo.sessionId",
      "home.split.threadInfo.workspace",
    ]
    for key in splitKeys {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), Self.allLocales, key)
      for (locale, raw) in localizations {
        let localization = try XCTUnwrap(raw as? [String: Any], "\(key):\(locale)")
        let unit = try XCTUnwrap(localization["stringUnit"] as? [String: Any], "\(key):\(locale)")
        XCTAssertEqual(unit["state"] as? String, "translated", "\(key):\(locale)")
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true,
          "\(key):\(locale)"
        )
      }
    }
  }

  func testAdaptiveSplitFilesAreRegisteredInXcodeProject() throws {
    let projectURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App.xcodeproj/project.pbxproj")
    let project = try String(contentsOf: projectURL, encoding: .utf8)

    for filename in [
      "HomeAdaptiveLayoutPolicy.swift in Sources",
      "HomeSplitSidebarView.swift in Sources",
      "HomeSplitDetailEmptyView.swift in Sources",
      "RichChatRightPanelView.swift in Sources",
      "HomeAdaptiveLayoutPolicyTests.swift in Sources",
    ] {
      XCTAssertTrue(project.contains(filename), "Missing \(filename) in project.pbxproj")
    }
  }
}
