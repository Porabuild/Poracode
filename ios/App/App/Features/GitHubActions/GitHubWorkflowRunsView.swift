import SwiftUI

struct GitHubWorkflowRunsView: View {
  let context: GitHubControllerContext?
  let workflow: GitHubWorkflowSummary
  @Bindable var controller: GitHubWorkflowController
  @Bindable var mutations: GitHubWorkflowMutationController

  @State private var dispatchDefinition: GitHubWorkflowDefinition?
  @State private var dispatchDiscoveryDeadline: Date?

  private var runs: [GitHubWorkflowRun] {
    guard let document = controller.documents[.ghListWorkflowRuns] else { return [] }
    return GitHubResultProjection.workflowRuns(
      .json(procedure: .ghListWorkflowRuns, document: document)
    ) ?? []
  }

  private var definition: GitHubWorkflowDefinition? {
    guard let document = controller.documents[.ghGetWorkflowDefinition] else { return nil }
    let value = GitHubResultProjection.workflowDefinition(
      .json(procedure: .ghGetWorkflowDefinition, document: document)
    )
    return value?.workflowId == workflow.id ? value : nil
  }

  private var pollingEnabled: Bool {
    GitHubActionsPollingPolicy.shouldPoll(
      runs: runs,
      dispatchDiscoveryDeadline: dispatchDiscoveryDeadline,
      now: Date()
    )
  }

  var body: some View {
    List {
      if let failure = controller.failure ?? mutations.state.failure {
        Section {
          Label(
            GitHubOperationsStrings.failure(failure),
            systemImage: "exclamationmark.triangle"
          )
          .foregroundStyle(.secondary)
        }
      }

      if runs.isEmpty, isLoading {
        Section {
          HStack(spacing: 10) {
            ProgressView()
            Text(ProjectManagementStrings.loading)
              .foregroundStyle(.secondary)
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 24)
        }
      } else if runs.isEmpty {
        Section {
          ContentUnavailableView(
            GitHubOperationsStrings.workflows,
            systemImage: "clock.arrow.circlepath"
          )
        }
      } else {
        Section {
          ForEach(runs) { run in
            NavigationLink {
              GitHubWorkflowRunDetailView(
                context: context,
                initialRun: run,
                controller: controller,
                mutations: mutations
              )
            } label: {
              GitHubWorkflowRunRow(run: run)
            }
            .contextMenu { runActions(run) }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
              if run.status.lowercased() == "completed" {
                Button(role: .destructive) {
                  Task { await submit(.ghDeleteWorkflowRun(request(run))) }
                } label: {
                  Label(
                    GitHubOperationsStrings.action(.ghDeleteWorkflowRun),
                    systemImage: "trash"
                  )
                }
              } else {
                Button {
                  Task { await submit(.ghCancelWorkflowRun(request(run))) }
                } label: {
                  Label(
                    GitHubOperationsStrings.action(.ghCancelWorkflowRun),
                    systemImage: "stop.circle"
                  )
                }
                .tint(.orange)
              }
            }
          }
        } header: {
          Text(workflow.path)
            .textCase(nil)
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(workflow.name)
    .navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      PoracodeBottomActionBar {
        PoracodeCircleButton {
          Task { await load() }
        } label: {
          Label(HomeStrings.refresh, systemImage: "arrow.clockwise")
            .labelStyle(.iconOnly)
        }
        .disabled(isLoading)
        .accessibilityLabel(HomeStrings.refresh)
        .accessibilityIdentifier("native-e2e.github-actions.refresh-runs")
      } trailing: {
        if definition?.dispatchable == true {
          PoracodeCircleButton {
            dispatchDefinition = definition
          } label: {
            Label(GitHubOperationsStrings.run, systemImage: "play.fill")
              .labelStyle(.iconOnly)
          }
          .disabled(mutations.state.isBusy)
          .accessibilityLabel(GitHubOperationsStrings.run)
          .accessibilityIdentifier("native-e2e.github-actions.run-workflow")
        }
      }
    }
    .task(id: workflow.id) { await load() }
    .task(id: pollingEnabled) {
      guard pollingEnabled else { return }
      await pollRuns()
    }
    .refreshable { await load() }
    .sheet(item: $dispatchDefinition) { definition in
      GitHubWorkflowDispatchView(workflow: workflow, definition: definition) {
        await dispatch(ref: $0, inputs: $1)
      }
    }
    .confirmationDialog(
      confirmationTitle,
      isPresented: confirmationPresented,
      titleVisibility: .visible
    ) {
      Button(confirmationTitle, role: .destructive) {
        Task {
          await mutations.confirmPendingMutation()
          await loadRuns()
        }
      }
      Button(GitHubOperationsStrings.cancel, role: .cancel) {
        mutations.cancelPendingMutation()
      }
    } message: {
      Text(confirmationMessage)
    }
  }

  @ViewBuilder
  private func runActions(_ run: GitHubWorkflowRun) -> some View {
    if run.status.lowercased() == "completed" {
      Button {
        Task {
          await submit(
            .ghRerunWorkflowRun(
              .init(projectLocation: location, runId: run.id, failedOnly: false)
            )
          )
        }
      } label: {
        Label(
          GitHubOperationsStrings.action(.ghRerunWorkflowRun),
          systemImage: "arrow.clockwise"
        )
      }
      if run.conclusion.lowercased() == "failure" {
        Button {
          Task {
            await submit(
              .ghRerunWorkflowRun(
                .init(projectLocation: location, runId: run.id, failedOnly: true)
              )
            )
          }
        } label: {
          Label(GitHubOperationsStrings.failedOnly, systemImage: "arrow.clockwise.circle")
        }
      }
      Button(role: .destructive) {
        Task { await submit(.ghDeleteWorkflowRun(request(run))) }
      } label: {
        Label(
          GitHubOperationsStrings.action(.ghDeleteWorkflowRun),
          systemImage: "trash"
        )
      }
    } else {
      Button(role: .destructive) {
        Task { await submit(.ghCancelWorkflowRun(request(run))) }
      } label: {
        Label(
          GitHubOperationsStrings.action(.ghCancelWorkflowRun),
          systemImage: "stop.circle"
        )
      }
    }
  }

  private var location: GitHubProjectLocation {
    context?.lease.location ?? .posix(path: "", remoteServerId: nil)
  }

  private var isLoading: Bool {
    if case .loading = controller.loadState { return true }
    return false
  }

  private var confirmationPresented: Binding<Bool> {
    Binding(
      get: { mutations.state.pendingConfirmation != nil },
      set: { if !$0 { mutations.cancelPendingMutation() } }
    )
  }

  private var confirmationTitle: String {
    mutations.state.pendingConfirmation.map {
      GitHubOperationsStrings.action($0.request.procedure)
    } ?? GitHubOperationsStrings.confirm
  }

  private var confirmationMessage: String {
    mutations.state.pendingConfirmation.map {
      GitHubOperationsStrings.confirmation(for: $0.request)
    } ?? GitHubOperationsStrings.confirm
  }

  private func request(_ run: GitHubWorkflowRun) -> GitHubWorkflowRunRequest {
    .init(projectLocation: location, runId: run.id)
  }

  private func load() async {
    await loadRuns()
    guard context?.isUsable == true else { return }
    await controller.load(
      .ghGetWorkflowDefinition(
        .init(projectLocation: location, workflowId: workflow.id)
      )
    )
  }

  private func loadRuns() async {
    guard context?.isUsable == true else { return }
    await controller.load(
      .ghListWorkflowRuns(
        .init(projectLocation: location, workflowId: workflow.id)
      )
    )
  }

  private func submit(_ request: GitHubOperationRequest) async {
    await mutations.submit(request)
    if mutations.state.pendingConfirmation == nil { await loadRuns() }
  }

  private func dispatch(
    ref: String,
    inputs: [String: String]
  ) async -> GitHubOperationsFailure? {
    await submit(
      .ghDispatchWorkflow(
        .init(
          projectLocation: location,
          workflowId: workflow.id,
          ref: ref,
          inputs: inputs
        )
      )
    )
    if mutations.state.failure == nil {
      dispatchDiscoveryDeadline = Date().addingTimeInterval(
        GitHubActionsPollingPolicy.dispatchDiscoveryTimeout
      )
    }
    return mutations.state.failure
  }

  private func pollRuns() async {
    while !Task.isCancelled {
      do {
        try await Task.sleep(for: .seconds(GitHubActionsPollingPolicy.interval))
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      if let deadline = dispatchDiscoveryDeadline, deadline <= Date() {
        dispatchDiscoveryDeadline = nil
      }
      guard pollingEnabled else { return }
      await loadRuns()
    }
  }
}

struct GitHubWorkflowRunRow: View {
  let run: GitHubWorkflowRun

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: GitHubActionsStatus.symbol(run.status, run.conclusion))
        .foregroundStyle(GitHubActionsStatus.color(run.status, run.conclusion))
        .padding(.top, 2)
      VStack(alignment: .leading, spacing: 4) {
        Text(run.title.isEmpty ? run.workflowName : run.title)
          .foregroundStyle(.primary)
          .lineLimit(2)
        HStack(spacing: 6) {
          if !run.headBranch.isEmpty {
            Text(run.headBranch)
              .font(.caption.monospaced())
          }
          if !run.event.isEmpty { Text(run.event) }
          Text("#\(run.number)")
            .monospacedDigit()
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
      }
      Spacer(minLength: 4)
      if let date = GitHubActionsDate.parse(run.updatedAt) {
        Text(date, style: .relative)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }
}

enum GitHubActionsStatus {
  static func symbol(_ status: String, _ conclusion: String) -> String {
    if status.lowercased() != "completed" {
      switch status.lowercased() {
      case "queued", "requested": return "clock"
      case "waiting", "pending": return "hourglass"
      default: return "progress.indicator"
      }
    }
    switch conclusion.lowercased() {
    case "success": return "checkmark.circle.fill"
    case "failure", "startup_failure", "action_required": return "xmark.circle.fill"
    case "cancelled": return "minus.circle.fill"
    case "skipped": return "arrow.forward.to.line.circle.fill"
    case "timed_out": return "clock.badge.exclamationmark.fill"
    default: return "questionmark.circle"
    }
  }

  static func color(_ status: String, _ conclusion: String) -> Color {
    if status.lowercased() != "completed" { return .blue }
    switch conclusion.lowercased() {
    case "success": return .green
    case "failure", "startup_failure", "action_required": return .red
    case "cancelled", "skipped", "neutral": return .secondary
    default: return .orange
    }
  }

  static func label(_ status: String, _ conclusion: String) -> String {
    switch conclusion.lowercased() {
    case "success": return GitHubOperationsStrings.succeeded
    case "failure", "startup_failure", "action_required":
      return GitHubOperationsStrings.failed
    case "cancelled": return GitHubOperationsStrings.cancelled
    case "skipped", "neutral": return GitHubOperationsStrings.skipped
    case "timed_out": return GitHubOperationsStrings.timedOut
    default:
      switch status.lowercased() {
      case "in_progress": return GitHubOperationsStrings.inProgress
      case "queued", "requested": return GitHubOperationsStrings.queued
      case "waiting", "pending": return GitHubOperationsStrings.waiting
      default: return GitHubOperationsStrings.unknown
      }
    }
  }
}

enum GitHubActionsDate {
  static func parse(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }
}

enum GitHubActionsPollingPolicy {
  static let interval: TimeInterval = 5
  static let dispatchDiscoveryTimeout: TimeInterval = 30

  static func shouldPoll(
    runs: [GitHubWorkflowRun],
    dispatchDiscoveryDeadline: Date?,
    now: Date
  ) -> Bool {
    runs.contains { $0.status.lowercased() != "completed" }
      || dispatchDiscoveryDeadline.map { $0 > now } == true
  }
}
