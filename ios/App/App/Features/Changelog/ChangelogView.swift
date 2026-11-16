import SwiftUI

struct ChangelogView: View {
  @State private var store: ChangelogStore

  init(store: ChangelogStore = .shared) { _store = State(initialValue: store) }

  var body: some View {
    List {
      Section {
        Text(ChangelogStrings.description).foregroundStyle(.secondary)
      }
      if store.releases.isEmpty {
        if store.state == .idle || store.isLoading {
          ProgressView(ChangelogStrings.loading)
            .accessibilityIdentifier("native-e2e.changelog.loading")
        } else {
          ContentUnavailableView {
            Label(ChangelogStrings.empty, systemImage: "doc.text")
          } description: {
            Text(ChangelogStrings.emptyBody)
          }
          .accessibilityIdentifier("native-e2e.changelog.empty")
        }
      } else {
        if store.refreshFailed {
          Section {
            Label(ChangelogStrings.cached, systemImage: "arrow.clockwise")
              .font(.footnote).foregroundStyle(.secondary)
              .accessibilityIdentifier("native-e2e.changelog.cached")
          }
        }
        ForEach(Array(store.releases.enumerated()), id: \.offset) { _, release in
          Section {
            ChangelogReleaseContent(release: release)
          }
        }
      }
      Section {
        Link(destination: ChangelogHTTPClient.releasesURL) {
          Label(ChangelogStrings.allReleases, systemImage: "arrow.up.right")
        }
        .tint(.primary)
        .accessibilityIdentifier("native-e2e.changelog.releases")
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .accessibilityIdentifier("native-e2e.changelog.list")
    .navigationTitle(ChangelogStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .poracodeBottomBar {
      PoracodeBottomActionDock {
        PoracodeCircleButton(action: { Task { await store.refresh() } }) {
          if store.isLoading { ProgressView() }
          else { Image(systemName: "arrow.clockwise") }
        }
        .accessibilityLabel(HomeStrings.refresh)
        .accessibilityIdentifier("native-e2e.changelog.refresh")
        .disabled(store.isLoading)
      }
    }
    .poracodeUseKeyboardLayoutGuide()
    .refreshable { await store.refresh() }
    .task { await store.refresh() }
  }
}

private struct ChangelogReleaseContent: View {
  let release: ChangelogRelease

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 8) {
        Text(verbatim: release.title).font(.headline)
          .accessibilityAddTraits(.isHeader)
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 12) { metadata }
          VStack(alignment: .leading, spacing: 4) { metadata }
        }
        .font(.caption).foregroundStyle(.secondary)
        Text(verbatim: release.summary).foregroundStyle(.secondary)
      }
      ForEach(ChangelogChange.Kind.allCases, id: \.self) { kind in
        let changes = release.changes.filter { $0.kind == kind }
        if !changes.isEmpty {
          VStack(alignment: .leading, spacing: 8) {
            Label(ChangelogStrings.kind(kind), systemImage: symbol(kind))
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.secondary)
              .accessibilityAddTraits(.isHeader)
            ForEach(Array(changes.enumerated()), id: \.offset) { _, change in
              HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(verbatim: "•").foregroundStyle(.tertiary).accessibilityHidden(true)
                changeText(change)
              }
            }
          }
        }
      }
    }
    .padding(.vertical, 4)
    .textSelection(.enabled)
  }

  @ViewBuilder private var metadata: some View {
    Text(verbatim: "v\(release.version)").monospacedDigit()
    if let date = release.calendarDate() {
      Text(date, format: .dateTime.year().month(.wide).day())
    } else {
      Text(verbatim: release.date)
    }
  }

  private func changeText(_ change: ChangelogChange) -> Text {
    if let label = change.label, !label.isEmpty {
      return Text(verbatim: "\(label) — ").bold() + Text(verbatim: change.text)
    }
    return Text(verbatim: change.text)
  }

  private func symbol(_ kind: ChangelogChange.Kind) -> String {
    switch kind {
    case .added: "plus"
    case .improved: "arrow.up"
    case .fixed: "wrench"
    }
  }
}
