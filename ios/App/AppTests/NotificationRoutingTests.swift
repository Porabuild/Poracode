import UserNotifications
import XCTest

@testable import App

@MainActor
final class NotificationRoutingTests: XCTestCase {
  private let connectionA = ClientConnectionID(rawValue: "11111111-1111-4111-8111-111111111111")!
  private let connectionB = ClientConnectionID(rawValue: "22222222-2222-4222-8222-222222222222")!

  func testParserAcceptsOnlyPoracodeRoutedV1() {
    let route = NotificationPayloadParser.parse(userInfo: [
      "aps": ["alert": "x"],
      "poracode": [
        "version": 1,
        "clientConnectionId": connectionA.rawValue,
        "desktopId": "same-desktop",
        "threadId": "same/thread id",
      ],
    ])
    XCTAssertEqual(route?.clientConnectionId, connectionA)
    XCTAssertEqual(route?.threadId, "same/thread id")
    XCTAssertNil(
      NotificationPayloadParser.parse(userInfo: [
        "version": 1,
        "clientConnectionId": connectionA.rawValue,
        "desktopId": "same-desktop",
        "threadId": "thread",
      ]))
  }

  func testParserRejectsFutureLegacyMalformedAndControls() {
    func payload(_ overrides: [String: Any]) -> [AnyHashable: Any] {
      var value: [String: Any] = [
        "version": 1,
        "clientConnectionId": connectionA.rawValue,
        "desktopId": "desktop",
        "threadId": "thread",
      ]
      for (key, item) in overrides { value[key] = item }
      return ["poracode": value]
    }
    XCTAssertNil(NotificationPayloadParser.parse(userInfo: payload(["version": 2])))
    XCTAssertNil(NotificationPayloadParser.parse(userInfo: payload(["version": "1"])))
    XCTAssertNil(NotificationPayloadParser.parse(userInfo: payload(["version": true])))
    XCTAssertNil(NotificationPayloadParser.parse(userInfo: payload(["version": NSNull()])))
    XCTAssertNil(
      NotificationPayloadParser.parse(
        userInfo: payload([
          "clientConnectionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".uppercased()
        ])))
    XCTAssertNil(NotificationPayloadParser.parse(userInfo: payload(["desktopId": "desk\nname"])))
    XCTAssertNil(
      NotificationPayloadParser.parse(userInfo: payload(["desktopId": "desk\u{0085}name"])))
    XCTAssertNil(
      NotificationPayloadParser.parse(
        userInfo: payload(["threadId": String(repeating: "😀", count: 257)])))
    XCTAssertNil(NotificationPayloadParser.parse(userInfo: ["poracode": ["threadId": "legacy"]]))
  }

  func testSameDesktopAndThreadRemainBoundToDistinctConnections() {
    let common: [String: Any] = ["version": 1, "desktopId": "desktop", "threadId": "thread"]
    let a = NotificationPayloadParser.parse(
      object: common.merging(["clientConnectionId": connectionA.rawValue]) { _, new in new })
    let b = NotificationPayloadParser.parse(
      object: common.merging(["clientConnectionId": connectionB.rawValue]) { _, new in new })
    XCTAssertNotEqual(a, b)
    XCTAssertEqual(a?.desktopId, b?.desktopId)
    XCTAssertEqual(a?.threadId, b?.threadId)
  }

  func testURLRoundTripPercentEncodesThreadAndRejectsLegacyURL() throws {
    let route = NotificationRoute(
      version: 1,
      clientConnectionId: connectionA,
      desktopId: "desktop id",
      threadId: "thread/with spaces?"
    )
    let url = try XCTUnwrap(route.url)
    XCTAssertEqual(NotificationPayloadParser.parse(url: url), route)
    XCTAssertTrue(url.absoluteString.contains("thread%2Fwith%20spaces%3F"))
    XCTAssertNil(NotificationPayloadParser.parse(url: URL(string: "poracode://thread/legacy")!))
  }

  func testColdAndWarmSupersessionAlwaysKeepsLatestTap() {
    let first = NotificationRoute(
      version: 1, clientConnectionId: connectionA, desktopId: "d", threadId: "one")
    let second = NotificationRoute(
      version: 1, clientConnectionId: connectionB, desktopId: "d", threadId: "two")
    var gate = NotificationRouteSupersession()
    let coldFirst = gate.submit(first, attached: false)
    let coldSecond = gate.submit(second, attached: false)
    XCTAssertFalse(gate.isCurrent(coldFirst))
    XCTAssertTrue(gate.isCurrent(coldSecond))
    XCTAssertEqual(gate.attach()?.route, second)

    let warmFirst = gate.submit(first, attached: true)
    let warmSecond = gate.submit(second, attached: true)
    XCTAssertFalse(gate.isCurrent(warmFirst))
    XCTAssertTrue(gate.isCurrent(warmSecond))
    XCTAssertNil(gate.attach())
  }

  func testPermissionUsablePolicy() {
    XCTAssertTrue(NotificationPermissionController.isUsable(.authorized))
    XCTAssertTrue(NotificationPermissionController.isUsable(.provisional))
    XCTAssertTrue(NotificationPermissionController.isUsable(.ephemeral))
    XCTAssertFalse(NotificationPermissionController.isUsable(.denied))
    XCTAssertFalse(NotificationPermissionController.isUsable(.notDetermined))
  }

  func testNotificationDeliveryPreferenceDefaultsOnAndPersistsVersionedChoice() throws {
    let suite = "NotificationDeliveryPreferenceTests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }

    XCTAssertTrue(NotificationDeliveryPreference.isEnabled(in: defaults))
    NotificationDeliveryPreference.setEnabled(false, in: defaults)
    XCTAssertFalse(NotificationDeliveryPreference.isEnabled(in: defaults))
    XCTAssertTrue(NotificationDeliveryPreference.storageKey.hasSuffix(".v1"))
  }

  func testForegroundPresentationIsExactHostAware() {
    let routedA = NotificationRoute(
      version: 1, clientConnectionId: connectionA, desktopId: "d", threadId: "t")
    func options(
      _ route: NotificationRoute?, _ envelope: Bool, _ selected: ClientConnectionID?
    ) -> UNNotificationPresentationOptions {
      NotificationForegroundPresentation.options(
        route: route,
        hasRoutingEnvelope: envelope,
        selectedConnectionId: selected,
        preference: NotificationAlertPreference(
          soundEnabled: true,
          foregroundMode: .always,
          doneEnabled: true,
          needsAttentionEnabled: true,
          errorEnabled: true
        )
      )
    }

    // Same-host routed notification presents.
    XCTAssertEqual(options(routedA, true, connectionA), [.banner, .list, .sound])
    // Cross-host routed notification is suppressed: host-A can never appear over host-B.
    XCTAssertEqual(options(routedA, true, connectionB), [])
    // Routed notification with no host selected yet is suppressed.
    XCTAssertEqual(options(routedA, true, nil), [])
    // Legacy (unrouted) payloads keep presenting; their alerts are producer-guaranteed generic.
    XCTAssertEqual(options(nil, false, connectionA), [.banner, .list, .sound])
    XCTAssertEqual(options(nil, false, nil), [.banner, .list, .sound])
    // A routed envelope that fails to parse cannot be host-verified, so it is suppressed.
    XCTAssertEqual(options(nil, true, connectionA), [])
    XCTAssertEqual(options(nil, true, nil), [])
  }

  func testAlertPreferencesDefaultOnPersistAndControlForegroundPresentation() throws {
    let suite = "NotificationAlertPreferenceTests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }

    var preference = NotificationAlertPreference.current(in: defaults)
    XCTAssertTrue(preference.soundEnabled)
    XCTAssertEqual(preference.foregroundMode, .always)
    XCTAssertEqual(preference.pushPreferences, .all)

    preference.soundEnabled = false
    preference.foregroundMode = .backgroundOnly
    preference.doneEnabled = false
    preference.persist(in: defaults)
    XCTAssertEqual(NotificationAlertPreference.current(in: defaults), preference)
    XCTAssertEqual(
      NotificationForegroundPresentation.options(
        route: nil,
        hasRoutingEnvelope: false,
        selectedConnectionId: nil,
        preference: preference
      ),
      []
    )
    XCTAssertTrue(NotificationAlertPreference.soundStorageKey.hasSuffix(".v1"))
    XCTAssertTrue(NotificationAlertPreference.foregroundStorageKey.hasSuffix(".v1"))
  }

  func testForegroundRoutingEnvelopeDetection() {
    XCTAssertTrue(
      NotificationPayloadParser.hasRoutingEnvelope(userInfo: [
        "poracode": ["version": 1]
      ]))
    XCTAssertFalse(
      NotificationPayloadParser.hasRoutingEnvelope(userInfo: [
        "aps": ["alert": "x"]
      ]))
    XCTAssertFalse(NotificationPayloadParser.hasRoutingEnvelope(userInfo: [:]))
  }

  func testLiveSocketNotificationPresentsOnceAndSuppressesRacingPush() throws {
    var soundCount = 0
    let center = RemoteUserNotificationPresentationCenter(
      deduplicationWindow: 15,
      playSound: { soundCount += 1 }
    )
    center.setForeground(true)
    let route = NotificationRoute(
      version: 1, clientConnectionId: connectionA, desktopId: "desktop", threadId: "thread")
    center.receive(
      notification(category: .done),
      route: route,
      isReplay: false,
      isThreadOpen: false,
      preference: alertPreference(),
      now: Date(timeIntervalSince1970: 100),
      schedulesDismiss: false
    )
    XCTAssertEqual(center.banner?.route, route)
    XCTAssertEqual(soundCount, 1)
    XCTAssertFalse(
      center.shouldPresentPush(for: route, now: Date(timeIntervalSince1970: 101)),
      "the generic APNs banner must not duplicate the richer in-app banner"
    )
  }

  func testPushWinningTheRaceSuppressesTheSocketBanner() {
    var soundCount = 0
    let center = RemoteUserNotificationPresentationCenter(
      deduplicationWindow: 15,
      playSound: { soundCount += 1 }
    )
    center.setForeground(true)
    let route = NotificationRoute(
      version: 1, clientConnectionId: connectionA, desktopId: "desktop", threadId: "thread")
    XCTAssertTrue(center.shouldPresentPush(for: route, now: Date(timeIntervalSince1970: 100)))
    center.receive(
      notification(category: .error),
      route: route,
      isReplay: false,
      isThreadOpen: false,
      preference: alertPreference(),
      now: Date(timeIntervalSince1970: 101),
      schedulesDismiss: false
    )
    XCTAssertNil(center.banner)
    XCTAssertEqual(soundCount, 0)
  }

  func testReplayBackgroundPreferenceAndOpenThreadSuppressPresentation() {
    let route = NotificationRoute(
      version: 1, clientConnectionId: connectionA, desktopId: "desktop", threadId: "thread")
    let center = RemoteUserNotificationPresentationCenter()
    center.setForeground(true)

    center.receive(
      notification(category: .done), route: route, isReplay: true, isThreadOpen: false,
      preference: alertPreference(), schedulesDismiss: false)
    XCTAssertNil(center.banner, "historical replay must never alert")

    var backgroundOnly = alertPreference()
    backgroundOnly.foregroundMode = .backgroundOnly
    center.receive(
      notification(category: .done), route: route, isReplay: false, isThreadOpen: false,
      preference: backgroundOnly, schedulesDismiss: false)
    XCTAssertNil(center.banner)

    center.receive(
      notification(category: .done), route: route, isReplay: false, isThreadOpen: true,
      preference: alertPreference(), schedulesDismiss: false)
    XCTAssertNil(center.banner)
    XCTAssertFalse(
      center.shouldPresentPush(for: route),
      "the active thread also suppresses its racing push banner"
    )
  }

  private func notification(
    category: RemoteUserNotificationCategory
  ) -> RemoteUserNotificationEvent {
    RemoteUserNotificationEvent(
      threadId: "thread",
      category: category,
      projectName: "Project",
      threadTitle: "Thread",
      status: category == .error ? "error" : "idle"
    )
  }

  private func alertPreference() -> NotificationAlertPreference {
    NotificationAlertPreference(
      soundEnabled: true,
      foregroundMode: .always,
      doneEnabled: true,
      needsAttentionEnabled: true,
      errorEnabled: true
    )
  }
}
