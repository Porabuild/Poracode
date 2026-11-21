import SwiftUI

/// Tool-independent widgets; grouping and field meaning come from shared TS.
struct RichResolvedToolBodyView: View {
  let presentation: RichResolvedToolBody
  let itemID: String
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(Array(presentation.blocks.enumerated()), id: \.offset) { index, block in
        let id = "body:\(itemID):\(index)"
        switch block {
        case .markdown(let text): RichChatMarkdownView(source: text)
        case .code(let text): RichToolCodeBlock(text: text, identifier: "native-e2e.tool-body.\(itemID).\(index)")
        case .list(let count, let rows): RichResolvedToolList(count: count, rows: rows, disclosureID: id)
        }
      }
    }
  }
}

private struct RichResolvedToolList: View {
  let count: String
  let rows: [RichResolvedToolBody.Row]
  let disclosureID: String
  @Environment(\.transcriptDisclosures) private var disclosures
  @State private var localExpanded = false
  private var expansion: Binding<Bool> {
    TranscriptDisclosureContext.binding(disclosures, id: disclosureID, fallback: $localExpanded)
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Button {
        withAnimation(.snappy(duration: 0.22)) { expansion.wrappedValue.toggle() }
      } label: {
        HStack(spacing: 7) {
          RichChatIcon(.gitBranch).frame(width: 18)
          Text(ToolPresentationStrings.label("results"))
          Text("·").accessibilityHidden(true)
          Text(count).monospacedDigit()
          Spacer(minLength: 0)
          Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
            .rotationEffect(.degrees(expansion.wrappedValue ? 180 : 0))
        }
        .poracodeChatText(.metadata).foregroundStyle(.secondary).richChatActivityHeaderLayout()
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("native-e2e.tool-body-list.\(disclosureID)")
      .accessibilityValue(expansion.wrappedValue ? ToolPresentationStrings.expanded : ToolPresentationStrings.collapsed)
      if expansion.wrappedValue {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
            RichResolvedToolListRow(row: row, disclosureID: "\(disclosureID):\(index)")
          }
        }.padding(.leading, 16)
      }
    }
  }
}

private struct RichResolvedToolListRow: View {
  let row: RichResolvedToolBody.Row
  let disclosureID: String
  @Environment(\.transcriptDisclosures) private var disclosures
  @State private var localExpanded = false
  private var expansion: Binding<Bool> {
    TranscriptDisclosureContext.binding(disclosures, id: disclosureID, fallback: $localExpanded)
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Button {
        withAnimation(.snappy(duration: 0.22)) { expansion.wrappedValue.toggle() }
      } label: {
        HStack(spacing: 7) {
          if let title = row.title { Text(title).fontWeight(.medium).lineLimit(1) }
          Text(row.summary).foregroundStyle(.secondary).lineLimit(1)
          Spacer(minLength: 0)
          Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
            .rotationEffect(.degrees(expansion.wrappedValue ? 180 : 0))
        }.poracodeChatText(.metadata).richChatActivityHeaderLayout()
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("native-e2e.tool-body-row.\(disclosureID)")
      .accessibilityValue(expansion.wrappedValue ? ToolPresentationStrings.expanded : ToolPresentationStrings.collapsed)
      if expansion.wrappedValue {
        VStack(alignment: .leading, spacing: 6) {
          if let title = row.title {
            Text(title).font(.footnote.weight(.medium)).textSelection(.enabled)
              .accessibilityIdentifier("native-e2e.tool-body-title.\(disclosureID)")
          }
          if let detail = row.detail { RichChatMarkdownView(source: detail) }
          ForEach(Array(row.fields.enumerated()), id: \.offset) { index, field in
            VStack(alignment: .leading, spacing: 3) {
              Text(field.label).font(.caption.monospaced()).foregroundStyle(.secondary)
              if field.isCode {
                RichToolCodeBlock(text: field.text, identifier: "native-e2e.tool-body-field.\(disclosureID).\(index)")
              } else { Text(field.text).poracodeChatText(.metadata).textSelection(.enabled) }
            }
          }
        }.padding(.leading, 12)
      }
    }
  }
}
