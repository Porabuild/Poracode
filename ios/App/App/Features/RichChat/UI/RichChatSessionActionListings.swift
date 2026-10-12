import SwiftUI

/// One read-only listing's lifecycle. A failure keeps the honest failed
/// state — never a fake empty list.
enum RichChatListingPhase {
  case idle
  case loading
  case failed
  case rules([RichChatRuleEntryView])
}

/// Shared listing chrome for the rules panel.
struct RichChatSessionActionListingSheet: View {
  let title: String
  let phase: RichChatListingPhase
  let emptyText: String
  let onDone: () -> Void

  var body: some View {
    NavigationStack {
      Group {
        switch phase {
        case .idle, .loading:
          ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed:
          Text(RichChatSessionActionStrings.listingFailed)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .rules(let rules):
          if rules.isEmpty {
            empty
          } else {
            rulesList(rules)
          }
        }
      }
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatSessionActionStrings.done) { onDone() }
        }
      }

    }
  }

  private var empty: some View {
    Text(emptyText)
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func rulesList(_ rules: [RichChatRuleEntryView]) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        ForEach(Array(rules.enumerated()), id: \.offset) { _, rule in
          VStack(alignment: .leading, spacing: 2) {
            Text(rule.name)
            Text(rule.path)
              .font(.caption.monospaced())
              .foregroundStyle(.secondary)
            ForEach(rule.details, id: \.self) { detail in
              Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .padding()
    }
  }
}
