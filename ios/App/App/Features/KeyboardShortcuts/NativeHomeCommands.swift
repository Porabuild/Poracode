import SwiftUI

/// Home supplies its existing actions; the keyboard layer never recreates host
/// selection, draft ownership, navigation or write authorization.
struct NativeHomeCommands: ViewModifier {
  let identity: String
  let allowsActions: Bool
  let hasProject: Bool
  let hasThread: Bool
  let draftView: Bool
  let canStartThread: Bool
  let openSettings: () -> Void
  let toggleSidebar: () -> Void
  let newThread: () -> Void

  func body(content: Content) -> some View {
    content.nativeCommands(identity: identity, context: [
      "hasProject": .bool(hasProject), "hasThread": .bool(hasThread),
      "threadView": .bool(hasThread), "draftView": .bool(draftView),
      "homeView": .bool(!hasThread && !draftView),
    ], actions: [
      "settings.open": .init(enabled: allowsActions) { _ in openSettings() },
      "sidebar.toggle": .init(enabled: allowsActions) { _ in toggleSidebar() },
      "thread.new": .init(enabled: allowsActions && canStartThread) { _ in newThread() },
    ])
  }
}
