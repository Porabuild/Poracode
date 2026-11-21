import SwiftUI

struct HomeNewsLineView: View {
  @Environment(\.locale) private var locale
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @Bindable var visit: HomeNewsVisit
  @Bindable private var memory = HomeNewsMemoryStore.shared
  let model: HomeNewsCards.Model
  let composerControlsPresented: Bool
  var compact = false
  let canOpenFeature: (String) -> Bool
  let preparePresentation: () -> Void
  let onAction: (HomeNewsCardAction) -> Void
  @State private var controlsPresented = false
  @State private var hovered = false
  @State private var highlight: HomeNewsHighlight?
  @State private var pendingAction: HomeNewsCardAction?
  @FocusState private var focusedControl: Control?

  private enum Control: Hashable { case item, menu }

  private var index: Int { visit.resolvedIndex(model.items) }
  private var current: HomeNewsCard? { model.items.indices.contains(index) ? model.items[index] : nil }
  private var paused: Bool { visit.userPaused || visit.isTyping || composerControlsPresented || focusedControl != nil || controlsPresented || hovered || highlight != nil || scenePhase != .active || voiceOver || reduceMotion }
  private func copy(_ key: String) -> String { HomeNewsCatalog.bundled.message(key, locale: locale) }

  var body: some View {
    Group {
      if let current {
        HStack(alignment: .center, spacing: 8) {
          Button { activate(current) } label: {
            HStack(alignment: .center, spacing: 8) {
              Image(systemName: current.icon).font(.caption).foregroundStyle(current.urgent ? Color.red : Color.secondary).accessibilityHidden(true)
              VStack(alignment: .leading, spacing: 2) {
                if !compact, let caption = current.caption { Text(verbatim: caption).font(.caption2).foregroundStyle(.secondary) }
                HStack(spacing: 8) {
                  Text(verbatim: current.text).font(.caption).foregroundStyle(.secondary).lineLimit(compact ? 1 : 2)
                  if !compact, current.sparkline.count > 1 {
                    HomeNewsSparkline(values: current.sparkline)
                      .stroke(.orange, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                      .frame(width: 48, height: 14).accessibilityHidden(true)
                  }
                }
                if !compact, let actionLabel = current.actionLabel { Text(verbatim: actionLabel).font(.caption2.weight(.medium)).foregroundStyle(.primary) }
                if !compact, let percent = current.usagePercent {
                  ProgressView(value: min(100, max(0, percent)), total: 100).frame(maxWidth: 160).accessibilityHidden(true)
                }
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .focused($focusedControl, equals: .item)
          .accessibilityIdentifier("native-e2e.news.item.\(current.id)")
          Button { controlsPresented = true } label: {
            Image(systemName: "ellipsis")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.secondary)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .focused($focusedControl, equals: .menu)
          .accessibilityLabel(copy("News"))
          .accessibilityIdentifier("native-e2e.news.controls")
        }
        .padding(.horizontal, 10)
        .onHover { hovered = $0 }
      }
    }
    .onChange(of: current?.id, initial: true) { _, _ in
      if let current { visit.show(current, index: index, poolIDs: Set(model.highlights.map(\.id)), memory: memory) }
    }
    .task(id: RotationKey(id: current?.id, paused: paused, count: model.items.count)) {
      guard !paused, model.items.count > 1 else { return }
      do {
        try await Task.sleep(for: .seconds(current?.longDwell == true ? 20 : 5))
        try Task.checkCancellation()
        visit.step(1, items: model.items)
      } catch { }
    }
    .task(id: visit.typingUntil) {
      let expected = visit.typingUntil
      guard visit.isTyping else { return }
      do {
        try await Task.sleep(for: .seconds(max(0, expected.timeIntervalSinceNow)))
        try Task.checkCancellation()
        visit.finishTyping(expected: expected)
      } catch { }
    }
    .confirmationDialog(copy("News"), isPresented: $controlsPresented, titleVisibility: .visible) {
      if model.items.count > 1 {
        Button(copy("Previous")) { visit.step(-1, items: model.items) }
        Button(copy("Next")) { visit.step(1, items: model.items) }
        Button(copy(visit.userPaused ? "Resume news" : "Pause news")) { visit.userPaused.toggle() }
      }
      if let current { Button(copy("Hide this")) { hide(current) } }
      Button(HomeStrings.cancel, role: .cancel) { }
    } message: {
      if let current { Text(verbatim: current.text) }
    }
    .sheet(item: $highlight, onDismiss: {
      if let action = pendingAction { pendingAction = nil; onAction(action) }
    }) { selected in
      HomeNewsHighlightView(initial: selected, highlights: model.highlights, canOpenFeature: canOpenFeature) { action in
        pendingAction = action
        highlight = nil
      }
    }
  }

  private struct RotationKey: Hashable { let id: String?; let paused: Bool; let count: Int }

  private func activate(_ item: HomeNewsCard) {
    if let value = item.highlight {
      preparePresentation()
      memory.retireHighlight(value.id)
      highlight = value
      return
    }
    guard let action = item.action else { controlsPresented = true; return }
    if item.kind == .announcement || item.kind == .discovery { memory.hide(item.id) }
    if item.kind == .promotion { memory.dismissPromotion(String(item.id.dropFirst("promotion:".count))) }
    if case .external(let url) = action { openURL(url) }
    else { onAction(action) }
  }

  private func hide(_ item: HomeNewsCard) {
    switch item.kind {
    case .changelog:
      if let highlight = item.highlight { memory.retireHighlight(highlight.id) }
      memory.hide(item.id, forSession: true)
    case .usage: memory.hide(item.id, forSession: true)
    case .promotion: memory.dismissPromotion(String(item.id.dropFirst("promotion:".count)))
    default: memory.hide(item.id)
    }
  }
}

private struct HomeNewsSparkline: Shape {
  let values: [Double]
  func path(in rect: CGRect) -> Path {
    guard values.count > 1 else { return Path() }
    let peak = max(1, values.max() ?? 1)
    var result = Path()
    for (index, value) in values.enumerated() {
      let point = CGPoint(x: rect.minX + rect.width * CGFloat(index) / CGFloat(values.count - 1),
        y: rect.maxY - 1 - CGFloat(value / peak) * max(0, rect.height - 2))
      if index == 0 { result.move(to: point) } else { result.addLine(to: point) }
    }
    return result
  }
}
