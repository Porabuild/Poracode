import Foundation
import Observation

/// One window's live actions. Views register only actions they actually own;
/// closing a surface retires its callbacks without affecting another window.
@MainActor @Observable final class NativeCommandRegistry {
  struct Action {
    var enabled = true
    let perform: @MainActor (JSONValue?) -> Void

    init(enabled: Bool = true, perform: @escaping @MainActor (JSONValue?) -> Void) {
      self.enabled = enabled
      self.perform = perform
    }
  }

  struct Scope {
    var depth: Int
    var priority: Int
    var ancestors: [UUID] = []
    var focusOwnerID: UUID? = nil
    var revision: AnyHashable? = nil
    var blocksParentActions = false
    var context: [String: JSONValue] = [:]
    var actions: [String: Action] = [:]
  }

  struct Binding: Identifiable {
    var id: String { chord.canonical }
    let command: String
    let chord: NativeKeyChord
    let arguments: JSONValue?
  }

  let bindings: NativeKeybindingStore
  private var scopes: [UUID: Scope] = [:]
  private var registrationOrder: [UUID: UInt64] = [:]
  private var nextRegistration: UInt64 = 0
  var focus = NativeCommandFocus()

  init(bindings: NativeKeybindingStore) { self.bindings = bindings }

  func install(_ scope: Scope, owner: UUID) {
    if registrationOrder[owner] == nil {
      nextRegistration &+= 1; registrationOrder[owner] = nextRegistration
    }
    scopes[owner] = scope
  }
  func remove(owner: UUID) {
    let retired = scopes.compactMap { $0.key == owner || $0.value.ancestors.contains(owner) ? $0.key : nil }
    for id in retired {
      scopes.removeValue(forKey: id); registrationOrder.removeValue(forKey: id)
    }
  }

  var context: [String: JSONValue] {
    context(focus: focus)
  }

  private func context(focus: NativeCommandFocus) -> [String: JSONValue] {
    var result: [String: JSONValue] = [:]
    for scope in activeScopes(focus: focus).reversed() {
      result.merge(scope.context) { _, newer in newer }
    }
    result.merge(focus.context) { _, newer in newer }
    return result
  }

  /// The menu and dispatch use the same first-match rule as the PWA store.
  /// A command is never registered merely because an imported binding names it.
  var activeBindings: [Binding] {
    activeBindings(focus: focus)
  }

  func activeBindings(focus: NativeCommandFocus) -> [Binding] {
    guard focus.role != .shortcutCapture else { return [] }
    let context = context(focus: focus)
    let actions = actions(focus: focus)
    var seen = Set<NativeKeyChord>()
    return bindings.entries.compactMap { entry in
      guard let chord = entry.chord, !seen.contains(chord),
        actions[entry.command]?.enabled == true,
        focus.permits(chord),
        (try? NativeCommandCondition.evaluate(entry.condition, context: context)) == true
      else { return nil }
      seen.insert(chord)
      return Binding(command: entry.command, chord: chord, arguments: entry.arguments)
    }
  }

  @discardableResult
  func perform(chord: NativeKeyChord, focusOverride: NativeCommandFocus? = nil) -> Bool {
    let currentFocus = focusOverride ?? focus
    guard let binding = activeBindings(focus: currentFocus).first(where: { $0.chord == chord }),
      let action = actions(focus: currentFocus)[binding.command], action.enabled else { return false }
    action.perform(binding.arguments)
    return true
  }

  @discardableResult
  func perform(command: String, arguments: JSONValue? = nil) -> Bool {
    guard focus.role != .shortcutCapture,
      let action = actions(focus: focus)[command], action.enabled else { return false }
    action.perform(arguments)
    return true
  }

  var availableCommands: Set<String> {
    Set(enabledActions.keys)
  }

  var enabledActions: [String: Action] { actions(focus: focus).filter { $0.value.enabled } }

  private func actions(focus: NativeCommandFocus) -> [String: Action] {
    var result: [String: Action] = [:]
    for scope in activeScopes(focus: focus).reversed() {
      result.merge(scope.actions) { _, newer in newer }
    }
    return result
  }

  private func activeScopes(focus: NativeCommandFocus) -> [Scope] {
    let ordered = scopes.sorted {
      if $0.value.depth != $1.value.depth { return $0.value.depth > $1.value.depth }
      if $0.value.priority != $1.value.priority { return $0.value.priority > $1.value.priority }
      return registrationOrder[$0.key, default: 0] > registrationOrder[$1.key, default: 0]
    }
    let barrier = ordered.first(where: { $0.value.blocksParentActions })
    return ordered.filter { entry in
      if let barrier, entry.key != barrier.key, !entry.value.ancestors.contains(barrier.key) { return false }
      return entry.value.focusOwnerID == nil || entry.value.focusOwnerID == focus.ownerID
    }.map(\.value)
  }
}

struct NativeCommandFocus: Equatable, Sendable {
  enum Role: Sendable { case none, input, editor, terminal, composer, browser, sidebar, panel, shortcutCapture }
  var role: Role = .none
  var isTextInput = false
  var ownerID: UUID? = nil

  /// UIKit bridges know the actual prompt/terminal/browser responder. A
  /// surrounding SwiftUI value must not replace that specific input owner.
  static func resolve(probed: Self, declared: Self?) -> Self {
    switch probed.role {
    case .composer, .editor, .terminal, .browser, .shortcutCapture: return probed
    default:
      if probed.isTextInput, declared?.role != .editor, declared?.role != .browser { return probed }
      return declared ?? probed
    }
  }

  var context: [String: JSONValue] {
    ["inputFocus": .bool(isTextInput), "editorFocus": .bool(role == .editor),
      "terminalFocus": .bool(role == .terminal), "composerFocus": .bool(role == .composer),
      "browserFocus": .bool(role == .browser), "sidebarFocus": .bool(role == .sidebar),
      "panelFocus": .bool(role == .panel)]
  }

  /// Preserve native editing even when an imported customization has no `when`.
  /// Unmodified app keys also stand down while a text input owns focus.
  func permits(_ chord: NativeKeyChord) -> Bool {
    guard role != .shortcutCapture, chord.mainKeys.count == 1,
      NativeShortcutPlatformPolicy.accepts(chord) else { return false }
    if isTextInput {
      if chord.modifiers.isEmpty { return false }
      if chord.modifiers == ["meta"], ["a", "b", "c", "i", "u", "v", "x", "z"].contains(chord.mainKeys[0]) { return false }
      if ["meta+shift+z", "meta+shift+v", "meta+alt+shift+v"].contains(chord.canonical) { return false }
    }
    if isTextInput, chord.modifiers == ["ctrl"],
      ["a", "b", "c", "d", "e", "f", "h", "k", "l", "n", "p", "u", "w", "z"].contains(chord.mainKeys[0]) { return false }
    return true
  }
}
