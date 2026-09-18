import SwiftUI

struct GitHubOperationFormView: View {
  let procedure: GitHubProcedure
  let location: GitHubProjectLocation
  let submit: @MainActor (GitHubOperationRequest) async -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var draft: GitHubOperationDraft

  init(
    procedure: GitHubProcedure,
    location: GitHubProjectLocation,
    accounts: [GitHubAccountSummary],
    pullRequests: [GitHubPullRequestSummary],
    workflows: [GitHubWorkflowSummary],
    initialBranch: String = "",
    initialBaseBranch: String = "main",
    submit: @escaping @MainActor (GitHubOperationRequest) async -> Void
  ) {
    self.procedure = procedure
    self.location = location
    self.submit = submit
    _draft = State(
      initialValue: GitHubOperationDraft(
        account: accounts.first,
        pullRequest: pullRequests.first,
        workflow: workflows.first,
        initialBranch: initialBranch,
        initialBaseBranch: initialBaseBranch
      )
    )
  }

  var body: some View {
    NavigationStack {
      Form { fields }
        .navigationTitle(GitHubOperationsStrings.action(procedure))
        .gitHubInlineNavigationTitle()
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(GitHubOperationsStrings.cancel) { dismiss() }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button(GitHubOperationsStrings.run) {
              guard let request else { return }
              Task {
                await submit(request)
                dismiss()
              }
            }
            .disabled(request == nil)
          }
        }
    }
  }

  @ViewBuilder
  private var fields: some View {
    switch procedure {
    case .ghCheckAvailable:
      Picker(GitHubOperationsStrings.detail, selection: $draft.availabilityDetail) {
        Text(GitHubOperationsStrings.summary).tag(GitHubAvailabilityDetail.summary)
        Text(GitHubOperationsStrings.full).tag(GitHubAvailabilityDetail.full)
      }
    case .ghGetPrForBranch, .ghGetPrChecks:
      branchField
    case .ghListPrs, .ghListPullRequests, .ghListAccounts, .ghListWorkflows:
      readyField
    case .ghGetPrFiles, .ghGetPrDiff, .ghGetPrDetails, .ghGetPrReviewComments,
      .ghClosePr, .ghReopenPr, .ghMarkPrReady:
      pullRequestField
    case .ghListRepos:
      accountFields
    case .ghListWorkflowRuns:
      optionalWorkflowField
    case .ghGetWorkflowRun, .ghCancelWorkflowRun, .ghDeleteWorkflowRun:
      workflowRunField
    case .ghGetWorkflowDefinition:
      workflowField
      refField
    case .ghCreatePr:
      branchField
      textField(GitHubOperationsStrings.baseBranch, text: $draft.baseBranch)
      textField(GitHubOperationsStrings.pullRequestTitle, text: $draft.title)
      bodyField
      Toggle(GitHubOperationsStrings.draft, isOn: $draft.isDraft)
    case .ghMergePr:
      pullRequestField
      Picker(GitHubOperationsStrings.mergeMethod, selection: $draft.mergeMethod) {
        Text(GitHubOperationsStrings.merge).tag(GitHubMergeMethod.merge)
        Text(GitHubOperationsStrings.squash).tag(GitHubMergeMethod.squash)
        Text(GitHubOperationsStrings.rebase).tag(GitHubMergeMethod.rebase)
      }
      Toggle(GitHubOperationsStrings.admin, isOn: $draft.admin)
    case .ghSubmitPrReview:
      pullRequestField
      Picker(GitHubOperationsStrings.reviewDecision, selection: $draft.reviewDecision) {
        Text(GitHubOperationsStrings.approve).tag(GitHubReviewDecision.approve)
        Text(GitHubOperationsStrings.requestChanges).tag(GitHubReviewDecision.requestChanges)
        Text(GitHubOperationsStrings.commentDecision).tag(GitHubReviewDecision.comment)
      }
      bodyField
    case .ghUpdatePrBranch:
      pullRequestField
      Toggle(GitHubOperationsStrings.rebase, isOn: $draft.rebase)
    case .ghPostPrComment:
      pullRequestField
      bodyField
    case .ghDispatchWorkflow:
      workflowField
      refField
      inputsField
    case .ghRerunWorkflowRun:
      workflowRunField
      Toggle(GitHubOperationsStrings.failedOnly, isOn: $draft.failedOnly)
    }
  }

  private var readyField: some View {
    Label(GitHubOperationsStrings.ready, systemImage: "checkmark.circle")
      .foregroundStyle(.secondary)
  }

  private var branchField: some View {
    textField(GitHubOperationsStrings.branch, text: $draft.branch)
  }

  private var pullRequestField: some View {
    textField(
      GitHubOperationsStrings.pullRequestNumber,
      text: $draft.pullRequestNumber,
      usesNumberPad: true
    )
  }

  private var accountFields: some View {
    Group {
      textField(GitHubOperationsStrings.host, text: $draft.accountHost)
      textField(GitHubOperationsStrings.login, text: $draft.accountLogin)
    }
  }

  private var optionalWorkflowField: some View {
    textField(
      GitHubOperationsStrings.optionalWorkflowId,
      text: $draft.workflowId,
      usesNumberPad: true
    )
  }

  private var workflowField: some View {
    textField(
      GitHubOperationsStrings.workflowId,
      text: $draft.workflowId,
      usesNumberPad: true
    )
  }

  private var workflowRunField: some View {
    textField(
      GitHubOperationsStrings.workflowRunId,
      text: $draft.workflowRunId,
      usesNumberPad: true
    )
  }

  private var refField: some View {
    textField(GitHubOperationsStrings.ref, text: $draft.ref)
  }

  private var bodyField: some View {
    Section(GitHubOperationsStrings.body) {
      TextEditor(text: $draft.body)
        .frame(minHeight: 100)
        .accessibilityLabel(GitHubOperationsStrings.body)
    }
  }

  private var inputsField: some View {
    Section(GitHubOperationsStrings.inputs) {
      TextEditor(text: $draft.inputs)
        .frame(minHeight: 100)
        .accessibilityLabel(GitHubOperationsStrings.inputs)
      Text(GitHubOperationsStrings.inputsHint)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private func textField(
    _ title: String,
    text: Binding<String>,
    usesNumberPad: Bool = false
  ) -> some View {
    #if os(iOS)
      TextField(title, text: text)
        .keyboardType(usesNumberPad ? .numberPad : .default)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .accessibilityLabel(title)
    #else
      TextField(title, text: text)
        .accessibilityLabel(title)
    #endif
  }

  private var request: GitHubOperationRequest? {
    draft.request(for: procedure, location: location)
  }
}

extension View {
  @ViewBuilder
  fileprivate func gitHubInlineNavigationTitle() -> some View {
    #if os(iOS)
      navigationBarTitleDisplayMode(.inline)
    #else
      self
    #endif
  }
}

private struct GitHubOperationDraft {
  var availabilityDetail = GitHubAvailabilityDetail.summary
  var branch = ""
  var baseBranch = "main"
  var title = ""
  var body = ""
  var pullRequestNumber = ""
  var accountHost = ""
  var accountLogin = ""
  var workflowId = ""
  var workflowRunId = ""
  var ref = ""
  var inputs = ""
  var isDraft = false
  var admin = false
  var rebase = false
  var failedOnly = false
  var mergeMethod = GitHubMergeMethod.merge
  var reviewDecision = GitHubReviewDecision.comment

  init(
    account: GitHubAccountSummary?,
    pullRequest: GitHubPullRequestSummary?,
    workflow: GitHubWorkflowSummary?,
    initialBranch: String = "",
    initialBaseBranch: String = "main"
  ) {
    accountHost = account?.host ?? ""
    accountLogin = account?.login ?? ""
    pullRequestNumber = pullRequest.map { String($0.number) } ?? ""
    workflowId = workflow.map { String($0.id) } ?? ""
    branch = initialBranch
    baseBranch = initialBaseBranch
  }

  func request(
    for procedure: GitHubProcedure,
    location: GitHubProjectLocation
  ) -> GitHubOperationRequest? {
    switch procedure {
    case .ghCheckAvailable:
      return .ghCheckAvailable(.init(projectLocation: location, detail: availabilityDetail))
    case .ghGetPrForBranch:
      return nonempty(branch).map {
        .ghGetPrForBranch(.init(projectLocation: location, branch: $0))
      }
    case .ghListPrs: return .ghListPrs(.init(projectLocation: location))
    case .ghListPullRequests: return .ghListPullRequests(.init(projectLocation: location))
    case .ghGetPrChecks:
      return nonempty(branch).map {
        .ghGetPrChecks(.init(projectLocation: location, branch: $0))
      }
    case .ghGetPrFiles: return prRequest(.ghGetPrFiles, location: location)
    case .ghGetPrDiff: return prRequest(.ghGetPrDiff, location: location)
    case .ghGetPrDetails: return prRequest(.ghGetPrDetails, location: location)
    case .ghGetPrReviewComments:
      return prRequest(.ghGetPrReviewComments, location: location)
    case .ghListAccounts: return .ghListAccounts(.init(runtime: location))
    case .ghListRepos:
      guard let host = nonempty(accountHost), let login = nonempty(accountLogin) else { return nil }
      return .ghListRepos(.init(runtime: location, account: .init(host: host, login: login)))
    case .ghListWorkflows: return .ghListWorkflows(.init(projectLocation: location))
    case .ghListWorkflowRuns:
      guard
        workflowId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          || positive(workflowId) != nil
      else { return nil }
      return .ghListWorkflowRuns(
        .init(projectLocation: location, workflowId: positive(workflowId))
      )
    case .ghGetWorkflowRun: return runRequest(.ghGetWorkflowRun, location: location)
    case .ghGetWorkflowDefinition:
      guard let id = positive(workflowId) else { return nil }
      return .ghGetWorkflowDefinition(
        .init(projectLocation: location, workflowId: id, ref: nonempty(ref))
      )
    case .ghCreatePr:
      guard let branch = nonempty(branch), let base = nonempty(baseBranch),
        let title = nonempty(title)
      else { return nil }
      return .ghCreatePr(
        .init(
          projectLocation: location,
          branch: branch,
          baseBranch: base,
          title: title,
          body: nonempty(body),
          isDraft: isDraft
        )
      )
    case .ghMergePr:
      guard let number = positive(pullRequestNumber) else { return nil }
      return .ghMergePr(
        .init(projectLocation: location, prNumber: number, method: mergeMethod, admin: admin)
      )
    case .ghClosePr: return prRequest(.ghClosePr, location: location)
    case .ghReopenPr: return prRequest(.ghReopenPr, location: location)
    case .ghMarkPrReady: return prRequest(.ghMarkPrReady, location: location)
    case .ghSubmitPrReview:
      guard let number = positive(pullRequestNumber) else { return nil }
      return .ghSubmitPrReview(
        .init(
          projectLocation: location,
          prNumber: number,
          decision: reviewDecision,
          body: nonempty(body)
        )
      )
    case .ghUpdatePrBranch:
      guard let number = positive(pullRequestNumber) else { return nil }
      return .ghUpdatePrBranch(
        .init(projectLocation: location, prNumber: number, rebase: rebase)
      )
    case .ghPostPrComment:
      guard let number = positive(pullRequestNumber), let body = nonempty(body) else { return nil }
      return .ghPostPrComment(.init(projectLocation: location, prNumber: number, body: body))
    case .ghDispatchWorkflow:
      guard let id = positive(workflowId), let inputs = parsedInputs else { return nil }
      return .ghDispatchWorkflow(
        .init(
          projectLocation: location,
          workflowId: id,
          ref: nonempty(ref),
          inputs: inputs.isEmpty ? nil : inputs
        )
      )
    case .ghRerunWorkflowRun:
      guard let id = positive(workflowRunId) else { return nil }
      return .ghRerunWorkflowRun(
        .init(projectLocation: location, runId: id, failedOnly: failedOnly)
      )
    case .ghCancelWorkflowRun:
      return runRequest(.ghCancelWorkflowRun, location: location)
    case .ghDeleteWorkflowRun:
      return runRequest(.ghDeleteWorkflowRun, location: location)
    }
  }

  private enum PullRequestKind {
    case ghGetPrFiles, ghGetPrDiff, ghGetPrDetails, ghGetPrReviewComments, ghClosePr, ghReopenPr,
      ghMarkPrReady
  }
  private enum RunKind { case ghGetWorkflowRun, ghCancelWorkflowRun, ghDeleteWorkflowRun }

  private func prRequest(
    _ kind: PullRequestKind,
    location: GitHubProjectLocation
  ) -> GitHubOperationRequest? {
    guard let number = positive(pullRequestNumber) else { return nil }
    let value = GitHubPullRequestNumberRequest(projectLocation: location, prNumber: number)
    switch kind {
    case .ghGetPrFiles: return .ghGetPrFiles(value)
    case .ghGetPrDiff: return .ghGetPrDiff(value)
    case .ghGetPrDetails: return .ghGetPrDetails(value)
    case .ghGetPrReviewComments: return .ghGetPrReviewComments(value)
    case .ghClosePr: return .ghClosePr(value)
    case .ghReopenPr: return .ghReopenPr(value)
    case .ghMarkPrReady: return .ghMarkPrReady(value)
    }
  }

  private func runRequest(
    _ kind: RunKind,
    location: GitHubProjectLocation
  ) -> GitHubOperationRequest? {
    guard let id = positive(workflowRunId) else { return nil }
    let value = GitHubWorkflowRunRequest(projectLocation: location, runId: id)
    switch kind {
    case .ghGetWorkflowRun: return .ghGetWorkflowRun(value)
    case .ghCancelWorkflowRun: return .ghCancelWorkflowRun(value)
    case .ghDeleteWorkflowRun: return .ghDeleteWorkflowRun(value)
    }
  }

  private var parsedInputs: [String: String]? {
    var result: [String: String] = [:]
    for line in inputs.split(whereSeparator: \.isNewline) {
      let parts = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      guard parts.count == 2, let key = nonempty(String(parts[0])) else { return nil }
      result[key] = String(parts[1]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return result
  }

  private func positive(_ value: String) -> Int64? {
    guard let number = Int64(value.trimmingCharacters(in: .whitespacesAndNewlines)), number > 0
    else { return nil }
    return number
  }

  private func nonempty(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
