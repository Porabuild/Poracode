import SwiftUI

enum RichChatInspectorSectionID: String, CaseIterable, Codable, Identifiable {
  case goal, steer, plan, crew, agents, backgroundTasks
  case media = "images"
  case info, context, usage, checkpoints

  var id: String { rawValue }
}

/// Version 1 is a new, device-local layout preference. It doesn't change host
/// settings or the wire contract; a missing value keeps the desktop defaults.
struct RichChatInspectorPreferences: Codable, Equatable {
  var order: [RichChatInspectorSectionID] = RichChatInspectorSectionID.allCases
  var collapsed: Set<RichChatInspectorSectionID> = [.info, .context, .usage]

  init() {}

  init(stored: String) {
    guard let data = stored.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(Self.self, from: data)
    else { self.init(); return }
    self = decoded
    var seen = Set<RichChatInspectorSectionID>()
    order = (order + RichChatInspectorSectionID.allCases).filter { seen.insert($0).inserted }
  }

  var encoded: String {
    (try? JSONEncoder().encode(self)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
  }

  mutating func move(_ source: RichChatInspectorSectionID, to target: RichChatInspectorSectionID) {
    guard source != target, let from = order.firstIndex(of: source),
      let destination = order.firstIndex(of: target) else { return }
    order.remove(at: from)
    order.insert(source, at: destination)
  }
}

struct RichChatInspectorSection<Icon: View, Content: View>: View {
  let id: RichChatInspectorSectionID
  let title: String
  var summary: String? = nil
  @Binding var preferences: RichChatInspectorPreferences
  let visibleOrder: [RichChatInspectorSectionID]
  @ViewBuilder let icon: () -> Icon
  @ViewBuilder let content: () -> Content

  @State private var targeted = false
  private var collapsed: Bool { preferences.collapsed.contains(id) }
  private var index: Int { visibleOrder.firstIndex(of: id) ?? 0 }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 4) {
        Image(systemName: "line.3.horizontal")
          .font(.caption)
          .foregroundStyle(.tertiary)
          .frame(width: 28, height: 44)
          .contentShape(Rectangle())
          .draggable("poracode.inspector.\(id.rawValue)")
          .accessibilityLabel(RichChatStrings.reorderSection(title))
          .accessibilityAction(named: RichChatStrings.moveSectionUp) { move(by: -1) }
          .accessibilityAction(named: RichChatStrings.moveSectionDown) { move(by: 1) }

        Button(action: toggle) {
          HStack(spacing: 8) {
            icon().frame(width: 18).accessibilityHidden(true)
            Text(title)
              .poracodeChatText(.metadata, weight: .semibold)
              .foregroundStyle(.primary)
              .lineLimit(1)
              .layoutPriority(1)
            Spacer(minLength: 4)
            if let summary {
              Text(summary)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            Image(systemName: collapsed ? "chevron.right" : "chevron.down")
              .font(.caption2.weight(.semibold))
              .foregroundStyle(.tertiary)
          }
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityValue([summary, collapsed ? RichChatStrings.sectionCollapsed : RichChatStrings.sectionExpanded].compactMap { $0 }.joined(separator: ", "))
        .accessibilityIdentifier("native-e2e.inspector.section.\(id.rawValue)")
      }
      .padding(.horizontal, 8)
      if !collapsed { content() }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeContentCardBackground()
    .overlay {
      if targeted {
        RoundedRectangle(cornerRadius: 14).stroke(.secondary, lineWidth: 2)
      }
    }
    .contextMenu {
      Button(RichChatStrings.moveSectionUp, systemImage: "arrow.up") { move(by: -1) }
        .disabled(index == 0)
      Button(RichChatStrings.moveSectionDown, systemImage: "arrow.down") { move(by: 1) }
        .disabled(index + 1 >= visibleOrder.count)
    }
    .dropDestination(for: String.self) { values, _ in
      guard values.count == 1, let value = values.first,
        value.hasPrefix("poracode.inspector."),
        let source = RichChatInspectorSectionID(rawValue: String(value.dropFirst("poracode.inspector.".count))),
        visibleOrder.contains(source)
      else { return false }
      withAnimation(.snappy(duration: 0.2)) { preferences.move(source, to: id) }
      return true
    } isTargeted: { targeted = $0 }
  }

  private func toggle() {
    withAnimation(.snappy(duration: 0.2)) {
      if collapsed { preferences.collapsed.remove(id) }
      else { preferences.collapsed.insert(id) }
    }
  }

  private func move(by offset: Int) {
    let target = index + offset
    guard visibleOrder.indices.contains(target) else { return }
    withAnimation(.snappy(duration: 0.2)) { preferences.move(id, to: visibleOrder[target]) }
  }
}

/// The same state vocabulary as desktop: a moving ring while active, with
/// distinct completion/failure/cancellation symbols and reduced-motion support.
struct RichChatGoalStatusIcon: View {
  let status: String
  var diameter: CGFloat = 24
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var rotating = false

  var body: some View {
    ZStack {
      Image(systemName: symbol)
        .font(.system(size: diameter / 2))
        .foregroundStyle(tint)
      if status == "active" {
        Circle().trim(from: 0, to: 0.28)
          .stroke(.primary.opacity(0.8), style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
          .frame(width: diameter - 2, height: diameter - 2)
          .rotationEffect(.degrees(rotating && !reduceMotion ? 360 : 0))
          .animation(reduceMotion ? nil : .linear(duration: 1.6).repeatForever(autoreverses: false), value: rotating && !reduceMotion)
          .onAppear { rotating = true }
          .onDisappear { rotating = false }
      }
    }
    .frame(width: diameter, height: diameter)
    // Keep the rotating ring attached to its symbol when a panel resizes or
    // its card moves; the repeating animation must not interpolate row layout.
    .geometryGroup()
    .accessibilityHidden(true)
  }

  private var symbol: String {
    switch status {
    case "complete": "checkmark.circle"
    case "failed": "xmark.circle"
    case "cancelled": "stop.circle"
    default: "scope"
    }
  }

  private var tint: Color {
    switch status {
    case "complete": .green
    case "failed": .red
    case "active": .primary
    default: .secondary
    }
  }
}
