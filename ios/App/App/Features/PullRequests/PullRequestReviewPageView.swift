import SwiftUI

enum PullRequestReviewSection: String, CaseIterable, Identifiable {
  case overview
  case files
  case checks
  case conversation

  var id: Self { self }
}

struct PullRequestReviewPageView: View {
  @Environment(\.openURL) private var openURL

  let context: GitHubControllerContext?
  let route: PullRequestReviewRoute
  @Bindable var controller: GitHubPullRequestController
  @Bindable var mutations: GitHubPullRequestMutationController

  @State private var section = PullRequestReviewSection.overview
  @State private var sheet: PullRequestReviewSheet?
  @State private var presentedState: String
  @State private var presentedAsDraft: Bool

  init(
    context: GitHubControllerContext?,
    route: PullRequestReviewRoute,
    controller: GitHubPullRequestController,
    mutations: GitHubPullRequestMutationController
  ) {
    self.context = context
    self.route = route
    self.controller = controller
    self.mutations = mutations
    _presentedState = State(initialValue: route.state)
    _presentedAsDraft = State(initialValue: route.isDraft)
  }

  private var details: PullRequestReviewDetails? {
    PullRequestReviewProjection.details(controller.documents[.ghGetPrDetails])
  }

  private var files: [PullRequestReviewFile] {
    PullRequestReviewProjection.files(controller.documents[.ghGetPrFiles])
  }

  private var diff: String {
    PullRequestReviewProjection.diff(controller.documents[.ghGetPrDiff])
  }

  private var conversation: PullRequestReviewConversation {
    PullRequestReviewProjection.conversation(controller.documents[.ghGetPrReviewComments])
  }

  var body: some View {
    content
      .navigationTitle(details?.title ?? route.title)
      .navigationBarTitleDisplayMode(.inline)
      .safeAreaInset(edge: .top, spacing: 0) {
        Picker(PullRequestsStrings.title, selection: $section) {
          ForEach(PullRequestReviewSection.allCases) { value in
            Text(PullRequestsStrings.reviewSection(value)).tag(value)
          }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
      }
      .toolbar { toolbarContent }
      .task(id: loadIdentity) { await load() }
      .sheet(item: $sheet) { sheet in
        PullRequestReviewActionSheet(
          sheet: sheet,
          location: context?.lease.location,
          pullRequestNumber: route.number,
          submit: submit
        )
      }
      .confirmationDialog(
        pendingConfirmationTitle,
        isPresented: Binding(
          get: { mutations.state.pendingConfirmation != nil },
          set: { if !$0 { mutations.cancelPendingMutation() } }
        ),
        titleVisibility: .visible
      ) {
        Button(GitHubOperationsStrings.confirm, role: .destructive) {
          Task {
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
        }
      }
      .overlay(alignment: .bottom) {
        if let failure = mutations.state.failure {
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
    } else if details == nil, controller.loadState.isLoading {
      LoadingStateView(message: PullRequestsStrings.loading)
    } else if details == nil, let failure = controller.failure {
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
        PullRequestFilesView(files: files, diff: diff)
      case .checks:
        PullRequestChecksView(checks: details?.checks ?? [])
      case .conversation:
        PullRequestConversationView(
          comments: mergedComments,
          reviews: details?.reviews ?? [],
          threads: conversation.threads
        )
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
        .disabled(controller.loadState.isLoading)

        Divider()

        Button {
          sheet = .review
        } label: {
          Label(
            GitHubOperationsStrings.action(.ghSubmitPrReview),
            systemImage: "checkmark.bubble"
          )
        }
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
                rebase: false
              )
            )
          )
        } label: {
          Label(
            GitHubOperationsStrings.action(.ghUpdatePrBranch),
            systemImage: "arrow.triangle.2.circlepath"
          )
        }

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

        if presentedState == "open" || presentedState == "draft" {
          Button {
            sheet = .merge
          } label: {
            Label(
              GitHubOperationsStrings.action(.ghMergePr),
              systemImage: "arrow.triangle.merge"
            )
          }
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
        }

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
      .disabled(context == nil || mutations.state.activeMutation != nil)
    }
  }

  private var mergedComments: [PullRequestReviewComment] {
    var seen = Set<String>()
    return ((details?.comments ?? []) + conversation.comments).filter {
      seen.insert($0.id).inserted
    }
  }

  private var loadIdentity: PullRequestReviewLoadIdentity {
    PullRequestReviewLoadIdentity(
      activation: GitHubOperationsActivationID(context),
      number: route.number
    )
  }

  private var pendingConfirmationTitle: String {
    mutations.state.pendingConfirmation.map {
      GitHubOperationsStrings.confirmation(for: $0.request)
    } ?? GitHubOperationsStrings.confirm
  }

  private func load() async {
    guard let context else { return }
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

  private func submit(_ request: GitHubOperationRequest) async {
    await mutations.submit(request)
    if mutations.state.pendingConfirmation == nil, mutations.state.failure == nil {
      applyMutationPresentation(request)
      await load()
    }
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
}

extension GitHubLoadState {
  fileprivate var isLoading: Bool {
    if case .loading = self { return true }
    return false
  }
}
