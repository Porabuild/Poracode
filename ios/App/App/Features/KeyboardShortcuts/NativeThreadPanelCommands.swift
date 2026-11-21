import SwiftUI

struct NativeThreadPanelCommands: ViewModifier {
  @Environment(\.nativeCommandRegistry) private var registry
  let page: RichChatThreadPageState
  @Binding var capability: RichChatInspectorCapability
  @Binding var isVisible: Bool?
  @Binding var activeTab: RichChatRightPanelTab
  @Binding var destination: ThreadDetailDestination?

  func body(content: Content) -> some View {
    content.navigationDestination(item: $destination) { destination in
      if let thread = page.thread, let project = page.project, let location = page.projectLocation {
        ThreadDetailDestinationView(session: page.session, thread: thread, project: project,
          workspaceLocation: location, destination: destination)
      }
    }
    .nativeCommands(identity: page.activationID, context: hasWorkspace ? ["hasProject": .bool(true)] : [:], actions: actions)
  }

  private var hasWorkspace: Bool {
    !page.isAuxiliary && page.thread != nil && page.project != nil && page.projectLocation != nil
  }

  private var hasBrowser: Bool { hasWorkspace && page.session.currentBrowserMirrorAccess != nil }

  private var actions: [String: NativeCommandRegistry.Action] {
    var actions: [String: NativeCommandRegistry.Action] = [
      "files.open": .init(enabled: hasWorkspace) { _ in toggle(.files, .files) },
      "files.toggle": .init(enabled: hasWorkspace) { _ in toggle(.files, .files) },
      "git.open": .init(enabled: hasWorkspace) { _ in toggle(.git, .git) },
      "terminal.toggle": .init(enabled: hasWorkspace) { _ in toggle(.terminal, .terminal) },
    ]
    if !page.isAuxiliary && !page.isTerminal {
      actions["find.open"] = .init(enabled: page.canDisplayHistory) { _ in
        guard registry?.focus.role != .browser, registry?.focus.role != .terminal else { return }
        page.find.open()
      }
    }
    if hasBrowser { actions["browser.toggle"] = .init { _ in toggle(.browser, .browser) } }
    return actions
  }

  private func toggle(_ tab: RichChatRightPanelTab, _ compactDestination: ThreadDetailDestination) {
    guard hasWorkspace, tab != .browser || hasBrowser else { return }
    if capability.supportsInspector {
      withAnimation(.snappy(duration: 0.22)) {
        isVisible = !((isVisible ?? capability.defaultOpen) && activeTab == tab)
        activeTab = tab
      }
    } else {
      destination = destination == compactDestination ? nil : compactDestination
    }
  }
}
