import SwiftUI

struct WorkflowViewerScreen: View {
  let context: WorkflowViewerContext
  let input: WorkflowViewerInput
  let mediaController: RichChatMediaController
  let headings: RichRuntimeItemHeadingController
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.toolPresentationCatalog) private var catalog
  @Bindable var controller: WorkflowViewerController
  @State private var compactColumn = NavigationSplitViewColumn.sidebar
  @State private var retry = UUID()

  private struct Work: Equatable {
    let target: RichChatThreadTarget?
    let input: WorkflowViewerInput
    let active: Bool
    let authorized: Bool
    let reference: WorkflowRunReference?
    let retry: UUID
  }
  private var currentReference: WorkflowRunReference? {
    input.reference ?? controller.reference ?? context.availableReference(for: input, catalog: catalog)
  }

  var body: some View {
    NavigationSplitView(preferredCompactColumn: $compactColumn) {
      agents
        .navigationTitle(WorkflowViewerStrings.title)
        .navigationBarTitleDisplayMode(.inline)
        .navigationSplitViewColumnWidth(min: 240, ideal: 300, max: 380)
        .toolbar { if horizontalSizeClass == .compact { close } }
    } detail: {
      Group {
      if let agent = controller.selectedAgent {
        WorkflowViewerAgentDetail(context: context, owner: input.owner,
          reference: controller.reference, row: agent, mediaController: mediaController,
          controller: controller.agentTranscript, disclosures: controller.disclosures)
          .navigationTitle(agent.label(in: agent.phaseTitle ?? ""))
          .navigationBarTitleDisplayMode(.inline)
      } else {
        ContentUnavailableView(WorkflowViewerStrings.selectAgent, systemImage: "person.crop.rectangle.stack")
      }
      }
      .toolbar { close }
    }
    .navigationSplitViewStyle(.balanced)
    .task(id: Work(target: headings.target, input: input,
      active: scenePhase == .active, authorized: context.owns(input.owner), reference: currentReference, retry: retry)) {
      guard scenePhase == .active, context.owns(input.owner) else { controller.invalidate(); return }
      let gateway = context.session.makeWorkflowViewerGateway()
      await controller.load(canonicalReference: currentReference, readPlan: {
        guard let request = input.request else { return nil }
        let raw = try await headings.readAdvisory(request)?.workflowView
        return raw.flatMap(RichWorkflowViewPlan.init)
      }, readRun: { reference in
        guard context.owns(input.owner) else { throw CancellationError() }
        let result = try await gateway.read(owner: input.owner, reference: reference, includeAgentChats: true)
        guard context.owns(input.owner) else { throw CancellationError() }
        return result
      })
    }
    .onChange(of: context.owns(input.owner)) { _, authorized in if !authorized { dismiss() } }
    .environment(\.richChatFileDownloads, RichChatFileDownloadContext(controller: mediaController, location: input.owner.location))
    .accessibilityIdentifier("native-e2e.workflow-viewer")
  }

  @ToolbarContentBuilder private var close: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      PoracodeToolbarIconButton(title: WorkflowViewerStrings.close, systemImage: "xmark") { dismiss() }
        .keyboardShortcut(.cancelAction)
        .accessibilityIdentifier("native-e2e.workflow-close")
    }
  }

  private var agents: some View {
    List(selection: Binding(get: { controller.agentID }, set: { controller.agentID = $0 })) {
      Section {
        VStack(alignment: .leading, spacing: 8) {
        if let summary = controller.run?.summary ?? controller.plan.description, !summary.isEmpty {
          Text(summary).font(.subheadline).textSelection(.enabled)
        }
        statistics
        }
        if controller.failed {
          VStack(alignment: .leading, spacing: 8) {
            Text(WorkflowViewerStrings.readFailed).foregroundStyle(.secondary)
            Button(RichChatStrings.retry) { retry = UUID() }.poracodeGlassButtonStyle()
          }
          .accessibilityIdentifier("native-e2e.workflow-read-failure")
        }
      }
      if !controller.projection.phases.isEmpty {
        Section {
        Picker(WorkflowViewerStrings.phases, selection: Binding(
          get: { controller.selectedPhase?.id ?? 0 },
          set: { controller.selectPhase($0); compactColumn = .sidebar })) {
          ForEach(controller.projection.phases) { phase in
            Text(phase.title + (phase.agents.isEmpty ? "" : "  \(phase.completedCount)/\(phase.agents.count)"))
              .tag(phase.id)
          }
        }
        .accessibilityIdentifier("native-e2e.workflow-phase")
        if let phase = controller.selectedPhase {
            if let detail = phase.detail, !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary) }
            agentRows(phase.agents, phase: phase.title)
            if phase.agents.isEmpty { waiting }
        }
        }
      }
      if !controller.projection.unphased.isEmpty {
        Section {
          agentRows(controller.projection.unphased, phase: "")
        } header: {
          if !controller.projection.phases.isEmpty { Text(WorkflowViewerStrings.unphased) }
        }
      } else if controller.projection.phases.isEmpty { waiting }
    }
    .listStyle(.sidebar)
    .listSectionSpacing(.compact)
    .contentMargins(.top, 8, for: .scrollContent)
    .onChange(of: controller.agentID) { _, id in compactColumn = id == nil ? .sidebar : .detail }
  }

  private var waiting: some View {
    HStack(spacing: 8) {
      if controller.isLoading { ProgressView().controlSize(.small) }
      Text(WorkflowViewerStrings.waiting).foregroundStyle(.secondary)
    }
  }

  @ViewBuilder private var statistics: some View {
    if let run = controller.run {
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Text(WorkflowViewerStrings.agents(controller.projection.completedCount.formatted(), run.agentCount.formatted()))
          Spacer()
          Text(AdvancedOperationsStrings.runStatus(run.status))
        }
        Text([
          run.durationMs.flatMap { RichChatPresentation.completedTurnDuration($0) },
          run.totalTokens.map { WorkflowViewerStrings.tokens($0.formatted()) },
          run.totalToolCalls.map { WorkflowViewerStrings.tools($0.formatted()) },
        ].compactMap { $0 }.joined(separator: " · "))
      }
      .font(.caption).foregroundStyle(.secondary).monospacedDigit()
      .accessibilityIdentifier("native-e2e.workflow-statistics")
    }
  }

  private func agentRows(_ rows: [RichWorkflowAgentRow], phase: String) -> some View {
    ForEach(rows) { row in
      let selected = controller.agentID == row.id
      let foreground = selected ? Color(uiColor: .systemBackground) : Color.primary
      NavigationLink(value: row.id) {
        HStack(spacing: 10) {
          WorkflowViewerAgentState(state: row.agent.state)
          VStack(alignment: .leading, spacing: 3) {
            Text(row.label(in: phase)).font(.subheadline.weight(.medium))
            Text([row.model, row.agent.tokens.map { WorkflowViewerStrings.tokens($0.formatted()) }]
              .compactMap { $0 }.joined(separator: " · "))
              .font(.caption).foregroundStyle(selected ? foreground.opacity(0.75) : Color.secondary).lineLimit(1)
          }
        }
        .foregroundStyle(foreground)
        .tint(foreground)
      }
      .accessibilityIdentifier("native-e2e.workflow-agent.\(row.id)")
    }
  }
}

struct WorkflowViewerAgentState: View {
  let state: AdvancedWorkflowAgentState?
  var body: some View {
    Group {
      switch state {
      case .done: Image(systemName: "checkmark.circle")
      case .failed: Image(systemName: "exclamationmark.circle").foregroundStyle(.red)
      case .cancelled: Image(systemName: "xmark.circle")
      case .queued: Image(systemName: "clock")
      case .running, .none: ProgressView().controlSize(.small)
      }
    }
    .frame(width: 20)
    .accessibilityLabel(WorkflowViewerStrings.state(state))
  }
}
