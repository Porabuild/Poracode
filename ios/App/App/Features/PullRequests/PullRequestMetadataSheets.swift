import SwiftUI

enum PullRequestMetadataSheet: Identifiable {
  case labels(PullRequestLabelsDraft)
  case reviewers(PullRequestReviewersDraft)

  var id: UUID {
    switch self {
    case .labels(let draft): draft.id
    case .reviewers(let draft): draft.id
    }
  }
}

@MainActor @Observable
final class PullRequestLabelsDraft {
  let id = UUID()
  let target: ForgeReviewTarget
  let current: [GitHubReviewLabel]
  var candidates: [GitHubReviewLabel] = []
  var truncated = false
  var didLoad = false
  var selected: Set<String>
  var isApplying = false

  init(target: ForgeReviewTarget, current: [GitHubReviewLabel]) {
    self.target = target
    self.current = current
    selected = Set(current.map(\.name))
  }
}

@MainActor @Observable
final class PullRequestReviewersDraft {
  let id = UUID()
  let target: ForgeReviewTarget
  let requested: [GitHubReviewerSummary]
  var query = ""
  var results: [GitHubReviewerSummary] = []
  var truncated = false
  var didLoad = false
  var edit = PullRequestReviewerEdit()
  var isApplying = false

  init(target: ForgeReviewTarget, requested: [GitHubReviewerSummary]) {
    self.target = target
    self.requested = requested
  }
}

/// Multi-select of the host's label candidates. Applying sends the delta from
/// the labels the review had when the workspace opened the sheet.
struct PullRequestLabelsSheet: View {
  @Environment(\.dismiss) private var dismiss
  let forge: ForgeReviewController
  @Bindable var draft: PullRequestLabelsDraft

  /// Labels already on the review stay listed even when a truncated candidate list omits them.
  private var rows: [GitHubReviewLabel] {
    let names = Set(draft.current.map(\.name))
    return draft.current + draft.candidates.filter { !names.contains($0.name) }
  }

  private var canApply: Bool {
    let change = PullRequestLabelEdit.delta(current: draft.current.map(\.name), selected: draft.selected)
    return forge.reviewTarget == draft.target && forge.canMutate && !draft.isApplying && (!change.add.isEmpty || !change.remove.isEmpty)
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
          if !draft.didLoad {
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
          if draft.truncated { Text(PullRequestsStrings.labelsTruncated) }
        }
      }
      .poracodeDrawerListStyle()
      .disabled(draft.isApplying)
      .navigationTitle(PullRequestsStrings.editLabels)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitHubOperationsStrings.cancel, systemImage: "xmark") { dismiss() }
            .disabled(draft.isApplying)
        }
        ToolbarItem(placement: .bottomBar) {
          Button(
            draft.isApplying ? PullRequestsStrings.loading : PullRequestsStrings.apply,
            systemImage: draft.isApplying ? "hourglass" : "checkmark"
          ) {
            Task { await apply() }
          }
          .disabled(!canApply)
          .accessibilityIdentifier("native-e2e.pull-requests.labels.apply")
        }
      }
      .task { await load() }
    }
    .tint(.primary)
    .interactiveDismissDisabled(draft.isApplying)
    .modifier(PoracodeRetainNavigationWhilePresented())
    .onChange(of: forge.reviewTarget) { _, target in
      if target != draft.target { dismiss() }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }

  private func row(_ label: GitHubReviewLabel) -> some View {
    let isSelected = draft.selected.contains(label.name)
    return Button {
      if isSelected {
        draft.selected.remove(label.name)
      } else {
        draft.selected.insert(label.name)
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
            .foregroundStyle(.primary)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityIdentifier("native-e2e.pull-requests.label.\(label.name)")
    .poracodeDrawerRowSurface()
  }

  private func load() async {
    let result = await forge.candidates(.forgeListPrLabelCandidates, expectedTarget: draft.target)
    guard !Task.isCancelled else { return }
    draft.didLoad = true
    guard let result else { return }
    draft.candidates = GitHubResultProjection.labels(result["labels"])
    draft.truncated = result["truncated"]?.boolValue == true
  }

  private func apply() async {
    guard canApply else { return }
    let change = PullRequestLabelEdit.delta(current: draft.current.map(\.name), selected: draft.selected)
    draft.isApplying = true
    let accepted = await forge.setLabels(add: change.add, remove: change.remove, expectedTarget: draft.target)
    draft.isApplying = false
    if accepted { dismiss() }
  }
}

/// Reviewer search plus the review's outstanding requests. Adds and removals are
/// staged in the workspace draft and sent together when applied.
struct PullRequestReviewersSheet: View {
  @Environment(\.dismiss) private var dismiss
  let forge: ForgeReviewController
  @Bindable var draft: PullRequestReviewersDraft

  /// Staged additions stay listed while the search text changes underneath them.
  private var suggestions: [GitHubReviewerSummary] {
    let known = Set(draft.requested.map(\.id)).union(draft.edit.added.map(\.id))
    return draft.edit.added + draft.results.filter { !known.contains($0.id) }
  }

  private var canApply: Bool {
    forge.reviewTarget == draft.target && forge.canMutate && !draft.isApplying
      && !draft.edit.isEmpty && draft.edit.isWithinLimits
  }

  var body: some View {
    NavigationStack {
      List {
        Section {
          HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
              .foregroundStyle(.secondary)
              .accessibilityHidden(true)
            TextField(PullRequestsStrings.searchReviewers, text: $draft.query)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .submitLabel(.search)
              .accessibilityIdentifier("native-e2e.pull-requests.reviewers.search")
          }
          .poracodeDrawerRowSurface()
        }
        if let failure = forge.failure {
          Section {
            Text(GitHubOperationsStrings.failure(failure))
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        if !draft.requested.isEmpty {
          Section(PullRequestsStrings.requestedReviewers) {
            ForEach(draft.requested) { reviewer in
              requestedRow(reviewer)
            }
          }
        }
        Section {
          if !draft.didLoad {
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
          if draft.truncated { Text(PullRequestsStrings.reviewersTruncated) }
        }
      }
      .poracodeDrawerListStyle()
      .disabled(draft.isApplying)
      .navigationTitle(PullRequestsStrings.requestReview)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitHubOperationsStrings.cancel, systemImage: "xmark") { dismiss() }
            .disabled(draft.isApplying)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(
            draft.isApplying ? PullRequestsStrings.loading : PullRequestsStrings.apply,
            systemImage: draft.isApplying ? "hourglass" : "checkmark"
          ) {
            Task { await apply() }
          }
          .disabled(!canApply)
          .accessibilityIdentifier("native-e2e.pull-requests.reviewers.apply")
        }
      }
      .task(id: draft.query) { await search() }
    }
    .tint(.primary)
    .interactiveDismissDisabled(draft.isApplying)
    .modifier(PoracodeRetainNavigationWhilePresented())
    .onChange(of: forge.reviewTarget) { _, target in
      if target != draft.target { dismiss() }
    }
    .poracodeFormSheetSizing()
  }

  private func requestedRow(_ reviewer: GitHubReviewerSummary) -> some View {
    let isRemoving = draft.edit.isRemoved(reviewer)
    return Button {
      draft.edit.toggleRemoved(reviewer)
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
    .accessibilityIdentifier("native-e2e.pull-requests.reviewer.requested.\(reviewer.id)")
    .poracodeDrawerRowSurface()
  }

  private func suggestionRow(_ reviewer: GitHubReviewerSummary) -> some View {
    let isAdding = draft.edit.isAdded(reviewer)
    return Button {
      draft.edit.toggleAdded(reviewer)
    } label: {
      HStack(spacing: 10) {
        PullRequestReviewerRow(reviewer: reviewer)
        Spacer(minLength: 8)
        if isAdding {
          Image(systemName: "checkmark.circle.fill")
            .foregroundStyle(.primary)
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
    .accessibilityIdentifier("native-e2e.pull-requests.reviewer.suggested.\(reviewer.id)")
    .poracodeDrawerRowSurface()
  }

  /// The first lookup runs at once; later ones wait briefly so typing sends one search.
  private func search() async {
    if draft.didLoad {
      try? await Task.sleep(for: .milliseconds(300))
      guard !Task.isCancelled else { return }
    }
    var fields: [String: GitHubJSONValue] = [:]
    let text = PullRequestReviewerEdit.boundedQuery(draft.query)
    if !text.isEmpty { fields["query"] = .string(text) }
    let result = await forge.candidates(.forgeListPrReviewerCandidates, fields: fields, expectedTarget: draft.target)
    guard !Task.isCancelled else { return }
    draft.didLoad = true
    guard let result else { return }
    draft.results = GitHubResultProjection.reviewers(result["reviewers"])
    draft.truncated = result["truncated"]?.boolValue == true
  }

  private func apply() async {
    guard canApply else { return }
    draft.isApplying = true
    let accepted = await forge.requestReviewers(add: draft.edit.added, remove: draft.edit.removed, expectedTarget: draft.target)
    draft.isApplying = false
    if accepted { dismiss() }
  }
}
