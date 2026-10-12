import SwiftUI

struct RichChatSessionActionReviseSheet: View {
  let suggestion: String?
  let missingSuggestion: Bool
  let isPending: Bool
  let isDisabled: Bool
  let failureText: String?
  let onCancel: () -> Void
  let onSubmit: (_ command: String, _ note: String) -> Void
  let onInsert: (_ suggestion: String) -> Void
  let onDiscard: () -> Void

  var body: some View {
    NavigationStack {
      Group {
        if let suggestion {
          review(suggestion)
        } else {
          form
        }
      }
      .navigationTitle(RichChatSessionActionStrings.revise)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatSessionActionStrings.cancel) { onCancel() }
        }
      }
    }
  }

  private var form: some View {
    RichChatSessionActionReviseForm(
      isPending: isPending,
      isDisabled: isDisabled,
      missingSuggestion: missingSuggestion,
      failureText: failureText,
      onSubmit: onSubmit
    )
  }

  private func review(_ suggestion: String) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text(RichChatSessionActionStrings.reviseResultTitle)
            .font(.headline)
          Text(suggestion)
            .font(.callout.monospaced())
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(
              .quaternary,
              in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
          Text(RichChatSessionActionStrings.reviseInsertHint)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding()
      }
      HStack(spacing: 12) {
        Button {
          // Explicit insertion into the composer draft only — the suggestion
          // is never sent and never executed by Poracode.
          onInsert(suggestion)
        } label: {
          Text(RichChatSessionActionStrings.reviseInsert)
            .frame(maxWidth: .infinity)
        }
        .poracodeProminentButtonStyle()
        .disabled(isDisabled)
        Button {
          onDiscard()
        } label: {
          Text(RichChatSessionActionStrings.reviseDiscard)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
      }
      .padding()
    }
  }
}

private struct RichChatSessionActionReviseForm: View {
  let isPending: Bool
  let isDisabled: Bool
  let missingSuggestion: Bool
  let failureText: String?
  let onSubmit: (_ command: String, _ note: String) -> Void

  @State private var commandDraft = ""
  @State private var noteDraft = ""

  var body: some View {
    Form {
      Section {
        TextField(
          RichChatSessionActionStrings.reviseCommandField,
          text: $commandDraft,
          axis: .vertical
        )
        .font(.callout.monospaced())
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        TextField(
          RichChatSessionActionStrings.reviseNoteField,
          text: $noteDraft,
          axis: .vertical
        )
      } footer: {
        Text(RichChatSessionActionStrings.reviseHint)
      }
      if missingSuggestion {
        Section {
          Text(RichChatSessionActionStrings.reviseEmpty)
            .foregroundStyle(.red)
        }
      }
      if let failureText {
        Section {
          Text(failureText)
            .foregroundStyle(.red)
        }
      }
      Section {
        Button {
          submit()
        } label: {
          Text(RichChatSessionActionStrings.reviseSubmit)
            .frame(maxWidth: .infinity)
        }
        .disabled(trimmedCommand.isEmpty || isPending || isDisabled)
      }
    }
    .poracodeDrawerListStyle()
  }

  private var trimmedCommand: String {
    commandDraft.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func submit() {
    guard !trimmedCommand.isEmpty, !isPending, !isDisabled else { return }
    onSubmit(trimmedCommand, noteDraft.trimmingCharacters(in: .whitespacesAndNewlines))
  }
}
