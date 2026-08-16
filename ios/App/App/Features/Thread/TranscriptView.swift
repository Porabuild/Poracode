import SwiftUI

struct TranscriptView: View {
    let items: [PersistedRuntimeItem]
    var hasOlder: Bool
    var isLoadingOlder: Bool
    var onLoadOlder: () -> Void

    private var rows: [TranscriptPresentation.Row] {
        TranscriptPresentation.visibleRows(from: items)
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if hasOlder {
                        Button {
                            onLoadOlder()
                        } label: {
                            if isLoadingOlder {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text("Load earlier messages")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.bordered)
                        .disabled(isLoadingOlder)
                        .accessibilityLabel("Load earlier messages")
                    }

                    ForEach(rows) { row in
                        VStack(alignment: .leading, spacing: 8) {
                            TranscriptItemRow(item: row.item)
                            if !row.children.isEmpty {
                                VStack(alignment: .leading, spacing: 6) {
                                    ForEach(row.children) { child in
                                        TranscriptItemRow(item: child)
                                            .padding(.leading, 12)
                                    }
                                }
                                .accessibilityElement(children: .contain)
                                .accessibilityLabel("Sub-agent steps")
                            }
                        }
                        .id(row.id)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .onChange(of: rows.last?.id) { _, newId in
                guard let newId else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(newId, anchor: .bottom)
                }
            }
        }
    }
}

struct TranscriptItemRow: View {
    let item: PersistedRuntimeItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(item.type.replacingOccurrences(of: "_", with: " "))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(accent)
                Spacer()
                Text(item.state)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Text(item.displayText)
                .font(isUser ? .body : .callout.monospaced())
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.type), \(item.state): \(item.displayText)")
    }

    private var isUser: Bool {
        item.type == "user_message" || item.type == "user-message"
    }

    private var isAssistant: Bool {
        item.type.contains("assistant") || item.type == "agent_message" || item.type == "message"
    }

    private var accent: Color {
        if isUser { return .accentColor }
        if item.type.contains("error") { return .red }
        if item.type.contains("tool") { return .orange }
        return .secondary
    }

    private var background: some ShapeStyle {
        if isUser {
            return AnyShapeStyle(Color.accentColor.opacity(0.12))
        }
        if isAssistant {
            return AnyShapeStyle(Color.primary.opacity(0.05))
        }
        return AnyShapeStyle(Color.primary.opacity(0.04))
    }
}
