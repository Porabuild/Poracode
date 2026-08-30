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

  var body: some View {
    List {
      if files.isEmpty {
        ContentUnavailableView(
          ProjectWorkspaceStrings.files,
          systemImage: "doc.text.magnifyingglass"
        )
      } else {
        ForEach(files) { file in
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

  var body: some View {
    List {
      if comments.isEmpty && reviews.isEmpty && threads.isEmpty {
        ContentUnavailableView(
          PullRequestsStrings.conversation,
          systemImage: "bubble.left.and.bubble.right"
        )
      }
      if !comments.isEmpty {
        Section {
          ForEach(comments) { comment in
            conversationRow(author: comment.author.login, body: comment.body)
          }
        }
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
              }
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
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
