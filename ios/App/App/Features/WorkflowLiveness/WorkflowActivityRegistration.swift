import SwiftUI

/// Registers canonical metadata while a transcript is open. The session store
/// owns subsequent polling; leaving this view does not end detached workflows.
private struct WorkflowActivityRegistration: ViewModifier {
  let session: AppSession
  let controller: RichChatTranscriptController
  let headings: RichRuntimeItemHeadingController
  let location: ProjectLocation?
  @Environment(\.toolPresentationCatalog) private var catalog

  private var context: WorkflowViewerContext {
    .init(session: session, transcript: controller, headings: headings, location: location)
  }

  func body(content: Content) -> some View {
    content
      .environment(\.workflowViewerContext, context)
      .onChange(of: controller.state.transcript?.workflowRegistrations, initial: true) { synchronize() }
      .onChange(of: controller.state.target) { synchronize() }
      .onChange(of: location) { synchronize() }
      .onChange(of: headings.headings) { synchronize() }
  }

  private func synchronize() {
    guard let target = controller.state.target, let location,
      let transcript = controller.state.transcript, transcript.threadID == target.threadID,
      let owner = session.workflowOwner(connectionID: target.lease.connectionID,
        threadID: target.threadID, location: location) else { return }
    for id in transcript.orderedItemIDs {
      let item = transcript.itemsByID[id]
      let advisory = item.flatMap { headings.workflowMetadata($0, projection: catalog?.itemTypes[$0.type]?.workflowProjection) }
      if let item {
        session.workflowActivity.register(owner: owner, item: item, recoveredMetadata: advisory)
      }
    }
  }
}

extension View {
  func trackWorkflowActivity(session: AppSession, controller: RichChatTranscriptController, headings: RichRuntimeItemHeadingController,
    location: ProjectLocation?) -> some View {
    modifier(WorkflowActivityRegistration(session: session, controller: controller, headings: headings, location: location))
  }
}
