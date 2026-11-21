import XCTest
@testable import App

@MainActor final class HomeNewsMemoryTests: XCTestCase {
  func testFirstNativeLaunchAndPersistedV1HistoryKeepDeviceChoices() throws {
    let (defaults, name) = defaults()
    defer { defaults.removePersistentDomain(forName: name) }
    let store = HomeNewsMemoryStore(defaults: defaults)
    XCTAssertTrue(store.canPersist)
    store.hide("insight:streak")
    store.hide("usage:fixture:week", forSession: true)
    store.recordSignal("settings:audio")
    store.recordDiscovery("voice-input", now: 100)
    store.recordHighlight("release:abc", poolIDs: ["release:abc"])
    store.retireHighlight("release:abc")
    store.dismissPromotion("github-star")
    let reopened = HomeNewsMemoryStore(defaults: defaults)
    XCTAssertEqual(reopened.value, store.value)
    XCTAssertTrue(reopened.hiddenIDs.contains("insight:streak"))
    XCTAssertFalse(reopened.hiddenIDs.contains("usage:fixture:week"))
  }

  func testFutureOrMalformedEnvelopesArePreservedRatherThanOverwritten() throws {
    let (defaults, name) = defaults()
    defer { defaults.removePersistentDomain(forName: name) }
    for bytes in [#"{"version":2,"memory":{"future":true}}"#, #"{"version":true,"memory":{}}"#, #"{"version":1,"memory":null}"#] {
      let data = Data(bytes.utf8)
      defaults.set(data, forKey: HomeNewsMemoryStore.storageKey)
      let store = HomeNewsMemoryStore(defaults: defaults)
      XCTAssertFalse(store.canPersist)
      store.hide("insight:streak")
      store.recordSignal("settings:profile")
      XCTAssertEqual(defaults.data(forKey: HomeNewsMemoryStore.storageKey), data)
    }
  }

  func testHiddenMemoryIsBoundedAndRepeatedSignalsOrDismissalsDoNotDuplicate() {
    let (defaults, name) = defaults()
    defer { defaults.removePersistentDomain(forName: name) }
    let store = HomeNewsMemoryStore(defaults: defaults)
    for index in 0..<300 { store.hide("remote:notice-\(index)") }
    XCTAssertEqual(store.value.hidden.count, 256)
    XCTAssertFalse(store.hiddenIDs.contains("remote:notice-0"))
    for _ in 0..<3 { store.recordSignal("settings:audio"); store.dismissPromotion("github-star") }
    XCTAssertEqual(store.value.signals, ["settings:audio"])
    XCTAssertEqual(store.value.dismissedPromotions, ["github-star"])
  }

  private func defaults() -> (UserDefaults, String) {
    let name = "HomeNewsMemoryTests.\(UUID().uuidString)"
    return (UserDefaults(suiteName: name)!, name)
  }
}
