import SwiftUI

/// Keeps thread subscriptions and the local composer draft synchronized with
/// the lifecycle of the thread presentation.
struct RichChatThreadLifecycle: ViewModifier {
  let pageState: RichChatThreadPageState
  @Binding var composerExpanded: Bool
  @Environment(\.scenePhase) private var scenePhase

  func body(content: Content) -> some View {
    content
      .task(id: pageState.activationID) { await pageState.activate() }
      .task(id: pageState.settingsRefreshKey) {
        await pageState.refreshProviderUsage()
        await pageState.loadVisibilityOverrides()
      }
      // Session-action inventory tracks live owner changes; ambiguous refreshes below.
      .task(id: pageState.sessionActionRefreshKey) {
        pageState.suite.sessionActions.updateOwner(pageState.sessionActionOwner)
        await pageState.suite.sessionActions.refreshInventory()
      }
      .onChange(of: pageState.session.currentRichChatAccess) { pageState.updateAccess() }
      .onChange(of: pageState.thread?.config) { previous, current in
        pageState.draft.synchronizeConfiguration(previous: previous, current: current)
      }
      .onChange(of: pageState.suite.transcript.state.transcript?.itemsInOrder, initial: true) { _, items in
        pageState.updateGallery(items ?? [])
      }
      .onChange(of: pageState.suite.sessionActions.state.requiresAuthoritativeRefresh) { _, needs in
        guard needs else { return }
        Task {
          await pageState.suite.refreshAuthoritativeHistory()
          pageState.suite.sessionActions.acknowledgeAuthoritativeRefresh()
          await pageState.suite.sessionActions.refreshInventory()
        }
      }
      .onAppear { if pageState.draft.consumeQueuedSegments() { composerExpanded = true } }
      .onChange(of: pageState.session.richChatComposerDrafts.revision) { _, _ in
        if pageState.draft.consumeQueuedSegments() { composerExpanded = true }
      }
      .onChange(of: pageState.composerFocusRevision) { _, _ in composerExpanded = true }
      .onChange(of: scenePhase) { _, phase in pageState.handleScenePhase(phase) }
      .onDisappear { pageState.detach() }
  }
}
