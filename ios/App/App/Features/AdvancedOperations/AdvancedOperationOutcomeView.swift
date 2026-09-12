import SwiftUI

/// Renders one projected outcome. It only ever shows values that
/// `AdvancedOperationOutcomeProjection` already redacted.
struct AdvancedOperationOutcomeView: View {
  let outcome: AdvancedOperationOutcome?

  var body: some View {
    if let outcome {
      AdvancedOperationsChrome.card {
        VStack(alignment: .leading, spacing: 10) {
          Text(outcome.title)
            .font(.headline)
            .accessibilityAddTraits(.isHeader)
          if outcome.isAcknowledgement {
            Text(AdvancedOperationsStrings.acknowledged)
              .foregroundStyle(.secondary)
          } else {
            ForEach(outcome.rows) { row in
              AdvancedOutcomeRowView(row: row)
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(outcome.accessibilityLabel)
        .accessibilityIdentifier(
          "advancedOperations.outcome.\(outcome.procedure.rawValue)"
        )
      }
    }
  }
}

struct AdvancedOutcomeRowView: View {
  let row: AdvancedOutcomeRow

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(row.label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(row.value)
        .font(.callout.monospaced())
        .textSelection(.enabled)
        .lineLimit(8)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(row.accessibilityLabel)
  }
}
