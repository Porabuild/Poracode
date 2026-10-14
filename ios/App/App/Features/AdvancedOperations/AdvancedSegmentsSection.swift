import SwiftUI

/// Structured composer segments for `stageThreadInput`.
///
/// Segments stay optional: with the include toggle off the field is omitted
/// entirely, which is not the same as sending an empty list.
struct AdvancedSegmentsSection: View {
  @Binding var draft: AdvancedOperationDraft

  var body: some View {
    Section(AdvancedOperationsStrings.segmentsSection) {
      Toggle(AdvancedOperationsStrings.includeSegments, isOn: $draft.includesSegments)
        .accessibilityIdentifier("advancedOperations.includeSegments")
      if draft.includesSegments {
        ForEach($draft.segments) { $segment in
          AdvancedSegmentEditor(segment: $segment) {
            draft.removeSegment(segment.id)
          }
        }
        Menu(AdvancedOperationsStrings.addSegment) {
          ForEach(AdvancedSegmentKind.allCases) { kind in
            Button(kind.title) { draft.addSegment(kind) }
          }
        }
        .accessibilityIdentifier("advancedOperations.addSegment")
      }
    }
  }
}

struct AdvancedSegmentEditor: View {
  @Binding var segment: AdvancedSegmentDraft
  let remove: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(segment.kind.title).font(.subheadline.weight(.semibold))
        Spacer()
        Button(AdvancedOperationsStrings.removeSegment, role: .destructive, action: remove)
          .buttonStyle(.plain)
          .font(.caption)
          .accessibilityIdentifier("advancedOperations.removeSegment")
      }
      ForEach(segment.kind.fields) { key in
        field(key)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(segment.kind.title)
  }

  @ViewBuilder
  private func field(_ key: AdvancedSegmentFieldKey) -> some View {
    switch key {
    case .side:
      Picker(key.title, selection: $segment.side) {
        ForEach([AdvancedDiffSide.old, .new], id: \.self) { side in
          Text(AdvancedOperationsStrings.diffSide(side)).tag(side)
        }
      }
    case .scope:
      Picker(key.title, selection: $segment.scope) {
        ForEach([AdvancedSkillScope.global, .project], id: \.self) { scope in
          Text(AdvancedOperationsStrings.skillScope(scope)).tag(scope)
        }
      }
    case .staged:
      Toggle(key.title, isOn: $segment.staged)
    case .content, .body:
      TextField(key.title, text: text(key), axis: .vertical)
        .lineLimit(2...6)
        .accessibilityLabel(key.title)
    default:
      TextField(key.title, text: text(key))
        .font(.callout.monospaced())
        .advancedVerbatimInput()
        .accessibilityLabel(key.title)
    }
  }

  private func text(_ key: AdvancedSegmentFieldKey) -> Binding<String> {
    Binding(
      get: { segment[text: key] },
      set: { segment[text: key] = $0 }
    )
  }
}
