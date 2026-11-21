import SwiftUI

struct HomeNewsHighlightView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.locale) private var locale
  @State private var current: HomeNewsHighlight
  let highlights: [HomeNewsHighlight]
  let canOpenFeature: (String) -> Bool
  let onAction: (HomeNewsCardAction) -> Void

  init(initial: HomeNewsHighlight, highlights: [HomeNewsHighlight], canOpenFeature: @escaping (String) -> Bool, onAction: @escaping (HomeNewsCardAction) -> Void) {
    _current = State(initialValue: initial)
    self.highlights = highlights
    self.canOpenFeature = canOpenFeature
    self.onAction = onAction
  }

  private func copy(_ key: String) -> String { HomeNewsCatalog.bundled.message(key, locale: locale) }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        details
        navigationControls.fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .poracodeUseKeyboardLayoutGuide()
      .navigationTitle(copy("News"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button(copy("Close")) { dismiss() } } }
    }
    .presentationDetents([.medium, .large])
  }

  private var details: some View {
    List {
        Section {
          VStack(alignment: .leading, spacing: 12) {
            Text(verbatim: HomeNewsFormatting.headlineCaption(current, locale: locale))
              .font(.caption).foregroundStyle(.secondary)
            if let label = current.change.label { Text(verbatim: label).font(.headline) }
            Text(verbatim: current.change.text).textSelection(.enabled)
              .accessibilityIdentifier("native-e2e.news.highlight-text")
            Text(verbatim: HomeNewsFormatting.text("news.point", locale: locale,
              arguments: [current.position, current.total, current.version]))
              .font(.caption).foregroundStyle(.secondary)
              .accessibilityIdentifier("native-e2e.news.highlight-position")
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.vertical, 4)
        }
        if let id = current.change.feature, canOpenFeature(id), let feature = HomeNewsCatalog.bundled.features.first(where: { $0.id == id }) {
          Section {
            Button(HomeNewsCatalog.localized(feature.action, locale: locale)) { onAction(.feature(id)) }
          }
        }
        Section {
          Button(copy("What's New")) { onAction(.whatsNew) }
        }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(700)
  }

  private var navigationControls: some View {
    PoracodeBottomActionBar {
      PoracodeCircleButton { step(-1) } label: { Image(systemName: "chevron.left") }
        .accessibilityLabel(copy("Previous"))
        .accessibilityIdentifier("native-e2e.news.highlight.previous")
    } trailing: {
      PoracodeCircleButton { step(1) } label: { Image(systemName: "chevron.right") }
        .accessibilityLabel(copy("Next"))
        .accessibilityIdentifier("native-e2e.news.highlight.next")
    }
  }

  private func step(_ delta: Int) {
    guard !highlights.isEmpty else { return }
    let index = highlights.firstIndex(where: { $0.id == current.id }) ?? 0
    current = highlights[(index + delta + highlights.count) % highlights.count]
    HomeNewsMemoryStore.shared.retireHighlight(current.id)
  }
}
