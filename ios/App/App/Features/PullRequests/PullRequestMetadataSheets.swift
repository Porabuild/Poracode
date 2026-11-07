import SwiftUI

enum PullRequestMetadataSheet: String, Identifiable {
  case labels
  case reviewers

  var id: Self { self }
}

/// Multi-select of the host's label candidates. Applying sends only the add/remove difference
/// from the labels the review had when the sheet opened.
struct PullRequestLabelsSheet: View {
  @Environment(\.dismiss) private var dismiss

  let forge: ForgeReviewController
  let current: [GitHubReviewLabel]

  @State private var candidates: [GitHubReviewLabel] = []
  @State private var truncated = false
  @State private var didLoad = false
  @State private var selected: Set<String>
  @State private var isApplying = false

  init(forge: ForgeReviewController, current: [GitHubReviewLabel]) {
    self.forge = forge
    self.current = current
    _selected = State(initialValue: Set(current.map(\.name)))
  }

  /// Labels already on the review stay listed even when a truncated candidate list omits them.
  private var rows: [GitHubReviewLabel] {
    let names = Set(current.map(\.name))
    return current + candidates.filter { !names.contains($0.name) }
  }

  private var canApply: Bool {
    let change = PullRequestLabelEdit.delta(current: current.map(\.name), selected: selected)
    return forge.canMutate && !isApplying && (!change.add.isEmpty || !change.remove.isEmpty)
      && change.add.count <= PullRequestLabelEdit.maximumChanges
      && change.remove.count <= PullRequestLabelEdit.maximumChanges
  }

  var body: some View {
    NavigationStack {
      List {
        if let failure = forge.failure {
          Section {
            Text(GitHubOperationsStrings.failure(failure))
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        Section {
          if !didLoad {
            ProgressView()
              .frame(maxWidth: .infinity)
              .poracodeDrawerRowSurface()
          } else if rows.isEmpty {
            Text(PullRequestsStrings.noLabels)
              .foregroundStyle(.secondary)
              .poracodeDrawerRowSurface()
          } else {
            ForEach(rows) { label in
              row(label)
            }
          }
        } footer: {
          if truncated { Text(PullRequestsStrings.labelsTruncated) }
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(PullRequestsStrings.editLabels)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitHubOperationsStrings.cancel) { dismiss() }
        }
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        PoracodeBottomActionDock(placement: .trailing) {
          PoracodeCircleButton {
            Task { await apply() }
          } label: {
            if isApplying {
              ProgressView()
            } else {
              Label(PullRequestsStrings.apply, systemImage: "checkmark")
                .labelStyle(.iconOnly)
            }
          }
          .disabled(!canApply)
          .accessibilityLabel(PullRequestsStrings.apply)
          .accessibilityIdentifier("native-e2e.pull-requests.labels.apply")
        }
      }
      .task { await load() }
    }
    .tint(.secondary)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }

  private func row(_ label: GitHubReviewLabel) -> some View {
    let isSelected = selected.contains(label.name)
    return Button {
      if isSelected {
        selected.remove(label.name)
      } else {
        selected.insert(label.name)
      }
    } label: {
      HStack(spacing: 10) {
        VStack(alignment: .leading, spacing: 4) {
          PullRequestLabelChip(label: label)
          if let detail = label.detail, !detail.isEmpty {
            Text(verbatim: detail)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(2)
          }
        }
        Spacer(minLength: 8)
        if isSelected {
          Image(systemName: "checkmark")
            .foregroundStyle(Color.accentColor)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .poracodeDrawerRowSurface()
  }

  private func load() async {
    let result = await forge.candidates(.forgeListPrLabelCandidates)
    guard !Task.isCancelled else { return }
    didLoad = true
    guard let result else { return }
    candidates = GitHubResultProjection.labels(result["labels"])
    truncated = result["truncated"]?.boolValue == true
  }

  private func apply() async {
    let change = PullRequestLabelEdit.delta(current: current.map(\.name), selected: selected)
    isApplying = true
    let accepted = await forge.setLabels(add: change.add, remove: change.remove)
    isApplying = false
    if accepted { dismiss() }
  }
}

/// Reviewer search plus the review's outstanding requests. Adds and removals are staged and
/// sent together when applied.
struct PullRequestReviewersSheet: View {
  @Environment(\.dismiss) private var dismiss

  let forge: ForgeReviewController
  let requested: [GitHubReviewerSummary]

  @State private var query = ""
  @State private var results: [GitHubReviewerSummary] = []
  @State private var truncated = false
  @State private var didLoad = false
  @State private var edit = PullRequestReviewerEdit()
  @State private var isApplying = false

  /// Staged additions stay listed while the search text changes underneath them.
  private var suggestions: [GitHubReviewerSummary] {
    let known = Set(requested.map(\.id)).union(edit.added.map(\.id))
    return edit.added + results.filter { !known.contains($0.id) }
  }

  private var canApply: Bool {
    forge.canMutate && !isApplying && !edit.isEmpty && edit.isWithinLimits
  }

  var body: some View {
    NavigationStack {
      List {
        if let failure = forge.failure {
          Section {
            Text(GitHubOperationsStrings.failure(failure))
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        if !requested.isEmpty {
          Section(PullRequestsStrings.requestedReviewers) {
            ForEach(requested) { reviewer in
              requestedRow(reviewer)
            }
          }
        }
        Section {
          if !didLoad {
            ProgressView()
              .frame(maxWidth: .infinity)
              .poracodeDrawerRowSurface()
          } else if suggestions.isEmpty {
            Text(PullRequestsStrings.noReviewers)
              .foregroundStyle(.secondary)
              .poracodeDrawerRowSurface()
          } else {
            ForEach(suggestions) { reviewer in
              suggestionRow(reviewer)
            }
          }
        } header: {
          Text(PullRequestsStrings.suggestedReviewers)
        } footer: {
          if truncated { Text(PullRequestsStrings.reviewersTruncated) }
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(PullRequestsStrings.requestReview)
      .navigationBarTitleDisplayMode(.inline)
      .searchable(text: $query, prompt: PullRequestsStrings.searchReviewers)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitHubOperationsStrings.cancel) { dismiss() }
        }
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        PoracodeBottomActionDock(placement: .trailing) {
          PoracodeCircleButton {
            Task { await apply() }
          } label: {
            if isApplying {
              ProgressView()
            } else {
              Label(PullRequestsStrings.apply, systemImage: "checkmark")
                .labelStyle(.iconOnly)
            }
          }
          .disabled(!canApply)
          .accessibilityLabel(PullRequestsStrings.apply)
          .accessibilityIdentifier("native-e2e.pull-requests.reviewers.apply")
        }
      }
      .task(id: query) { await search() }
    }
    .tint(.secondary)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }

  private func requestedRow(_ reviewer: GitHubReviewerSummary) -> some View {
    let isRemoving = edit.isRemoved(reviewer)
    return Button {
      edit.toggleRemoved(reviewer)
    } label: {
      HStack(spacing: 10) {
        PullRequestReviewerRow(reviewer: reviewer)
          .opacity(isRemoving ? 0.5 : 1)
        Spacer(minLength: 8)
        Image(systemName: isRemoving ? "arrow.uturn.backward.circle" : "minus.circle")
          .foregroundStyle(.secondary)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      isRemoving
        ? PullRequestsStrings.keepReviewer(reviewer.displayName)
        : PullRequestsStrings.removeReviewer(reviewer.displayName)
    )
    .poracodeDrawerRowSurface()
  }

  private func suggestionRow(_ reviewer: GitHubReviewerSummary) -> some View {
    let isAdding = edit.isAdded(reviewer)
    return Button {
      edit.toggleAdded(reviewer)
    } label: {
      HStack(spacing: 10) {
        PullRequestReviewerRow(reviewer: reviewer)
        Spacer(minLength: 8)
        if isAdding {
          Image(systemName: "checkmark.circle.fill")
            .foregroundStyle(Color.accentColor)
        } else {
          Image(systemName: "plus.circle")
            .foregroundStyle(.secondary)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      isAdding
        ? PullRequestsStrings.removeReviewer(reviewer.displayName)
        : PullRequestsStrings.addReviewer(reviewer.displayName)
    )
    .poracodeDrawerRowSurface()
  }

  /// The first lookup runs at once; later ones wait briefly so typing sends one search.
  private func search() async {
    if didLoad {
      try? await Task.sleep(for: .milliseconds(300))
      guard !Task.isCancelled else { return }
    }
    var fields: [String: GitHubJSONValue] = [:]
    let text = PullRequestReviewerEdit.boundedQuery(query)
    if !text.isEmpty { fields["query"] = .string(text) }
    let result = await forge.candidates(.forgeListPrReviewerCandidates, fields: fields)
    guard !Task.isCancelled else { return }
    didLoad = true
    guard let result else { return }
    results = GitHubResultProjection.reviewers(result["reviewers"])
    truncated = result["truncated"]?.boolValue == true
  }

  private func apply() async {
    isApplying = true
    let accepted = await forge.requestReviewers(add: edit.added, remove: edit.removed)
    isApplying = false
    if accepted { dismiss() }
  }
}
