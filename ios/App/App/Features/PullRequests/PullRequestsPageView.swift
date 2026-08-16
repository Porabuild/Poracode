import SwiftUI
import UIKit

/// Top-level Pull requests destination from the More sheet, mirroring the
/// mobile web page: a category filter, grouped PR rows with author, repository,
/// branch, diff size, and relative update time, per-project load failures, and
/// pull-to-refresh. Rows open the pull request in Safari.
struct PullRequestsPageView: View {
  @Bindable var session: AppSession
  @State private var controller: PullRequestsController
  @State private var category: PullRequestsCategory = .all

  init(session: AppSession) {
    self.session = session
    _controller = State(initialValue: PullRequestsController(session: session))
  }

  private var filtered: [PullRequestsEntry] {
    PullRequestsPresentation.sorted(
      PullRequestsPresentation.deduplicated(
        controller.entries.filter { PullRequestsPresentation.matches($0, category: category) }
      )
    )
  }

  var body: some View {
    List {
      if controller.isLoading && !controller.didLoad {
        HStack(spacing: 10) {
          ProgressView()
          Text(PullRequestsStrings.loading)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
      } else if !controller.hasProjects {
        ContentUnavailableView(
          PullRequestsStrings.empty,
          systemImage: "arrow.triangle.pull",
          description: Text(PullRequestsStrings.emptyNoProjects)
        )
      } else {
        if category == .all {
          groupedRows
        } else {
          Section {
            if filtered.isEmpty {
              emptyRow(PullRequestsStrings.emptyFiltered)
            } else {
              ForEach(filtered) { entry in
                row(entry)
              }
            }
          }
        }

        if !controller.failures.isEmpty {
          Section {
            ForEach(controller.failures) { failure in
              Label(
                PullRequestsStrings.projectFailure(failure.projectName),
                systemImage: "exclamationmark.triangle"
              )
              .font(.footnote)
              .foregroundStyle(.secondary)
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(PullRequestsStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          Task { await controller.load() }
        } label: {
          if controller.isLoading {
            ProgressView().accessibilityLabel(PullRequestsStrings.refresh)
          } else {
            Label(PullRequestsStrings.refresh, systemImage: "arrow.clockwise")
          }
        }
        .disabled(controller.isLoading)
      }
    }
    .safeAreaInset(edge: .top, spacing: 0) {
      Picker(PullRequestsStrings.title, selection: $category) {
        ForEach(PullRequestsCategory.allCases) { value in
          Text(value.title).tag(value)
        }
      }
      .pickerStyle(.segmented)
      .padding(.horizontal)
      .padding(.vertical, 8)
      .background(.bar)
    }
    .task(id: session.currentProjectControllerLease) {
      await controller.load()
    }
    .refreshable { await controller.load() }
  }

  @ViewBuilder
  private var groupedRows: some View {
    if filtered.isEmpty {
      Section {
        emptyRow(controller.entries.isEmpty ? PullRequestsStrings.empty : PullRequestsStrings.emptyFiltered)
      }
    } else {
      ForEach(PullRequestsGroup.allCases) { group in
        let groupEntries = filtered.filter { PullRequestsPresentation.group(for: $0) == group }
        if !groupEntries.isEmpty {
          Section(group.title) {
            ForEach(groupEntries) { entry in
              row(entry)
            }
          }
        }
      }
    }
  }

  private func emptyRow(_ message: String) -> some View {
    Text(message)
      .font(.footnote)
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 24)
  }

  private func row(_ entry: PullRequestsEntry) -> some View {
    Button {
      open(entry)
    } label: {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: "arrow.triangle.pull")
          .foregroundStyle(statusColor(entry))
          .padding(.top, 2)
        VStack(alignment: .leading, spacing: 4) {
          Text(entry.summary.title)
            .font(.body.weight(.medium))
            .foregroundStyle(.primary)
            .multilineTextAlignment(.leading)
            .lineLimit(2)
          HStack(spacing: 6) {
            Text(metaLine(entry))
            if let branches = branchesLine(entry) {
              Text(branches)
                .monospaced()
            }
          }
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        }
        Spacer(minLength: 8)
        VStack(alignment: .trailing, spacing: 4) {
          if let time = entry.updatedAt.map(PullRequestsDate.format) {
            Text(time)
              .font(.caption2.monospacedDigit())
              .foregroundStyle(.secondary)
          }
          if let changes = changesLine(entry) {
            Text(changes.additions)
              .font(.caption2.monospacedDigit())
              .foregroundStyle(.green)
            + Text(" ")
              .font(.caption2)
            + Text(changes.deletions)
              .font(.caption2.monospacedDigit())
              .foregroundStyle(.red)
          }
        }
      }
      .padding(.vertical, 2)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .contextMenu {
      Button(PullRequestsStrings.openExternally, systemImage: "safari") {
        open(entry)
      }
    }
    .accessibilityLabel(accessibilityLabel(entry))
  }

  private func open(_ entry: PullRequestsEntry) {
    guard let urlString = entry.summary.url, let url = URL(string: urlString) else { return }
    Task { await UIApplication.shared.open(url) }
  }

  private func metaLine(_ entry: PullRequestsEntry) -> String {
    [entry.summary.authorLogin, entry.repository]
      .compactMap(\.self)
      .joined(separator: " · ")
  }

  private func branchesLine(_ entry: PullRequestsEntry) -> String? {
    guard let head = entry.summary.headBranch,
      let base = entry.summary.baseBranch, !head.isEmpty, !base.isEmpty
    else { return nil }
    return "\(head) → \(base)"
  }

  private func changesLine(_ entry: PullRequestsEntry) -> (additions: String, deletions: String)? {
    guard let additions = entry.summary.additions, let deletions = entry.summary.deletions
    else { return nil }
    return (PullRequestsStrings.additions(additions), PullRequestsStrings.deletions(deletions))
  }

  private func statusColor(_ entry: PullRequestsEntry) -> Color {
    switch entry.summary.state {
    case "merged": .indigo
    case "closed": .secondary
    case "draft": .orange
    default: .green
    }
  }

  private func accessibilityLabel(_ entry: PullRequestsEntry) -> String {
    switch entry.summary.state {
    case "merged": PullRequestsStrings.merged(entry.summary.title)
    case "closed": PullRequestsStrings.closed(entry.summary.title)
    case "draft": PullRequestsStrings.draft(entry.summary.title)
    default: PullRequestsStrings.open(entry.summary.title)
    }
  }
}

private enum PullRequestsDate {
  static func format(_ value: Date) -> String {
    let seconds = max(60, abs(value.timeIntervalSinceNow))
    let formatter = DateComponentsFormatter()
    formatter.allowedUnits =
      seconds < 3_600
      ? [.minute]
      : seconds < 86_400
        ? [.hour]
        : seconds < 31_536_000
          ? [.day]
          : [.year]
    formatter.maximumUnitCount = 1
    formatter.unitsStyle = .abbreviated
    return formatter.string(from: seconds) ?? ""
  }
}
