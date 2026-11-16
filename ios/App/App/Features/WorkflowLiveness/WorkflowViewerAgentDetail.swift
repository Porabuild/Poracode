import SwiftUI

struct WorkflowViewerAgentDetail: View {
  let context: WorkflowViewerContext
  let owner: WorkflowActivityOwner
  let reference: WorkflowRunReference?
  let row: RichWorkflowAgentRow
  let mediaController: RichChatMediaController
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.toolPresentationCatalog) private var catalog
  let controller: WorkflowAgentTranscriptController
  let disclosures: TranscriptDisclosureStore
  @State private var retry = UUID()

  private struct Work: Equatable {
    let agentID: String
    let reference: WorkflowRunReference?
    let target: RichChatThreadTarget?
    let finished: Bool
    let active: Bool
    let retry: UUID
  }
  private var threadID: String { "wf-agent-chat:\(reference?.runID ?? ""):\(row.id)" }

  var body: some View {
    List {
      Section {
        HStack(alignment: .top, spacing: 8) {
          WorkflowViewerAgentState(state: row.agent.state)
          VStack(alignment: .leading, spacing: 3) {
            Text([row.model,
              row.agent.tokens.map { WorkflowViewerStrings.tokens($0.formatted()) },
              row.agent.toolCalls.map { WorkflowViewerStrings.tools($0.formatted()) },
              row.agent.durationMs.flatMap { RichChatPresentation.completedTurnDuration($0) },
            ].compactMap { $0 }.joined(separator: " · "))
              .font(.caption).foregroundStyle(.secondary)
            if let tool = row.agent.lastToolName {
              Text(WorkflowViewerStrings.lastTool(tool)).font(.caption).foregroundStyle(.secondary)
            }
          }
        }
      }
      if controller.failed {
        Section {
          Text(WorkflowViewerStrings.chatFailed).font(.footnote).foregroundStyle(.secondary)
          Button(RichChatStrings.retry) { retry = UUID() }.poracodeGlassButtonStyle()
        }
      }
      if controller.agentID == row.id, let projection = controller.projection, !projection.visibleEntries.isEmpty {
        ForEach(projection.visibleEntries, id: \.stableID) { entry in
          RichChatTimelineEntryView(entry: entry, mediaController: mediaController,
            actions: .init(lastVisibleItemID: projection.visibleEntries.last?.lastItemID,
              rawItems: projection.rawItems, isTurnActive: !row.isFinished, requestTruncate: nil))
            .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
        }
      } else if reference == nil || controller.settled {
        fallback
      } else {
        ProgressView().frame(maxWidth: .infinity)
      }
    }
    .listStyle(.plain)
    .environment(\.defaultMinListRowHeight, 0)
    .listRowSpacing(6)
    .environment(\.transcriptDisclosures, .init(store: disclosures, connectionID: owner.thread.connectionID, threadID: threadID))
    .environment(\.runtimeItemHeadings, nil)
    .environment(\.runtimeItemHeadingSnapshot, controller.headings)
    .environment(\.runtimeToolBodySnapshot, controller.bodies)
    .environment(\.workflowViewerContext, nil)
    .task(id: Work(agentID: row.id, reference: reference, target: context.transcript.state.target,
      finished: row.isFinished, active: scenePhase == .active, retry: retry)) {
      guard scenePhase == .active, let reference, context.owns(owner) else { controller.invalidate(); return }
      let gateway = context.session.makeWorkflowViewerGateway()
      await controller.load(agentID: row.id, threadID: threadID, finished: row.isFinished, read: { threadID in
        guard context.owns(owner) else { throw CancellationError() }
        let result = try await gateway.readAgentChat(owner: owner, reference: reference,
          agentID: row.id, threadID: threadID, finished: row.isFinished)
        guard context.owns(owner) else { throw CancellationError() }
        return result
      }, catalog: catalog)
    }
    .accessibilityIdentifier("native-e2e.workflow-agent-detail")
  }

  @ViewBuilder private var fallback: some View {
    if let prompt = row.agent.promptPreview, !prompt.isEmpty {
      Section(WorkflowViewerStrings.prompt) { RichChatMarkdownView(source: prompt) }
    }
    if let result = row.agent.resultPreview, !result.isEmpty {
      Section(WorkflowViewerStrings.outcome) { RichChatMarkdownView(source: result) }
    }
    ForEach(Array((row.agent.chat ?? []).enumerated()), id: \.offset) { _, entry in
      Section {
        if let title = entry.title { Text(title).font(.footnote).foregroundStyle(.secondary) }
        if let text = entry.text { RichChatMarkdownView(source: text) }
        if let timestamp = entry.timestamp { Text(timestamp).font(.caption).foregroundStyle(.secondary) }
      } header: { Text(WorkflowViewerStrings.role(entry.role)) }
    }
  }
}
