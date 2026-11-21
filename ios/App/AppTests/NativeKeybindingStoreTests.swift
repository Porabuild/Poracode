import XCTest
@testable import App

@MainActor final class NativeKeybindingStoreTests: XCTestCase {
  func testFirstInstallUsesBundledDefaultsWithoutWritingToPreferences() throws {
    let (preferences, suite) = preferences(); defer { preferences.removePersistentDomain(forName: suite) }
    let defaults = try document()
    let store = NativeKeybindingStore(preferences: preferences, defaults: defaults)
    XCTAssertTrue(store.canEdit); XCTAssertEqual(store.entries, defaults.entries)
    XCTAssertNil(preferences.object(forKey: NativeKeybindingStore.storageKey))
  }

  func testReleasedBrowserShapeMigratesSearchWithoutLosingAuthoredData() throws {
    let (preferences, suite) = preferences(); defer { preferences.removePersistentDomain(forName: suite) }
    var released = try document()
    released.fields["futureEnvelope"] = .string("retain")
    released.entries[0].fields.merge(["command": .string("thread.search.open"), "args": .object(["scope": .string("files")]),
      "windows": .string("Ctrl+K"), "futureEntry": .bool(true)]) { _, new in new }
    preferences.set(try released.encoded(), forKey: NativeKeybindingStore.storageKey)
    let store = NativeKeybindingStore(preferences: preferences, defaults: try document())
    XCTAssertEqual(store.entries[0].command, "palette.open")
    XCTAssertEqual(store.entries[0].arguments, .object(["scope": .string("files")]))
    XCTAssertEqual(store.entries[0].fields["futureEntry"], .bool(true))
    XCTAssertEqual(store.document.fields["futureEnvelope"], .string("retain"))
    let restarted = NativeKeybindingStore(preferences: preferences, defaults: try document())
    XCTAssertEqual(restarted.document, store.document)
  }

  func testReplaceAddRemoveAndResetPersistOnlyTheirRequestedBindings() throws {
    let (preferences, suite) = preferences(); defer { preferences.removePersistentDomain(forName: suite) }
    var original = try document()
    original.entries[0].fields["args"] = .object(["preserve": .bool(true)])
    original.entries[0].fields["linux"] = .string("Ctrl+P")
    preferences.set(try original.encoded(), forKey: NativeKeybindingStore.storageKey)
    let store = NativeKeybindingStore(preferences: preferences, defaults: original)
    let chord = try XCTUnwrap(NativeKeyChord("Cmd+Shift+K"))
    try store.replace(at: 0, with: chord)
    XCTAssertEqual(store.entries[0].rawChord, "meta+shift+k")
    XCTAssertEqual(store.entries[0].arguments, original.entries[0].arguments)
    XCTAssertEqual(store.entries[0].fields["linux"], .string("Ctrl+P"))
    try store.append(command: "thread.new", chord: chord, condition: "hasProject")
    XCTAssertEqual(store.conflict(for: chord, excluding: "thread.new"), "palette.open")
    try store.remove(at: store.entries.count - 1)
    try store.reset(command: "palette.open")
    XCTAssertEqual(store.entries.filter { $0.command == "palette.open" }, original.entries.filter { $0.command == "palette.open" })
    XCTAssertEqual(NativeKeybindingStore(preferences: preferences, defaults: original).document, store.document)
  }

  func testUnknownFutureAndCorruptStoredConfigurationsPreserveBytesAndRefuseWrites() throws {
    let (preferences, suite) = preferences(); defer { preferences.removePersistentDomain(forName: suite) }
    let values = [Data("{\"version\":2,\"future\":true}".utf8), Data("{\"version\":1,\"keybindings\":null}".utf8), Data("invalid".utf8)]
    for bytes in values {
      preferences.set(bytes, forKey: NativeKeybindingStore.storageKey)
      let store = NativeKeybindingStore(preferences: preferences, defaults: try document())
      XCTAssertFalse(store.canEdit); XCTAssertTrue(store.entries.isEmpty)
      XCTAssertThrowsError(try store.reset(command: "palette.open"))
      XCTAssertThrowsError(try store.append(command: "thread.new", chord: XCTUnwrap(NativeKeyChord("Cmd+N")), condition: nil))
      XCTAssertEqual(preferences.data(forKey: NativeKeybindingStore.storageKey), bytes)
    }
  }

  func testAStaleEditorCannotReplaceAnotherWindowsChangedBinding() throws {
    let (preferences, suite) = preferences(); defer { preferences.removePersistentDomain(forName: suite) }
    let store = NativeKeybindingStore(preferences: preferences, defaults: try document())
    let original = try XCTUnwrap(store.entries.first)
    try store.replace(at: 0, with: XCTUnwrap(NativeKeyChord("Cmd+Shift+K")))
    let saved = preferences.data(forKey: NativeKeybindingStore.storageKey)
    XCTAssertThrowsError(try store.replace(at: 0, with: XCTUnwrap(NativeKeyChord("Cmd+J")), expected: original)) {
      XCTAssertEqual($0 as? NativeKeybindingFailure, .changedDocument)
    }
    XCTAssertEqual(preferences.data(forKey: NativeKeybindingStore.storageKey), saved)
  }

  func testStaleDeleteCannotRemoveADifferentBindingAfterAnEarlierRemoval() throws {
    let (preferences, suite) = preferences(); defer { preferences.removePersistentDomain(forName: suite) }
    var defaults = try document()
    defaults.entries.append(try .init(command: "files.open", key: "Meta+P"))
    let store = NativeKeybindingStore(preferences: preferences, defaults: defaults)
    let captured = store.entries[1]
    try store.remove(at: 0)
    let saved = preferences.data(forKey: NativeKeybindingStore.storageKey)
    XCTAssertEqual(store.entries[1].command, "files.open")
    XCTAssertThrowsError(try store.remove(at: 1, expected: captured)) {
      XCTAssertEqual($0 as? NativeKeybindingFailure, .changedDocument)
    }
    XCTAssertEqual(preferences.data(forKey: NativeKeybindingStore.storageKey), saved)
    XCTAssertEqual(store.entries.map(\.command), ["thread.new", "files.open"])
  }

  func testExplicitResetRecoversUnreadableStorageWithoutSilentOverwrite() throws {
    let (preferences, suite) = preferences(); defer { preferences.removePersistentDomain(forName: suite) }
    let bytes = Data("{\"version\":200,\"userData\":true}".utf8)
    preferences.set(bytes, forKey: NativeKeybindingStore.storageKey)
    let defaults = try document()
    let store = NativeKeybindingStore(preferences: preferences, defaults: defaults)
    XCTAssertFalse(store.canEdit); XCTAssertEqual(preferences.data(forKey: NativeKeybindingStore.storageKey), bytes)
    store.resetAll()
    XCTAssertTrue(store.canEdit); XCTAssertEqual(store.document, defaults)
    XCTAssertNil(preferences.data(forKey: NativeKeybindingStore.storageKey))
  }

  func testNativeSettingsDefaultAdaptsTheSystemShortcutWithoutChangingThePortableDefaults() throws {
    let portable = try XCTUnwrap(NativeKeyboardDefaults.document.entries.first { $0.command == "settings.open" })
    let native = try XCTUnwrap(NativeShortcutPlatformPolicy.defaults.entries.first { $0.command == "settings.open" })
    XCTAssertEqual(portable.chord?.canonical, "meta+,")
    XCTAssertEqual(native.chord?.canonical, "meta+shift+,")
    XCTAssertFalse(try XCTUnwrap(portable.chord).isAvailableAppShortcut)
    XCTAssertTrue(try XCTUnwrap(native.chord).isAvailableAppShortcut)
    XCTAssertEqual(NativeKeyboardDefaults.document.entries.count, NativeShortcutPlatformPolicy.defaults.entries.count)
  }

  func testImportedSettingsBindingIsRetainedUntilTheUserExplicitlyResetsIt() throws {
    let (preferences, suite) = preferences(); defer { preferences.removePersistentDomain(forName: suite) }
    let portable = NativeKeyboardDefaults.document
    let bytes = try portable.encoded()
    preferences.set(bytes, forKey: NativeKeybindingStore.storageKey)
    let store = NativeKeybindingStore(preferences: preferences)
    XCTAssertEqual(store.document, portable)
    XCTAssertEqual(preferences.data(forKey: NativeKeybindingStore.storageKey), bytes)
    try store.reset(command: "settings.open")
    XCTAssertEqual(store.entries.first { $0.command == "settings.open" }?.chord?.canonical, "meta+shift+,")
    XCTAssertEqual(store.entries.filter { $0.command != "settings.open" }, portable.entries.filter { $0.command != "settings.open" })
  }

  func testComposerDefaultsPreserveSystemMinimizeAndReverseFocusTraversal() throws {
    let native = NativeShortcutPlatformPolicy.defaults.entries
    let portable = NativeKeyboardDefaults.document.entries
    XCTAssertEqual(native.first { $0.command == "composer.open-model-picker" }?.chord?.canonical, "meta+shift+m")
    XCTAssertEqual(native.first { $0.command == "composer.toggle-work-plan" }?.chord?.canonical, "meta+shift+l")
    XCTAssertEqual(portable.first { $0.command == "composer.open-model-picker" }?.chord?.canonical, "meta+m")
    XCTAssertEqual(portable.first { $0.command == "composer.toggle-work-plan" }?.chord?.canonical, "shift+tab")
    for key in ["Meta+M", "Shift+Tab"] {
      XCTAssertFalse(try XCTUnwrap(NativeKeyChord(key)).isAvailableAppShortcut)
    }
  }

  private func preferences() -> (UserDefaults, String) {
    let suite = "native-keybindings-tests-\(UUID().uuidString)"
    return (UserDefaults(suiteName: suite)!, suite)
  }

  private func document() throws -> NativeKeybindingDocument {
    try NativeKeybindingDocument(entries: [
      .init(command: "palette.open", key: "Meta+K"),
      .init(command: "thread.new", key: "Meta+N", condition: "hasProject"),
    ])
  }
}
