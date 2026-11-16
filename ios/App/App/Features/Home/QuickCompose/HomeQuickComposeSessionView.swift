import SwiftUI

/// Independent new-thread sheets own their state here. Home passes window-owned
/// state directly to the editor so compact/split replacement keeps one draft.
struct HomeQuickComposeSessionView: View {
  @Bindable var session: AppSession
  @Binding var isExpanded: Bool
  @State private var draft: HomeQuickComposeState
  let onStarted: (String) -> Void

  init(session: AppSession, isExpanded: Binding<Bool>, initialProjectID: String? = nil,
    initialWorktree: HomeComposerBranchSelection? = nil, launchSeed: HomeThreadLaunchSeed? = nil,
    onStarted: @escaping (String) -> Void
  ) {
    self.session = session
    _isExpanded = isExpanded
    _draft = State(initialValue: HomeQuickComposeState(session: session,
      initialProjectID: initialProjectID, initialWorktree: initialWorktree, launchSeed: launchSeed))
    self.onStarted = onStarted
  }

  var body: some View {
    HomeQuickComposeView(session: session, isExpanded: $isExpanded, draft: draft, onStarted: onStarted)
  }
}
