import SwiftUI

enum PullRequestReviewSection: String, CaseIterable, Identifiable {
  case overview
  case files
  case checks
  case conversation
  case guide

  var id: Self { self }
}

struct PullRequestReviewPageView: View {
  @Environment(\.openURL) private var openURL

  let context: GitHubControllerContext?
  let route: PullRequestReviewRoute
  @Bindable var controller: GitHubPullRequestController
  @Bindable var mutations: GitHubPullRequestMutationController
  @Bindable var forge: ForgeReviewController
  let guideWriters: [AgentStatusRecord]

  @State private var section = PullRequestReviewSection.overview
  @State private var sheet: PullRequestReviewSheet?
  @State private var metadataSheet: PullRequestMetadataSheet?
  @State private var presentedState: String
  @State private var presentedAsDraft: Bool
  @State private var pendingForgeRequest: GitHubOperationRequest?

  init(
    context: GitHubControllerContext?,
    route: PullRequestReviewRoute,
    controller: GitHubPullRequestController,
    mutations: GitHubPullRequestMutationController,
    forge: ForgeReviewController,
    guideWriters: [AgentStatusRecord]
  ) {
    self.context = context
    self.route = route
    self.controller = controller
    self.mutations = mutations
    self.forge = forge
    self.guideWriters = guideWriters
    _presentedState = State(initialValue: route.state)
    _presentedAsDraft = State(initialValue: route.isDraft)
  }

  private var details: PullRequestReviewDetails? {
    PullRequestReviewProjection.details(isScoped ? forgeDocuments[.forgeGetPrDetails] : controller.documents[.ghGetPrDetails])
  }

  private var files: [PullRequestReviewFile] {
    PullRequestReviewProjection.files(isScoped ? forgeDocuments[.forgeGetPrFiles] : controller.documents[.ghGetPrFiles])
  }

  private var diff: String {
    PullRequestReviewProjection.diff(isScoped ? forgeDocuments[.forgeGetPrDiff] : controller.documents[.ghGetPrDiff])
  }

  private var conversation: PullRequestReviewConversation {
    PullRequestReviewProjection.conversation(isScoped ? forgeDocuments[.forgeGetPrReviewComments] : controller.documents[.ghGetPrReviewComments])
  }

  private var isScoped: Bool { route.forgeSourceData != nil }
  private var forgeDocuments: [ForgeReviewOperation: GitHubDocument] {
    forge.isSelected(number: route.number) ? forge.documents : [:]
  }
  private var isLoading: Bool { isScoped ? forge.loading : controller.loadState.isLoading }
  private var failure: GitHubOperationsFailure? { isScoped ? forge.failure : controller.failure }
  private var sections: [PullRequestReviewSection] {
    PullRequestReviewSection.allCases.filter { $0 != .guide || (isScoped && forge.capabilities["reviewGuides"]?.boolValue == true) }
  }

  var body: some View {
    content
      .navigationTitle(details?.title ?? route.title)
      .navigationBarTitleDisplayMode(.inline)
      .safeAreaInset(edge: .top, spacing: 0) {
        ScrollView(.horizontal, showsIndicators: false) {
        Picker(PullRequestsStrings.title, selection: $section) {
          ForEach(sections) { value in
            Text(PullRequestsStrings.reviewSection(value)).tag(value)
          }
        }
        .pickerStyle(.segmented)
        .fixedSize(horizontal: true, vertical: false)
        .padding(.horizontal)
        .padding(.vertical, 8)
        }
        .background(.bar)
      }
      .toolbar { toolbarContent }
      .task(id: loadIdentity) { await load() }
      .sheet(item: $metadataSheet) { sheet in
        switch sheet {
        case .labels:
          PullRequestLabelsSheet(forge: forge, current: details?.labels ?? [])
        case .reviewers:
          PullRequestReviewersSheet(forge: forge, requested: details?.requestedReviewers ?? [])
        }
      }
      .sheet(item: $sheet) { sheet in
        PullRequestReviewActionSheet(
          sheet: sheet,
          location: context?.lease.location,
          pullRequestNumber: route.number,
          capabilities: isScoped ? forge.capabilities : nil,
          submit: submit
        )
      }
      .confirmationDialog(
        pendingConfirmationTitle,
        isPresented: Binding(
          get: { pendingForgeRequest != nil || mutations.state.pendingConfirmation != nil },
          set: { if !$0 { pendingForgeRequest = nil; mutations.cancelPendingMutation() } }
        ),
        titleVisibility: .visible
      ) {
        Button(GitHubOperationsStrings.confirm, role: .destructive) {
          Task {
            if let request = pendingForgeRequest {
              pendingForgeRequest = nil
              await submitScoped(request)
              return
            }
            let request = mutations.state.pendingConfirmation?.request
            await mutations.confirmPendingMutation()
            if mutations.state.failure == nil, let request {
              applyMutationPresentation(request)
            }
            await load()
          }
        }
        Button(GitHubOperationsStrings.cancel, role: .cancel) {
          mutations.cancelPendingMutation()
          pendingForgeRequest = nil
        }
      }
      .overlay(alignment: .bottom) {
        if isScoped && forge.isCached {
          Text(PullRequestsStrings.guideText("Offline"))
            .font(.footnote).padding().background(.regularMaterial, in: Capsule()).padding()
        } else
        if let failure = isScoped ? forge.failure : mutations.state.failure {
          Text(GitHubOperationsStrings.failure(failure))
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding()
            .background(.regularMaterial, in: Capsule())
            .padding()
        }
      }
  }

  @ViewBuilder
  private var content: some View {
    if context == nil {
      ContentUnavailableView(
        PullRequestsStrings.unavailable,
        systemImage: "network.slash"
      )
    } else if details == nil, isLoading {
      LoadingStateView(message: PullRequestsStrings.loading)
    } else if details == nil, let failure {
      ErrorStateView(
        message: GitHubOperationsStrings.failure(failure),
        retryTitle: PullRequestsStrings.refresh
      ) {
        Task { await load() }
      }
    } else {
      switch section {
      case .overview:
        PullRequestOverviewView(details: details, route: route)
      case .files:
        PullRequestFilesView(files: files, diff: diff, forge: isScoped ? forge : nil)
      case .checks:
        PullRequestChecksView(checks: details?.checks ?? [])
      case .conversation:
        PullRequestConversationView(
          comments: mergedComments,
          reviews: details?.reviews ?? [],
          threads: conversation.threads,
          forge: isScoped ? forge : nil,
          requestedReviewers: details?.requestedReviewers ?? [],
          timeline: details?.timeline ?? []
        )
      case .guide:
        PullRequestGuideView(forge: forge, writers: guideWriters) { sheet = .review }
      }
    }
  }

  @ToolbarContentBuilder
  private var toolbarContent: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Menu {
        Button(PullRequestsStrings.refresh, systemImage: "arrow.clockwise") {
          Task { await load() }
        }
        .disabled(context?.isUsable != true || isLoading)

        Divider()

        Group {
        Button {
          sheet = .review
        } label: {
          Label(
            GitHubOperationsStrings.action(.ghSubmitPrReview),
            systemImage: "checkmark.bubble"
          )
        }
        .disabled(isScoped && (forge.capabilities["reviewDecisions"]?.arrayValue?.isEmpty != false))
        Button {
          sheet = .comment
        } label: {
          Label(
            GitHubOperationsStrings.action(.ghPostPrComment),
            systemImage: "bubble.left"
          )
        }
        Button {
          submitDirect(
            .ghUpdatePrBranch(
              .init(
                projectLocation: context?.lease.location ?? route.location,
                prNumber: route.number,
                rebase: isScoped && forge.capabilities["updateBranch"]?.boolValue != true
              )
            )
          )
        } label: {
          Label(
            GitHubOperationsStrings.action(.ghUpdatePrBranch),
            systemImage: "arrow.triangle.2.circlepath"
          )
        }
        .disabled(isScoped && forge.capabilities["updateBranch"]?.boolValue != true && forge.capabilities["rebaseBranch"]?.boolValue != true)

        if presentedAsDraft {
          Button {
            submitDirect(prRequest(.ghMarkPrReady))
          } label: {
            Label(
              GitHubOperationsStrings.action(.ghMarkPrReady),
              systemImage: "checkmark.seal"
            )
          }
        }

        if isScoped, presentedState == "open", !presentedAsDraft, forge.offers("convertToDraft") {
          Button {
            Task {
              if await forge.convertToDraft() {
                presentedAsDraft = true
                presentedState = "draft"
              }
            }
          } label: {
            Label(PullRequestsStrings.convertToDraft, systemImage: "pencil.circle")
          }
        }

        if isScoped, presentedState == "open" || presentedState == "draft" {
          if forge.offers("labels") {
            Button {
              metadataSheet = .labels
            } label: {
              Label(PullRequestsStrings.editLabels, systemImage: "tag")
            }
          }
          if forge.offers("reviewRequests") {
            Button {
              metadataSheet = .reviewers
            } label: {
              Label(PullRequestsStrings.requestReview, systemImage: "person.crop.circle.badge.plus")
            }
          }
        }

        if presentedState == "open" || presentedState == "draft" {
          Button {
            sheet = .merge
          } label: {
            Label(
              GitHubOperationsStrings.action(.ghMergePr),
              systemImage: "arrow.triangle.merge"
            )
          }
          .disabled(isScoped && (forge.capabilities["mergeMethods"]?.arrayValue?.isEmpty != false))
          Button(role: .destructive) {
            submitDirect(prRequest(.ghClosePr))
          } label: {
            Label(
              GitHubOperationsStrings.action(.ghClosePr),
              systemImage: "xmark.circle"
            )
          }
        } else if presentedState == "closed" {
          Button {
            submitDirect(prRequest(.ghReopenPr))
          } label: {
            Label(
              GitHubOperationsStrings.action(.ghReopenPr),
              systemImage: "arrow.uturn.backward.circle"
            )
          }
          .disabled(isScoped && forge.capabilities["reopen"]?.boolValue != true)
        }
        }
        .disabled(isScoped ? !forge.canMutate : context?.permits(.operate) != true || mutations.state.activeMutation != nil)

        if let url = route.url.flatMap(URL.init(string:)) {
          Divider()
          Button {
            openURL(url)
          } label: {
            Label(PullRequestsStrings.openExternally, systemImage: "safari")
          }
        }
      } label: {
        Label(PullRequestsStrings.actions, systemImage: "ellipsis.circle")
      }
      .disabled(context == nil)
    }
  }

  private var mergedComments: [PullRequestReviewComment] {
    var seen = Set<String>()
    let inlineIDs = Set(conversation.threads.flatMap { $0.comments.map(\.id) })
    return ((details?.comments ?? []) + conversation.comments).filter {
      !inlineIDs.contains($0.id) && seen.insert($0.id).inserted
    }
  }

  private var loadIdentity: PullRequestReviewLoadIdentity {
    PullRequestReviewLoadIdentity(
      activation: GitHubOperationsActivationID(context),
      number: route.number,
      sourceData: route.forgeSourceData
    )
  }

  private var pendingConfirmationTitle: String {
    pendingForgeRequest.map { GitHubOperationsStrings.confirmation(for: $0) } ?? mutations.state.pendingConfirmation.map {
      GitHubOperationsStrings.confirmation(for: $0.request)
    } ?? GitHubOperationsStrings.confirm
  }

  private func load() async {
    guard let context else { return }
    pendingForgeRequest = nil
    if let sourceData = route.forgeSourceData {
      await forge.select(context: context, sourceData: sourceData, number: route.number)
      return
    }
    controller.activate(context)
    mutations.activate(context)
    let value = GitHubPullRequestNumberRequest(
      projectLocation: context.lease.location,
      prNumber: route.number
    )
    await controller.load(.ghGetPrDetails(value))
    guard !Task.isCancelled, controller.documents[.ghGetPrDetails] != nil else { return }
    for request in [
      GitHubOperationRequest.ghGetPrFiles(value),
      .ghGetPrDiff(value),
      .ghGetPrReviewComments(value),
    ] {
      guard !Task.isCancelled else { return }
      await controller.load(request)
    }
  }

  @discardableResult
  private func submit(_ request: GitHubOperationRequest) async -> Bool {
    if isScoped {
      if request.procedure.requiresConfirmation { pendingForgeRequest = request; return true }
      return await submitScoped(request)
    }
    await mutations.submit(request)
    if mutations.state.pendingConfirmation == nil, mutations.state.failure == nil {
      applyMutationPresentation(request)
      await load()
    }
    return mutations.state.failure == nil
  }

  @discardableResult
  private func submitScoped(_ request: GitHubOperationRequest) async -> Bool {
    guard let envelope = try? JSONDecoder().decode(GitHubJSONValue.self, from: GitHubOperationsRemoteV3Contract.request(request)),
      var fields = envelope.objectValue?["payload"]?.objectValue,
      var operation = ForgeReviewOperation(rawValue: "forge" + request.procedure.rawValue.dropFirst(2))
    else { return false }
    if operation == .forgeMergePr, forge.capabilities["expectedHeadMerge"]?.boolValue == true {
      guard let sha = forge.documents[.forgeGetPrDetails]?["pr"]?.objectValue?["headSha"]?.stringValue else { return false }
      operation = .forgeMergePrAtHead
      fields["expectedHeadSha"] = .string(sha)
    }
    let accepted = await forge.mutate(operation, fields: fields)
    if accepted { applyMutationPresentation(request) }
    return accepted
  }

  private func submitDirect(_ request: GitHubOperationRequest) {
    Task { await submit(request) }
  }

  private func prRequest(_ procedure: GitHubProcedure) -> GitHubOperationRequest {
    let value = GitHubPullRequestNumberRequest(
      projectLocation: context?.lease.location ?? route.location,
      prNumber: route.number
    )
    switch procedure {
    case .ghClosePr: return .ghClosePr(value)
    case .ghReopenPr: return .ghReopenPr(value)
    case .ghMarkPrReady: return .ghMarkPrReady(value)
    default: preconditionFailure("Unsupported direct pull request action")
    }
  }

  private func applyMutationPresentation(_ request: GitHubOperationRequest) {
    switch request {
    case .ghClosePr:
      presentedState = "closed"
    case .ghReopenPr:
      presentedState = "open"
    case .ghMarkPrReady:
      presentedAsDraft = false
      presentedState = "open"
    case .ghMergePr:
      presentedState = "merged"
    default:
      break
    }
  }
}

private struct PullRequestReviewLoadIdentity: Hashable {
  let activation: GitHubOperationsActivationID
  let number: Int64
  let sourceData: Data?
}

extension GitHubLoadState {
  fileprivate var isLoading: Bool {
    if case .loading = self { return true }
    return false
  }
}
