import SwiftUI
import Observation

/// Home's window owns the destination above stacked/split navigation. A view
/// belonging to one thread or virtualized row cannot own this presentation.
@MainActor @Observable final class WorkflowViewerPresentationStore {
  private struct Pending {
    let context: WorkflowViewerContext
    let input: WorkflowViewerInput
    let catalog: RichToolPresentationCatalog?
  }
  private var pending: Pending?
  var selection: WorkflowViewerSelection? {
    didSet {
      guard oldValue?.id != selection?.id else { return }
      oldValue?.mediaController.deactivate()
      oldValue?.headings.deactivate()
      oldValue?.controller.invalidate()
      oldValue?.controller.agentTranscript.invalidate()
    }
  }

  func present(context: WorkflowViewerContext, input: WorkflowViewerInput, catalog: RichToolPresentationCatalog?) {
    guard context.owns(input.owner), let access = context.session.workflowRichAccess(for: input.owner) else { return }
    let gateway = context.session.makeWorkflowRichGateway(owner: input.owner)
    let media = RichChatMediaController(historyGateway: gateway, conversationGateway: gateway)
    let headings = RichRuntimeItemHeadingController(gateway: gateway)
    media.activate(access: access, threadID: input.owner.thread.threadID)
    headings.activate(access: access, threadID: input.owner.thread.threadID)
    selection = .init(context: context, input: input, mediaController: media, headings: headings, catalog: catalog)
  }

  /// A roster sheet first dismisses its own presentation. Its onDismiss hands
  /// the pending request to the window, avoiding stacked sheets or timed delays.
  func queue(context: WorkflowViewerContext, input: WorkflowViewerInput, catalog: RichToolPresentationCatalog?) {
    pending = .init(context: context, input: input, catalog: catalog)
  }

  func presentPending() {
    guard let pending else { return }
    self.pending = nil
    present(context: pending.context, input: pending.input, catalog: pending.catalog)
  }
}

private struct WorkflowViewerPresentationKey: EnvironmentKey {
  static let defaultValue: WorkflowViewerPresentationStore? = nil
}

extension EnvironmentValues {
  var workflowViewerPresentation: WorkflowViewerPresentationStore? {
    get { self[WorkflowViewerPresentationKey.self] }
    set { self[WorkflowViewerPresentationKey.self] = newValue }
  }
}

struct WorkflowViewerPresentationHost: ViewModifier {
  @State private var presenter = WorkflowViewerPresentationStore()

  func body(content: Content) -> some View {
    content
      .environment(\.workflowViewerPresentation, presenter)
      .sheet(item: $presenter.selection) { selection in
        WorkflowViewerScreen(context: selection.context, input: selection.input,
          mediaController: selection.mediaController, headings: selection.headings, controller: selection.controller)
          .environment(\.toolPresentationCatalog, selection.catalog)
          .modifier(WorkflowViewerReadLifecycle(selection: selection))
          .poracodePageSheetSizing()
      }
  }
}

private struct WorkflowViewerReadLifecycle: ViewModifier {
  let selection: WorkflowViewerSelection
  @Environment(\.scenePhase) private var scenePhase

  func body(content: Content) -> some View {
    content
      .onChange(of: selection.context.session.workflowRichAccess(for: selection.input.owner), initial: true) { synchronize() }
      .onChange(of: scenePhase) { synchronize() }
  }

  private func synchronize() {
    guard scenePhase == .active, selection.context.owns(selection.input.owner),
      let access = selection.context.session.workflowRichAccess(for: selection.input.owner) else {
      selection.mediaController.enterBackground(); selection.headings.enterBackground()
      return
    }
    if selection.headings.target?.lease != access.lease {
      selection.headings.activate(access: access, threadID: selection.input.owner.thread.threadID)
      selection.mediaController.activate(access: access, threadID: selection.input.owner.thread.threadID)
    } else {
      selection.headings.leaveBackground(access: access)
      selection.mediaController.leaveBackground(access: access)
    }
  }
}
