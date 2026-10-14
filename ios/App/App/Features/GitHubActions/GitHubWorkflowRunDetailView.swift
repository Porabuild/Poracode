import SwiftUI

struct GitHubWorkflowRunDetailView: View {
  @Environment(\.openURL) private var openURL

  let context: GitHubControllerContext?
  let initialRun: GitHubWorkflowRun
  @Bindable var controller: GitHubWorkflowController
  @Bindable var mutations: GitHubWorkflowMutationController

  private var run: GitHubWorkflowRun {
    guard let document = controller.documents[.ghGetWorkflowRun],
      let loaded = GitHubResultProjection.workflowRun(
        .json(procedure: .ghGetWorkflowRun, document: document)
      ), loaded.id == initialRun.id
    else { return initialRun }
    return loaded
  }

  var body: some View {
    List {
      Section {
        Label {
          Text(GitHubActionsStatus.label(run.status, run.conclusion))
        } icon: {
          Image(systemName: GitHubActionsStatus.symbol(run.status, run.conclusion))
            .foregroundStyle(GitHubActionsStatus.color(run.status, run.conclusion))
        }
        if !run.event.isEmpty {
          Label(run.event, systemImage: "bolt")
        }
        Label {
          Text(run.attempt, format: .number)
        } icon: {
          Image(systemName: "arrow.clockwise")
        }
        .accessibilityLabel(
          "\(GitHubOperationsStrings.attempt), \(run.attempt.formatted())"
        )
        if !run.headBranch.isEmpty {
          Label(run.headBranch, systemImage: "arrow.triangle.branch")
            .fontDesign(.monospaced)
        }
        if !run.headSha.isEmpty {
          Label(String(run.headSha.prefix(7)), systemImage: "point.3.connected.trianglepath.dotted")
            .fontDesign(.monospaced)
        }
        if let date = GitHubActionsDate.parse(run.updatedAt) {
          Label {
            Text(date, style: .relative)
          } icon: {
            Image(systemName: "clock")
          }
        }
      } header: {
        Text("#\(run.number)")
          .textCase(nil)
      }

      ForEach(run.jobs) { job in
        Section {
          if job.steps.isEmpty {
            Label {
              Text(job.status)
            } icon: {
              Image(systemName: GitHubActionsStatus.symbol(job.status, job.conclusion))
                .foregroundStyle(GitHubActionsStatus.color(job.status, job.conclusion))
            }
          } else {
            ForEach(job.steps) { step in
              HStack(spacing: 12) {
                Image(systemName: GitHubActionsStatus.symbol(step.status, step.conclusion))
                  .foregroundStyle(GitHubActionsStatus.color(step.status, step.conclusion))
                Text(step.name)
                Spacer(minLength: 8)
                Text("\(step.number)")
                  .font(.caption.monospacedDigit())
                  .foregroundStyle(.secondary)
              }
            }
          }
        } header: {
          HStack {
            Text(job.name)
              .textCase(nil)
            Spacer()
            if let value = job.url, let url = URL(string: value) {
              Button {
                openURL(url)
              } label: {
                Image(systemName: "safari")
              }
              .accessibilityLabel(PullRequestsStrings.openExternally)
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(run.title.isEmpty ? run.workflowName : run.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Menu {
          Button(HomeStrings.refresh, systemImage: "arrow.clockwise") {
            Task { await load() }
          }
          if let url = URL(string: run.url), !run.url.isEmpty {
            Button(PullRequestsStrings.openExternally, systemImage: "safari") {
              openURL(url)
            }
          }
          if run.status.lowercased() == "completed" {
            Button(
              GitHubOperationsStrings.action(.ghRerunWorkflowRun),
              systemImage: "arrow.clockwise"
            ) {
              Task { await rerun(failedOnly: false) }
            }
            if run.conclusion.lowercased() == "failure" {
              Button(GitHubOperationsStrings.failedOnly, systemImage: "arrow.clockwise.circle") {
                Task { await rerun(failedOnly: true) }
              }
            }
            Button(
              GitHubOperationsStrings.action(.ghDeleteWorkflowRun),
              systemImage: "trash",
              role: .destructive
            ) {
              Task { await submit(.ghDeleteWorkflowRun(runRequest)) }
            }
          } else {
            Button(
              GitHubOperationsStrings.action(.ghCancelWorkflowRun),
              systemImage: "stop.circle",
              role: .destructive
            ) {
              Task { await submit(.ghCancelWorkflowRun(runRequest)) }
            }
          }
        } label: {
          Image(systemName: "ellipsis.circle")
        }
        .disabled(mutations.state.isBusy)
        .accessibilityLabel(GitHubOperationsStrings.detail)
      }
    }
    .task(id: initialRun.id) { await load() }
    .task(id: run.status.lowercased() != "completed") {
      guard run.status.lowercased() != "completed" else { return }
      await pollRun()
    }
    .refreshable { await load() }
    .confirmationDialog(
      confirmationTitle,
      isPresented: confirmationPresented,
      titleVisibility: .visible
    ) {
      Button(confirmationTitle, role: .destructive) {
        Task {
          await mutations.confirmPendingMutation()
          await load()
        }
      }
      Button(GitHubOperationsStrings.cancel, role: .cancel) {
        mutations.cancelPendingMutation()
      }
    } message: {
      Text(confirmationMessage)
    }
  }

  private var location: GitHubProjectLocation {
    context?.lease.location ?? initialRunLocationFallback
  }

  private var initialRunLocationFallback: GitHubProjectLocation {
    .posix(path: "", remoteServerId: nil)
  }

  private var runRequest: GitHubWorkflowRunRequest {
    .init(projectLocation: location, runId: run.id)
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

  private func load() async {
    guard context?.isUsable == true else { return }
    await controller.load(.ghGetWorkflowRun(runRequest))
  }

  private func rerun(failedOnly: Bool) async {
    await submit(
      .ghRerunWorkflowRun(
        .init(projectLocation: location, runId: run.id, failedOnly: failedOnly)
      )
    )
  }

  private func submit(_ request: GitHubOperationRequest) async {
    await mutations.submit(request)
    if mutations.state.pendingConfirmation == nil { await load() }
  }

  private func pollRun() async {
    while !Task.isCancelled, run.status.lowercased() != "completed" {
      do {
        try await Task.sleep(for: .seconds(GitHubActionsPollingPolicy.interval))
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      await load()
    }
  }
}
