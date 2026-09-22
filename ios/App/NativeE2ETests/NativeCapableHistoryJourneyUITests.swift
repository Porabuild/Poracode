import UIKit
import UniformTypeIdentifiers
import XCTest

/// B1 CAPABLE-HOST iOS visible-recovery journey (integrated into `NativeE2ETests`).
///
/// This file lives in the `NativeE2ETests` target and is driven only by the
/// gated runner `tests/native-e2e/iosCapableHistoryJourney.test.ts`
/// (`IOS_CAPABLE_HISTORY_JOURNEY=1`), which builds and launches it against the
/// frozen capable host. The explicit acknowledgement is addressable because
/// `RichChatNoticeBanner.swift` publishes
/// `native-e2e.historyNotice.acknowledge` on the action and exposes the
/// banner's children (`.contain`).
///
/// Runner contract: every value arrives in the test-runner environment injected
/// into the `NativeE2ETests` blueprint of the xctestrun file by
/// `tests/native-e2e/helpers/iosCapableHistoryJourney.ts`. The runner has
/// already uninstalled the app and booted the dedicated simulator, so this test
/// always starts from onboarding with a fresh pair. `print` output is the marker
/// transport; each marker is printed only after its phase asserted.
@MainActor
final class NativeCapableHistoryJourneyUITests: XCTestCase {
  private struct Configuration {
    let pairingURL: URL
    let threadId: String
    let userMarker: String
    let assistantMarker: String
    let liveMarker: String
    let episodeTitle: String
    let durableTitle: String
    let acknowledgeIdentifier: String
    let reconnectMarker: String
    let offlineTitle: String
    let interfaceStyle: String?

    init(environment: [String: String]) throws {
      guard let rawURL = environment["IOS_CAPABLE_HISTORY_PAIRING_URL"],
        let url = URL(string: rawURL),
        let threadId = environment["IOS_CAPABLE_HISTORY_THREAD_ID"],
        let userMarker = environment["IOS_CAPABLE_HISTORY_USER_MARKER"],
        let assistantMarker = environment["IOS_CAPABLE_HISTORY_ASSISTANT_MARKER"],
        let liveMarker = environment["IOS_CAPABLE_HISTORY_LIVE_MARKER"],
        let episodeTitle = environment["IOS_CAPABLE_HISTORY_EPISODE_TITLE"],
        let durableTitle = environment["IOS_CAPABLE_HISTORY_DURABLE_TITLE"],
        let acknowledgeIdentifier = environment["IOS_CAPABLE_HISTORY_ACK_IDENTIFIER"],
        let reconnectMarker = environment["IOS_CAPABLE_HISTORY_RECONNECT_MARKER"],
        let offlineTitle = environment["IOS_CAPABLE_HISTORY_OFFLINE_TITLE"],
        !threadId.isEmpty,
        !userMarker.isEmpty,
        !assistantMarker.isEmpty,
        !liveMarker.isEmpty,
        !reconnectMarker.isEmpty,
        !offlineTitle.isEmpty
      else {
        throw XCTSkip("iOS capable-history journey is not configured.")
      }
      pairingURL = url
      self.threadId = threadId
      self.userMarker = userMarker
      self.assistantMarker = assistantMarker
      self.liveMarker = liveMarker
      self.episodeTitle = episodeTitle
      self.durableTitle = durableTitle
      self.acknowledgeIdentifier = acknowledgeIdentifier
      self.reconnectMarker = reconnectMarker
      self.offlineTitle = offlineTitle
      let style = environment["IOS_CAPABLE_HISTORY_INTERFACE_STYLE"]
      interfaceStyle = (style == "Dark" || style == "Light") ? style : nil
    }
  }

  private let app = XCUIApplication()
  private var configuration: Configuration!

  override func setUp() async throws {
    continueAfterFailure = false
    configuration = try Configuration(environment: ProcessInfo.processInfo.environment)
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    if let interfaceStyle = configuration.interfaceStyle {
      app.launchArguments += [
        "-AppleInterfaceStyle", interfaceStyle,
        "-ios.appearance.mode", interfaceStyle.lowercased(),
      ]
    }
  }

  func testCapableHistoryVisibleRecovery() async throws {
    addUIInterruptionMonitor(withDescription: "System network confirmation") { alert in
      let allowPaste = alert.buttons["Allow Paste"]
      if allowPaste.exists {
        allowPaste.tap()
        return true
      }
      let allow = alert.buttons["Allow"]
      if allow.exists {
        allow.tap()
        return true
      }
      return false
    }

    app.launch()
    XCTAssertTrue(revealPairingLinkField(timeout: 20).exists)
    try pastePairingURL(configuration.pairingURL)
    confirmPairingIfNeeded()

    // Fresh pair against the owned profile: the seeded thread is reachable.
    let thread = app.buttons["native-e2e.thread.\(configuration.threadId)"]
    XCTAssertTrue(thread.waitForExistence(timeout: 30))
    marker("FRESH_PAIR")
    attachScreenshot("01-fresh-pair")
    thread.tap()

    // 1. Blocked history: the refused authoritative read leaves the transcript
    //    surface in its failure branch (the timeline only renders once the
    //    acknowledged read succeeds), so the blocked state is the visible
    //    episode notice with its explicit action and no retained prefix.
    let banner = noticeBanner()
    XCTAssertTrue(banner.waitForExistence(timeout: 30))
    XCTAssertTrue(
      banner.label.contains(configuration.episodeTitle),
      "Expected the blocked-history notice, got: \(banner.label)"
    )
    let acknowledge = app.buttons[configuration.acknowledgeIdentifier]
    XCTAssertTrue(acknowledge.waitForExistence(timeout: 10))
    XCTAssertTrue(acknowledge.isHittable, "The acknowledgement action must be visible and tappable")
    XCTAssertFalse(
      app.staticTexts
        .matching(NSPredicate(format: "label CONTAINS %@", configuration.userMarker))
        .firstMatch.exists,
      "The retained user prefix must not render before the acknowledgement"
    )
    marker("BLOCKED_NOTICE")
    attachScreenshot("02-blocked-notice")

    // 2. Explicit acknowledgement -> durable notice; the episode action is gone.
    acknowledge.tap()
    marker("ACK_TAPPED")
    XCTAssertTrue(
      waitForBannerLabel(configuration.durableTitle, timeout: 60),
      "The durable notice must replace the episode notice after acknowledgement"
    )
    XCTAssertFalse(
      app.buttons[configuration.acknowledgeIdentifier].exists,
      "The acknowledgement action must disappear once the episode is acknowledged"
    )
    attachScreenshot("03-after-ack")

    // 3. BOTH canonical prefix messages render. The acknowledgement requests an
    //    authoritative refresh; the loaded transcript brings the timeline back.
    let timeline = app.descendants(matching: .any)["native-e2e.timeline"]
    XCTAssertTrue(
      timeline.waitForExistence(timeout: 60),
      "The acknowledged transcript must load the timeline"
    )
    XCTAssertTrue(revealText(configuration.userMarker, in: timeline, timeout: 30).isHittable)
    attachScreenshot("04a-user-prefix-visible")
    XCTAssertTrue(revealText(configuration.assistantMarker, in: timeline, timeout: 30).isHittable)
    marker("PREFIX_VISIBLE")
    attachScreenshot("04-prefix-visible")

    // 4. The exact live done marker from the real supervisor append. The runner
    //    starts the structured ACP fixture only after observing the durable
    //    acknowledgement, so this waits for content produced after the ack.
    XCTAssertTrue(
      revealText(configuration.liveMarker, in: timeline, timeout: 180).isHittable,
      "The exact live done marker must render"
    )
    marker("LIVE_VISIBLE")
    attachScreenshot("05-live-visible")

    // 5. Background/foreground. Retention of cached content is not the gate:
    //    the client must first return to an actual renewed online state (the
    //    online-gated authoritative refresh clears the failure band), and only
    //    then is one more controlled ACP turn driven through the live
    //    supervisor session. The runner acts exactly once the RECONNECT_ONLINE
    //    marker appears, so the fresh marker below cannot have pre-existed the
    //    renewed connection: it proves post-foreground live delivery.
    XCUIDevice.shared.press(.home)
    XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10))
    try await Task.sleep(for: .seconds(3))
    app.activate()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
    attachScreenshot("06a-foreground-immediate")
    XCTAssertTrue(
      waitForOfflineFailureGone(timeout: 60),
      "After foregrounding, the client must re-establish the live connection and clear the offline failure band"
    )
    XCTAssertTrue(
      waitForBannerLabel(configuration.durableTitle, timeout: 30),
      "The durable notice must survive the reconnect"
    )
    XCTAssertTrue(
      revealText(configuration.userMarker, in: timeline, timeout: 30).isHittable)
    XCTAssertTrue(
      revealText(configuration.assistantMarker, in: timeline, timeout: 30).isHittable)
    XCTAssertTrue(
      revealText(configuration.liveMarker, in: timeline, timeout: 30).isHittable)
    attachScreenshot("06b-reconnect-online")
    marker("RECONNECT_ONLINE")
    XCTAssertTrue(
      revealText(configuration.reconnectMarker, in: timeline, timeout: 180).isHittable,
      "The freshly driven post-foreground live marker must render from the renewed socket"
    )
    marker("RECONNECT_LIVE_VISIBLE")
    attachScreenshot("07-reconnect-live-visible")
    XCTAssertTrue(
      waitForBannerLabel(configuration.durableTitle, timeout: 30),
      "The durable notice must remain attached after the fresh delivery"
    )
    XCTAssertTrue(
      revealText(configuration.userMarker, in: timeline, timeout: 30).isHittable)
    XCTAssertTrue(
      revealText(configuration.assistantMarker, in: timeline, timeout: 30).isHittable)
    XCTAssertTrue(
      revealText(configuration.liveMarker, in: timeline, timeout: 30).isHittable)
    XCTAssertTrue(
      revealText(configuration.reconnectMarker, in: timeline, timeout: 30).isHittable)
    marker("RECONNECT_RETAINED")
    attachScreenshot("08-reconnect-retained")
  }

  // ── Marker transport (the runner requires every one of these) ─────────────

  private func marker(_ name: String) {
    print("IOS_CAPABLE_HISTORY_UI_\(name)")
  }

  private func attachScreenshot(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  // ── Notice banner queries ─────────────────────────────────────────────────

  private func noticeBanner() -> XCUIElement {
    app.descendants(matching: .any)["native-e2e.historyNotice"]
  }

  private func waitForBannerLabel(_ needle: String, timeout: TimeInterval) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    let banner = noticeBanner()
    while Date().compare(deadline) == .orderedAscending {
      if banner.exists, banner.label.contains(needle) { return true }
      _ = banner.waitForExistence(timeout: 0.5)
    }
    return banner.exists && banner.label.contains(needle)
  }

  /// Requires the post-foreground offline failure band to be absent. A fast
  /// reconnect may never show it; the separately driven fresh response and
  /// host connection samples provide the renewed-connection evidence.
  private func waitForOfflineFailureGone(timeout: TimeInterval) -> Bool {
    let band = app.staticTexts
      .matching(NSPredicate(format: "label CONTAINS %@", configuration.offlineTitle))
      .firstMatch
    let deadline = Date().addingTimeInterval(timeout)
    while Date().compare(deadline) == .orderedAscending {
      if !band.exists { return true }
      _ = band.waitForExistence(timeout: 0.5)
    }
    return !band.exists
  }

  // ── Timeline reveal (LazyVStack) ──────────────────────────────────────────

  /// Reveals a hittable timeline message, rather than accepting an offscreen
  /// accessibility element. The deadline also covers delayed live arrivals.
  ///
  /// The visibility check runs as a direct main-thread query each iteration.
  /// `XCTNSPredicateExpectation` with a block predicate is evaluated once and
  /// never re-evaluated (a probe with a trivially-true predicate timed out with
  /// exactly one evaluation), so every waiter ran to its timeout even when the
  /// text was already visible; the direct query settles as soon as the element
  /// is hittable.
  private func revealText(
    _ needle: String,
    in container: XCUIElement,
    timeout: TimeInterval
  ) -> XCUIElement {
    let element = container.staticTexts
      .matching(NSPredicate(format: "label CONTAINS %@", needle))
      .firstMatch
    let deadline = Date().addingTimeInterval(timeout)
    var scrolls = 0
    while Date().compare(deadline) == .orderedAscending {
      if element.exists && element.isHittable { return element }
      guard Date().compare(deadline) == .orderedAscending else { break }
      if scrolls % 8 < 4 {
        container.swipeUp()
      } else {
        container.swipeDown()
      }
      scrolls += 1
    }
    return element
  }

  // ── Pairing helpers (same pasteboard flow as the mock journeys) ───────────

  @discardableResult
  private func revealPairingLinkField(timeout: TimeInterval = 10) -> XCUIElement {
    let field = app.textFields["native-e2e.pairing-link"]
    if field.waitForExistence(timeout: timeout) { return field }
    let expander = app.buttons["native-e2e.pair.manual"]
    if expander.waitForExistence(timeout: 5) {
      expander.tap()
      _ = field.waitForExistence(timeout: timeout)
    }
    return field
  }

  private func pastePairingURL(_ pairingURL: URL) throws {
    UIPasteboard.general.setItems(
      [[UTType.plainText.identifier: pairingURL.absoluteString]],
      options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(30)]
    )
    defer { UIPasteboard.general.items = [] }
    let field = revealPairingLinkField()
    XCTAssertTrue(field.exists)
    field.tap()
    field.press(forDuration: 1)
    let paste = app.menuItems["Paste"]
    XCTAssertTrue(paste.waitForExistence(timeout: 5))
    paste.tap()
    app.navigationBars.firstMatch.tap()
    let submit = app.buttons["native-e2e.pair.submit"]
    XCTAssertTrue(submit.waitForExistence(timeout: 5))
    XCTAssertTrue(submit.isHittable, "Connect must remain visible after entering a pairing link")
    submit.tap()
  }

  private func confirmPairingIfNeeded() {
    let confirm = app.buttons["native-e2e.pair.confirm"]
    if confirm.waitForExistence(timeout: 3) {
      XCTAssertTrue(["Confirm", "Connect anyway"].contains(confirm.label))
      confirm.tap()
      app.tap()
      return
    }
    XCTAssertTrue(
      app.buttons.matching(
        NSPredicate(format: "identifier BEGINSWITH 'native-e2e.thread.'")
      ).firstMatch.waitForExistence(timeout: 20)
    )
  }
}
