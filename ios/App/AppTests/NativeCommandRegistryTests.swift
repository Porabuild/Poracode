import SwiftUI
import XCTest
@testable import App

@MainActor final class NativeCommandRegistryTests: XCTestCase {
  func testClosingASurfaceRetiresItsMenuCallbackAndRevealsItsParent() throws {
    let registry = try registry([("save", "Meta+S", nil)])
    let parent = UUID(), child = UUID()
    var calls: [String] = []
    registry.install(.init(depth: 1, priority: 0, actions: ["save": .init { _ in calls.append("parent") }]), owner: parent)
    registry.install(.init(depth: 2, priority: 0, ancestors: [parent], actions: ["save": .init { _ in calls.append("child") }]), owner: child)
    let key = try XCTUnwrap(NativeKeyChord("Meta+S"))
    XCTAssertTrue(registry.perform(chord: key)); XCTAssertEqual(calls, ["child"])
    registry.remove(owner: child)
    XCTAssertTrue(registry.perform(chord: key)); XCTAssertEqual(calls, ["child", "parent"])
    registry.remove(owner: parent)
    XCTAssertFalse(registry.perform(chord: key)); XCTAssertTrue(registry.activeBindings.isEmpty)
  }

  func testModalBlocksADeeperBackgroundEditorButKeepsItsOwnDescendants() throws {
    let registry = try registry([("save", "Meta+S", nil), ("new", "Meta+N", nil)])
    let home = UUID(), editor = UUID(), modal = UUID(), modalEditor = UUID()
    var calls: [String] = []
    registry.install(.init(depth: 1, priority: 0, actions: ["new": .init { _ in calls.append("home") }]), owner: home)
    registry.install(.init(depth: 4, priority: 0, ancestors: [home], actions: ["save": .init { _ in calls.append("background") }]), owner: editor)
    registry.install(.init(depth: 2, priority: 100, ancestors: [home], blocksParentActions: true), owner: modal)
    XCTAssertTrue(registry.activeBindings.isEmpty)
    registry.install(.init(depth: 3, priority: 0, ancestors: [home, modal], actions: ["save": .init { _ in calls.append("modal") }]), owner: modalEditor)
    XCTAssertEqual(registry.availableCommands, ["save"])
    XCTAssertTrue(registry.perform(chord: try XCTUnwrap(NativeKeyChord("Meta+S"))))
    XCTAssertEqual(calls, ["modal"])
    registry.remove(owner: modalEditor); registry.remove(owner: modal)
    XCTAssertTrue(registry.perform(chord: try XCTUnwrap(NativeKeyChord("Meta+S"))))
    XCTAssertEqual(calls, ["modal", "background"])
  }

  func testBindingsUsePWAFirstMatchOrderAndAreRecheckedAtInvocation() throws {
    let registry = try registry([("disabled", "Meta+K", nil), ("search", "Meta+K", "hasProject"), ("other", "Meta+K", nil)])
    let owner = UUID()
    var invoked = ""
    registry.install(.init(depth: 1, priority: 0, context: ["hasProject": .bool(true)], actions: [
      "disabled": .init(enabled: false) { _ in invoked = "disabled" },
      "search": .init { _ in invoked = "search" }, "other": .init { _ in invoked = "other" },
    ]), owner: owner)
    XCTAssertEqual(registry.activeBindings.map(\.command), ["search"])
    let key = try XCTUnwrap(NativeKeyChord("Meta+K"))
    XCTAssertTrue(registry.perform(chord: key)); XCTAssertEqual(invoked, "search")
    registry.install(.init(depth: 1, priority: 0, actions: ["other": .init { _ in invoked = "other" }]), owner: owner)
    XCTAssertTrue(registry.perform(chord: key)); XCTAssertEqual(invoked, "other")
  }

  func testWindowActionsStayIndependentWhileSavedBindingsAreShared() throws {
    let first = try registry([("new", "Meta+N", nil)])
    let second = NativeCommandRegistry(bindings: first.bindings)
    let firstOwner = UUID(), secondOwner = UUID()
    var calls: [Int] = []
    first.install(.init(depth: 1, priority: 0, actions: ["new": .init { _ in calls.append(1) }]), owner: firstOwner)
    second.install(.init(depth: 1, priority: 0, actions: ["new": .init { _ in calls.append(2) }]), owner: secondOwner)
    let old = try XCTUnwrap(NativeKeyChord("Meta+N")), replacement = try XCTUnwrap(NativeKeyChord("Meta+Shift+N"))
    XCTAssertTrue(first.perform(chord: old)); XCTAssertTrue(second.perform(chord: old))
    try first.bindings.replace(at: 0, with: replacement)
    XCTAssertFalse(first.perform(chord: old)); XCTAssertFalse(second.perform(chord: old))
    XCTAssertTrue(second.perform(chord: replacement)); XCTAssertEqual(calls, [1, 2, 2])
    second.remove(owner: secondOwner)
    XCTAssertTrue(first.perform(chord: replacement)); XCTAssertFalse(second.perform(chord: replacement))
  }

  func testSimultaneousComposersRouteOnlyToTheFocusedInputOwner() throws {
    let registry = try registry([("fast", "Meta+Shift+F", "composerFocus")])
    let mainScope = UUID(), sideScope = UUID(), mainInput = UUID(), sideInput = UUID()
    var calls: [String] = []
    registry.install(.init(depth: 2, priority: 0, focusOwnerID: mainInput,
      actions: ["fast": .init { _ in calls.append("main") }]), owner: mainScope)
    registry.install(.init(depth: 5, priority: 100, focusOwnerID: sideInput,
      actions: ["fast": .init { _ in calls.append("side") }]), owner: sideScope)
    let chord = try XCTUnwrap(NativeKeyChord("Meta+Shift+F"))
    registry.focus = .init(role: .composer, isTextInput: true, ownerID: mainInput)
    XCTAssertTrue(registry.perform(chord: chord))
    registry.focus = .init(role: .composer, isTextInput: true, ownerID: sideInput)
    XCTAssertTrue(registry.perform(chord: chord)); XCTAssertEqual(calls, ["main", "side"])
    registry.remove(owner: mainScope)
    registry.focus = .init(role: .composer, isTextInput: true, ownerID: mainInput)
    XCTAssertFalse(registry.perform(chord: chord), "A retired main input must not change the visible side chat")
    registry.focus = .init(role: .composer, isTextInput: true)
    XCTAssertTrue(registry.activeBindings.isEmpty, "An unidentified input cannot claim another composer's actions")
  }

  func testSpecificUIKitInputOwnerWinsOverAnEnclosingSwiftUIFocusValue() {
    let main = NativeCommandFocus(role: .composer, isTextInput: true, ownerID: UUID())
    let editor = NativeCommandFocus(role: .editor, isTextInput: true)
    XCTAssertEqual(NativeCommandFocus.resolve(probed: main, declared: editor), main)
    XCTAssertEqual(NativeCommandFocus.resolve(probed: .init(role: .input, isTextInput: true), declared: editor), editor)
    let capture = NativeCommandFocus(role: .shortcutCapture)
    XCTAssertEqual(NativeCommandFocus.resolve(probed: capture, declared: editor), capture)
  }

  func testTypingKeepsNativeEditingAndTerminalControlKeys() throws {
    let registry = try registry([("custom", "Meta+B", nil), ("custom", "Meta+Shift+Z", nil),
      ("custom", "Q", nil), ("custom", "Ctrl+C", nil), ("model", "Meta+Shift+M", "composerFocus")])
    registry.install(.init(depth: 1, priority: 0, actions: ["custom": .init { _ in XCTFail("reserved input was captured") }, "model": .init { _ in }]), owner: UUID())
    registry.focus = .init(role: .composer, isTextInput: true)
    XCTAssertEqual(registry.activeBindings.map(\.command), ["model"])
    registry.focus = .init(role: .terminal, isTextInput: true)
    XCTAssertTrue(registry.activeBindings.isEmpty)
    registry.focus = .init(role: .shortcutCapture, isTextInput: true)
    XCTAssertTrue(registry.activeBindings.isEmpty)
    XCTAssertFalse(registry.perform(command: "model"))
  }

  func testFocusedComposerUsesItsBindingAndUnknownCommandsDoNotClaimAChord() throws {
    let registry = try registry([("files.open", "Meta+P", "!composerFocus"),
      ("composer.cycle-permission", "Meta+P", "composerFocus"),
      ("unknown.future", "Meta+N", nil), ("thread.new", "Meta+N", "hasProject")])
    let owner = UUID()
    var selected = ""
    let actions: [String: NativeCommandRegistry.Action] = [
      "files.open": .init { _ in selected = "files" },
      "composer.cycle-permission": .init { _ in selected = "permission" },
      "thread.new": .init { _ in selected = "new" },
    ]
    registry.install(.init(depth: 1, priority: 0, actions: actions), owner: owner)
    let p = try XCTUnwrap(NativeKeyChord("Meta+P")), n = try XCTUnwrap(NativeKeyChord("Meta+N"))
    registry.focus = .init(role: .composer, isTextInput: true)
    XCTAssertTrue(registry.perform(chord: p)); XCTAssertEqual(selected, "permission")
    registry.focus = .init()
    XCTAssertTrue(registry.perform(chord: p)); XCTAssertEqual(selected, "files")
    XCTAssertFalse(registry.perform(chord: n))
    registry.install(.init(depth: 1, priority: 0, context: ["hasProject": .bool(true)], actions: actions), owner: owner)
    XCTAssertTrue(registry.perform(chord: n)); XCTAssertEqual(selected, "new")
  }

  func testRetiringAParentRevokesChildCallbacksBeforeTheirDisappearance() throws {
    let registry = try registry([("save", "Meta+S", nil)])
    let parent = UUID(), child = UUID()
    registry.install(.init(depth: 1, priority: 0), owner: parent)
    registry.install(.init(depth: 2, priority: 0, ancestors: [parent], actions: ["save": .init { _ in XCTFail("retired callback ran") }]), owner: child)
    XCTAssertEqual(registry.availableCommands, ["save"])
    registry.remove(owner: parent)
    XCTAssertFalse(registry.perform(chord: try XCTUnwrap(NativeKeyChord("Meta+S"))))
    XCTAssertTrue(registry.activeBindings.isEmpty)
  }

  func testNativeShortcutAdapterRegistersEveryDefaultAndPreservesUnknownKeys() throws {
    for entry in NativeKeyboardDefaults.document.entries {
      XCTAssertNotNil(entry.chord?.keyboardShortcut, entry.rawChord ?? entry.command)
    }
    let authored = try XCTUnwrap(NativeKeyChord("Meta+UnrecognizedPrimaryKey"))
    XCTAssertNil(authored.keyboardShortcut)
    XCTAssertEqual(authored.canonical, "meta+unrecognizedprimarykey")
    XCTAssertEqual(NativeKeyChord("Ctrl+Meta+Alt+Shift+K")?.nativeDisplay, "⌃⌥⇧⌘K")
    XCTAssertEqual(NativeKeyChord("Cmd+Shift+N")?.editableDisplay, "Shift+Command+N")
  }

  func testHardwareCaptureMapsNamedKeysAndIgnoresModifierOnlyPresses() {
    XCTAssertEqual(NativeShortcutEvent.chord(keyCode: 0x11, characters: "n", flags: .command)?.canonical, "meta+n")
    XCTAssertEqual(NativeShortcutEvent.chord(keyCode: 0x52, characters: "", flags: [.alternate, .command])?.canonical, "meta+alt+up")
    XCTAssertEqual(NativeShortcutEvent.chord(keyCode: 0x3A, characters: "", flags: [])?.canonical, "f1")
    XCTAssertEqual(NativeShortcutEvent.chord(keyCode: 0x2C, characters: " ", flags: .shift)?.canonical, "shift+space")
    XCTAssertNil(NativeShortcutEvent.chord(keyCode: 0xE3, characters: "", flags: .command))
    XCTAssertEqual(NativeShortcutEvent.chord(keyCode: 0, characters: "\u{F700}", flags: .command)?.canonical, "meta+up")
  }

  private func registry(_ bindings: [(String, String, String?)]) throws -> NativeCommandRegistry {
    let suite = "native-command-registry-\(UUID().uuidString)"
    let preferences = try XCTUnwrap(UserDefaults(suiteName: suite))
    addTeardownBlock { preferences.removePersistentDomain(forName: suite) }
    let entries = try bindings.map { try NativeKeybindingEntry(command: $0.0, key: $0.1, condition: $0.2) }
    return NativeCommandRegistry(bindings: NativeKeybindingStore(preferences: preferences, defaults: .init(entries: entries)))
  }
}
