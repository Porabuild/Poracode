import SwiftUI

struct NativeAppCommands: Commands {
  @FocusedValue(NativeCommandRegistry.self) private var registry
  @FocusedValue(\.nativeCommandFocus) private var declaredFocus

  var body: some Commands {
    CommandGroup(replacing: .newItem) { buttons(in: .newItem) }
    CommandMenu("Poracode") { buttons(in: .other) }
  }

  private enum Group { case newItem, other }

  @ViewBuilder private func buttons(in group: Group) -> some View {
    if let registry {
      ForEach(registry.activeBindings(focus: NativeCommandFocus.resolve(probed: registry.focus, declared: declaredFocus)).filter { binding in
        switch group {
        case .newItem: ["thread.new", "thread.new.panel"].contains(binding.command)
        case .other: !["thread.new", "thread.new.panel"].contains(binding.command)
        }
      }) { binding in
        if let shortcut = binding.chord.keyboardShortcut {
          Button(NativeShortcutStrings.commandTitle(binding.command)) {
            registry.perform(chord: binding.chord, focusOverride: NativeCommandFocus.resolve(probed: registry.focus, declared: declaredFocus))
          }
          .keyboardShortcut(shortcut)
        }
      }
    }
  }
}

private struct NativeCommandDepthKey: EnvironmentKey { static let defaultValue = 0 }
private struct NativeCommandAncestorsKey: EnvironmentKey { static let defaultValue: [UUID] = [] }
private struct NativeCommandRegistryKey: EnvironmentKey { static let defaultValue: NativeCommandRegistry? = nil }
extension EnvironmentValues {
  var nativeCommandDepth: Int {
    get { self[NativeCommandDepthKey.self] }
    set { self[NativeCommandDepthKey.self] = newValue }
  }
  var nativeCommandAncestors: [UUID] {
    get { self[NativeCommandAncestorsKey.self] }
    set { self[NativeCommandAncestorsKey.self] = newValue }
  }
  var nativeCommandRegistry: NativeCommandRegistry? {
    get { self[NativeCommandRegistryKey.self] }
    set { self[NativeCommandRegistryKey.self] = newValue }
  }
}

private struct NativeCommandScopeModifier: ViewModifier {
  @Environment(\.nativeCommandRegistry) private var registry
  @Environment(\.nativeCommandDepth) private var depth
  @Environment(\.nativeCommandAncestors) private var ancestors
  @State private var owner = UUID()
  let scope: NativeCommandRegistry.Scope
  let identity: String

  private struct Inputs: Equatable {
    let depth: Int
    let ancestors: [UUID]
    let priority: Int
    let blocksParentActions: Bool
    let focusOwnerID: UUID?
    let revision: AnyHashable?
    let context: [String: JSONValue]
    let enabled: Set<String>
    let commands: Set<String>
    let identity: String
  }

  func body(content: Content) -> some View {
    content
      .environment(\.nativeCommandDepth, depth + 1)
      .environment(\.nativeCommandAncestors, ancestors + [owner])
      .onAppear(perform: install)
      .onChange(of: Inputs(depth: depth, ancestors: ancestors, priority: scope.priority, blocksParentActions: scope.blocksParentActions, focusOwnerID: scope.focusOwnerID, revision: scope.revision, context: scope.context,
        enabled: Set(scope.actions.filter { $0.value.enabled }.keys),
        commands: Set(scope.actions.keys), identity: identity)) { _, _ in install() }
      .onDisappear { registry?.remove(owner: owner) }
  }

  private func install() {
    var value = scope; value.depth = depth + 1; value.ancestors = ancestors
    registry?.install(value, owner: owner)
  }
}

/// The registry belongs to this WindowGroup content, not the app's shared host
/// session. Focused values route the system menu to the active window only.
struct NativeCommandSceneRoot: View {
  let session: AppSession
  @State private var registry = NativeCommandRegistry(bindings: .shared)

  var body: some View {
    RootView(session: session)
      .environment(\.nativeCommandRegistry, registry)
      .focusedSceneValue(registry)
      .background { NativeCommandFocusProbe(registry: registry).allowsHitTesting(false).accessibilityHidden(true) }
  }
}

extension View {
  func nativeCommands(
    identity: String,
    priority: Int = 0,
    blocksParentActions: Bool = false,
    focusOwnerID: UUID? = nil,
    revision: AnyHashable? = nil,
    context: [String: JSONValue] = [:],
    actions: [String: NativeCommandRegistry.Action] = [:]
  ) -> some View {
    modifier(NativeCommandScopeModifier(
      scope: .init(depth: 0, priority: priority, focusOwnerID: focusOwnerID, revision: revision, blocksParentActions: blocksParentActions,
        context: context, actions: actions), identity: identity
    ))
  }
}
