import SwiftUI

@MainActor struct WorkflowViewerContext {
  let session: AppSession
  let transcript: RichChatTranscriptController
  let headings: RichRuntimeItemHeadingController
  let location: ProjectLocation?

  var owner: WorkflowActivityOwner? {
    guard let target = transcript.state.target, let location else { return nil }
    return session.workflowOwner(connectionID: target.lease.connectionID, threadID: target.threadID, location: location)
  }
  /// An open read-only viewer keeps its exact host/project authority even if
  /// adaptive navigation recreates the originating thread controllers.
  func owns(_ owner: WorkflowActivityOwner) -> Bool { session.workflowOwnerIsCurrent(owner) }

  func input(for item: RichRuntimeItem, catalog: RichToolPresentationCatalog?) -> WorkflowViewerInput? {
    input(itemID: item.id, item: item, catalog: catalog)
  }

  func input(itemID: String, catalog: RichToolPresentationCatalog?) -> WorkflowViewerInput? {
    input(itemID: itemID, item: transcript.state.transcript?.itemsByID[itemID], catalog: catalog)
  }

  /// A workflow may publish its canonical reference after the viewer opens.
  /// Consult the current source conversation (which adaptive layout can replace)
  /// and the session's registered runs, without parsing a legacy payload here.
  func availableReference(for input: WorkflowViewerInput, catalog: RichToolPresentationCatalog?) -> WorkflowRunReference? {
    guard owns(input.owner), let itemID = input.request?.itemID else { return nil }
    let sources = [(transcript, headings)] + session.attachedRichChatSuites.map { ($0.transcript, $0.runtimeItemHeadings) }
    for (transcript, headings) in sources {
      guard let target = transcript.state.target, target.threadID == input.owner.thread.threadID,
        target.lease.connectionID == input.owner.thread.connectionID,
        let item = transcript.state.transcript?.itemsByID[itemID] else { continue }
      if let reference = WorkflowRunReference(metadata: item.payload?.objectValue?["workflow"])
        ?? WorkflowRunReference(metadata: headings.workflowMetadata(item, projection: catalog?.itemTypes[item.type]?.workflowProjection)) {
        return reference
      }
    }
    let record = session.workflowActivity.records[.init(thread: input.owner.thread, itemID: itemID)]
    return record?.owner == input.owner ? record?.reference : nil
  }

  private func input(itemID: String, item: RichRuntimeItem?, catalog: RichToolPresentationCatalog?) -> WorkflowViewerInput? {
    guard let owner else { return nil }
    let presentation = item.flatMap { catalog?.itemTypes[$0.type] }
    let advisory = item.flatMap { headings.workflowMetadata($0, projection: presentation?.workflowProjection) }
    let record = session.workflowActivity.records[.init(thread: owner.thread, itemID: itemID)]
    let reference = WorkflowRunReference(metadata: item?.payload?.objectValue?["workflow"])
      ?? WorkflowRunReference(metadata: advisory)
      ?? (record?.owner == owner ? record?.reference : nil)
    let request = item.flatMap { RichRuntimeItemHeadingRequest($0, projection: presentation?.workflowViewProjection) }
    guard reference != nil || request?.version == 4 else { return nil }
    return .init(owner: owner, reference: reference, request: request)
  }
}

private struct WorkflowViewerContextKey: EnvironmentKey {
  static let defaultValue: WorkflowViewerContext? = nil
}
extension EnvironmentValues {
  var workflowViewerContext: WorkflowViewerContext? {
    get { self[WorkflowViewerContextKey.self] }
    set { self[WorkflowViewerContextKey.self] = newValue }
  }
}

struct WorkflowViewerInput: Equatable {
  let owner: WorkflowActivityOwner
  let reference: WorkflowRunReference?
  let request: RichRuntimeItemHeadingRequest?
}

@MainActor struct WorkflowViewerSelection: Identifiable {
  let id = UUID()
  let context: WorkflowViewerContext
  let input: WorkflowViewerInput
  let mediaController: RichChatMediaController
  let headings: RichRuntimeItemHeadingController
  let catalog: RichToolPresentationCatalog?
  let controller = WorkflowViewerController()
}

/// Generic workflow navigation, available from canonical metadata or a
/// host-advertised viewer projection. No producer name is interpreted here.
struct RichWorkflowViewerAccessory: View {
  let item: RichRuntimeItem
  @Environment(\.workflowViewerContext) private var context
  @Environment(\.toolPresentationCatalog) private var catalog
  @Environment(\.workflowViewerPresentation) private var presenter

  private var input: WorkflowViewerInput? {
    context?.input(for: item, catalog: catalog)
  }

  var body: some View {
    if let input, let context, let presenter {
      Button(WorkflowViewerStrings.open, systemImage: "point.3.connected.trianglepath.dotted") {
        presenter.present(context: context, input: input, catalog: catalog)
      }
        .font(.footnote)
        .poracodeGlassButtonStyle()
        .accessibilityIdentifier("native-e2e.workflow-open.\(item.id)")
    }
  }
}
