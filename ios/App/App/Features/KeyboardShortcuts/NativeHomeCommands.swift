import SwiftUI

/// Home supplies its existing actions; the keyboard layer never recreates host
/// selection, draft ownership, navigation or write authorization.
struct NativeHomeCommands: ViewModifier {
  struct NavigationRevision: Hashable {
    let visible: Set<String>
    let adjacent: [String]
  }

  let identity: String
  let navigation: NavigationRevision
  let allowsActions: Bool
  let hasProject: Bool
  let hasThread: Bool
  let draftView: Bool
  let canStartThread: Bool
  let canOpenBrowser: Bool
  let canStepThread: Bool
  let canStepWorkspaceThread: Bool
  let canCycleRecentThreads: Bool
  let openSettings: () -> Void
  let toggleSidebar: () -> Void
  let newThread: () -> Void
  let openSearch: () -> Void
  let openBrowser: () -> Void
  let stepThread: (HomeThreadStep) -> Void
  let stepWorkspaceThread: (HomeThreadStep) -> Void
  let cycleRecentThread: (HomeThreadStep) -> Void

  func body(content: Content) -> some View {
    content.nativeCommands(identity: identity, revision: navigation, context: [
      "hasProject": .bool(hasProject), "hasThread": .bool(hasThread),
      "threadView": .bool(hasThread), "draftView": .bool(draftView),
      "homeView": .bool(!hasThread && !draftView),
    ], actions: [
      "settings.open": .init(enabled: allowsActions) { _ in openSettings() },
      "sidebar.toggle": .init(enabled: allowsActions) { _ in toggleSidebar() },
      "thread.new": .init(enabled: allowsActions && canStartThread) { _ in newThread() },
      "palette.open": .init(enabled: allowsActions) { _ in openSearch() },
      "browser.toggle": .init(enabled: allowsActions && canOpenBrowser) { _ in openBrowser() },
      "thread.next": .init(enabled: allowsActions && canStepThread) { _ in stepThread(.next) },
      "thread.previous": .init(enabled: allowsActions && canStepThread) { _ in stepThread(.previous) },
      "thread.nextInWorkspace": .init(enabled: allowsActions && canStepWorkspaceThread) { _ in stepWorkspaceThread(.next) },
      "thread.previousInWorkspace": .init(enabled: allowsActions && canStepWorkspaceThread) { _ in stepWorkspaceThread(.previous) },
      "thread.recent.next": .init(enabled: allowsActions && canCycleRecentThreads) { _ in cycleRecentThread(.next) },
      "thread.recent.previous": .init(enabled: allowsActions && canCycleRecentThreads) { _ in cycleRecentThread(.previous) },
    ])
  }
}

struct NativeHomeCommandSearch {
  let actions: [String: NativeCommandRegistry.Action]
  let connection: ClientConnectionID?
  let destination: CompositeRemoteID?
  var selection: String?
}
