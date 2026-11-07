import SwiftUI

struct PullRequestOverviewView: View {
  let details: PullRequestReviewDetails?
  let route: PullRequestReviewRoute

  var body: some View {
    List {
      Section {
        Text(details?.title ?? route.title)
          .font(.headline)
        if let author = details?.author?.login {
          Label(author, systemImage: "person.crop.circle")
            .foregroundStyle(.secondary)
        }
        LabeledContent(
          GitHubOperationsStrings.branch,
          value: "\(details?.headBranch ?? route.headBranch ?? "") → \(details?.baseBranch ?? "")"
        )
        if let details {
          Text(ProjectReviewStrings.changedFiles(Int(details.changedFiles)))
          HStack {
            Text(PullRequestsStrings.additions(details.additions))
              .foregroundStyle(.green)
            Text(PullRequestsStrings.deletions(details.deletions))
              .foregroundStyle(.red)
          }
          .monospacedDigit()
        }
      }

      if let labels = details?.labels, !labels.isEmpty {
        Section(PullRequestsStrings.labels) {
          PullRequestLabelFlow(labels: labels)
            .padding(.vertical, 2)
        }
      }

      if let body = details?.body, !body.isEmpty {
        Section(PullRequestsStrings.description) {
          Text(body)
            .textSelection(.enabled)
        }
      }

      if let commits = details?.commits, !commits.isEmpty {
        Section(PullRequestsStrings.commits) {
          ForEach(commits) { commit in
            VStack(alignment: .leading, spacing: 3) {
              Text(commit.headline)
              Text(commit.abbreviatedOID)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
  }
}

struct PullRequestFilesView: View {
  let files: [PullRequestReviewFile]
  let diff: String
  var forge: ForgeReviewController? = nil

  var body: some View {
    List {
      if files.isEmpty {
        ContentUnavailableView(
          ProjectWorkspaceStrings.files,
          systemImage: "doc.text.magnifyingglass"
        )
      } else {
        ForEach(files) { file in
          HStack {
          NavigationLink {
            PullRequestDiffView(
              path: file.path,
              diff: PullRequestUnifiedDiff.chunk(for: file.path, in: diff)
            )
          } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
              Text(file.path)
                .font(.body.monospaced())
                .lineLimit(2)
              Spacer(minLength: 8)
              Text(PullRequestsStrings.additions(file.additions))
                .foregroundStyle(.green)
              Text(PullRequestsStrings.deletions(file.deletions))
                .foregroundStyle(.red)
            }
            .font(.caption)
          }
          if let forge, forge.capabilities["viewedFiles"]?.stringValue != nil {
            Button {
              guard let fingerprint = forge.viewedFingerprint(file.path) else { return }
              Task {
                await forge.mutate(.forgeSetPrFileViewed, fields: [
                  "path": .string(file.path),
                  "fingerprint": forge.viewedState(file.path) == "viewed" ? .null : .string(fingerprint),
                ])
              }
            } label: {
              Label(
                PullRequestsStrings.guideText(forge.viewedState(file.path) == "changed" ? "Changed" : forge.capabilities["viewedFiles"]?.stringValue == "forge" ? "Viewed on source host" : "Viewed in Poracode"),
                systemImage: forge.viewedState(file.path) == "viewed" ? "checkmark.circle.fill" : "circle"
              )
              .labelStyle(.iconOnly)
            }
            .buttonStyle(.borderless)
            .disabled(!forge.canMutate || forge.viewedFingerprint(file.path) == nil)
          }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
  }
}

struct PullRequestChecksView: View {
  @Environment(\.openURL) private var openURL
  let checks: [PullRequestReviewCheck]

  var body: some View {
    List {
      if checks.isEmpty {
        ContentUnavailableView(
          PullRequestsStrings.checks,
          systemImage: "checkmark.circle"
        )
      } else {
        ForEach(checks) { check in
          if let url = check.url.flatMap(URL.init(string:)) {
            Button {
              openURL(url)
            } label: {
              checkRow(check, showsExternalIndicator: true)
            }
            .buttonStyle(.plain)
            .accessibilityHint(PullRequestsStrings.openExternally)
          } else {
            checkRow(check, showsExternalIndicator: false)
          }
        }
      }
    }
    .listStyle(.insetGrouped)
  }

  private func checkRow(
    _ check: PullRequestReviewCheck,
    showsExternalIndicator: Bool
  ) -> some View {
    HStack(spacing: 12) {
      Image(systemName: symbol(check))
        .foregroundStyle(color(check))
      VStack(alignment: .leading, spacing: 2) {
        Text(check.name)
        if let workflow = check.workflowName {
          Text(workflow)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      Spacer(minLength: 8)
      Text(verbatim: check.conclusion.isEmpty ? check.state : check.conclusion)
        .font(.caption)
        .foregroundStyle(.secondary)
      if showsExternalIndicator {
        Image(systemName: "arrow.up.right")
          .font(.caption)
          .foregroundStyle(.tertiary)
      }
    }
  }

  private func symbol(_ check: PullRequestReviewCheck) -> String {
    switch check.conclusion.lowercased() {
    case "success": "checkmark.circle.fill"
    case "failure", "cancelled": "xmark.circle.fill"
    default: "clock"
    }
  }

  private func color(_ check: PullRequestReviewCheck) -> Color {
    switch check.conclusion.lowercased() {
    case "success": .green
    case "failure", "cancelled": .red
    default: .orange
    }
  }
}

struct PullRequestConversationView: View {
  let comments: [PullRequestReviewComment]
  let reviews: [PullRequestReviewSummary]
  let threads: [PullRequestReviewThread]
  var forge: ForgeReviewController? = nil
  var requestedReviewers: [GitHubReviewerSummary] = []
  var timeline: [PullRequestTimelineEvent] = []

  var body: some View {
    List {
      if comments.isEmpty && reviews.isEmpty && threads.isEmpty && requestedReviewers.isEmpty
        && timeline.isEmpty
      {
        ContentUnavailableView(
          PullRequestsStrings.conversation,
          systemImage: "bubble.left.and.bubble.right"
        )
      }
      if !comments.isEmpty {
        Section {
          ForEach(comments) { comment in
            conversationRow(author: comment.author.login, body: comment.body)
            editableComment(comment, threadID: nil)
          }
        }
      }
      if !requestedReviewers.isEmpty {
        PullRequestRequestedReviewersSection(reviewers: requestedReviewers)
      }
      if !reviews.isEmpty {
        Section {
          ForEach(reviews) { review in
            conversationRow(
              author: review.author.login,
              body: review.body,
              badge: review.state
            )
          }
        }
      }
      if !threads.isEmpty {
        Section {
          ForEach(threads, id: \.id) { thread in
            VStack(alignment: .leading, spacing: 8) {
              HStack {
                if let path = thread.path {
                  Text(path)
                    .font(.caption.monospaced())
                    .lineLimit(1)
                }
                Spacer()
                Image(
                  systemName: thread.isResolved
                    ? "checkmark.circle.fill"
                    : "exclamationmark.circle"
                )
                .foregroundStyle(thread.isResolved ? Color.secondary : Color.orange)
                .accessibilityHidden(true)
              }
              ForEach(thread.comments) { comment in
                conversationRow(author: comment.author.login, body: comment.body)
                editableComment(comment, threadID: thread.id)
              }
            }
          }
        }
      }
      if !timeline.isEmpty {
        PullRequestTimelineSection(events: timeline)
      }
    }
    .listStyle(.insetGrouped)
  }

  @ViewBuilder
  private func editableComment(_ comment: PullRequestReviewComment, threadID: String?) -> some View {
    if let forge,
      forge.viewerLogin?.caseInsensitiveCompare(comment.author.login) == .orderedSame,
      forge.capabilities["commentEditing"]?.arrayValue?.contains(.string(threadID == nil ? "conversation" : "inline")) == true {
      ForgeCommentEditor(forge: forge, comment: comment, threadID: threadID)
        .id("\(comment.id):\(forge.viewerLogin ?? "")")
    }
  }

  private func conversationRow(
    author: String,
    body: String,
    badge: String? = nil
  ) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(author)
          .font(.subheadline.weight(.semibold))
        if let badge {
          Text(verbatim: badge)
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }
      if !body.isEmpty {
        Text(body)
          .textSelection(.enabled)
      }
    }
    .padding(.vertical, 2)
  }
}

private struct ForgeCommentEditor: View {
  let forge: ForgeReviewController
  let comment: PullRequestReviewComment
  let threadID: String?
  @State private var editing = false
  @State private var draft = ""
  @State private var expectedBody = ""

  var body: some View {
    if editing {
      TextField(GitHubOperationsStrings.body, text: $draft, axis: .vertical).lineLimit(3...10)
      HStack {
        Button(RemoteIntegrationsStrings.save) {
          Task {
            var fields: [String: GitHubJSONValue] = [
              "commentId": .string(comment.id), "body": .string(draft), "expectedBody": .string(expectedBody),
            ]
            if let threadID { fields["threadId"] = .string(threadID) }
            if await forge.mutate(.forgeEditPrComment, fields: fields) { editing = false }
          }
        }
        .disabled(!forge.canMutate || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        Button(GitHubOperationsStrings.cancel) { editing = false }.disabled(forge.mutating)
      }
      .buttonStyle(.borderless)
    } else {
      Button(PullRequestsStrings.guideText("Edit comment")) { draft = comment.body; expectedBody = comment.body; editing = true }
        .buttonStyle(.borderless)
        .disabled(!forge.canMutate)
    }
  }
}
