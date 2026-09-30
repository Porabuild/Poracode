import SwiftUI

struct RichChatQuestionAnswerView: View {
  let entries: [RichQuestionAnswerEntry]
  let duration: String?

  var body: some View {
    RichChatMessageSurface(kind: .prompt) {
      VStack(alignment: .leading, spacing: 9) {
        ForEach(entries) { entry in
          RichChatQuestionAnswerEntryView(entry: entry)
            .padding(.top, entry.id == entries.first?.id ? 0 : 9)
            .overlay(alignment: .top) {
              if entry.id != entries.first?.id {
                Divider()
              }
            }
        }
        if let duration {
          Text(duration)
            .poracodeChatText(.metadata)
            .foregroundStyle(.tertiary)
        }
      }
    }
  }
}

private struct RichChatQuestionAnswerEntryView: View {
  let entry: RichQuestionAnswerEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      if !entry.header.isEmpty, entry.header != entry.question {
        Text(entry.header.uppercased())
          .poracodeChatText(.metadata, weight: .semibold)
          .foregroundStyle(.secondary)
      }
      if !entry.question.isEmpty {
        Text(entry.question)
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
      }
      ForEach(entry.selected) { selection in
        HStack(alignment: .top, spacing: 7) {
          Image(systemName: "checkmark")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(width: 14)
          VStack(alignment: .leading, spacing: 2) {
            Text(selection.label)
              .poracodeChatText(.body, weight: .medium)
            if let description = selection.description, !description.isEmpty {
              Text(description)
                .poracodeChatText(.metadata)
                .foregroundStyle(.secondary)
            }
          }
        }
      }
      if let customAnswer = entry.customAnswer, !customAnswer.isEmpty {
        RichChatMessageText(
          text: RichChatAttributedText.presentation(customAnswer),
          role: .body,
          collapses: false
        )
        .padding(.leading, 9)
        .overlay(alignment: .leading) {
          Rectangle()
            .fill(.quaternary)
            .frame(width: 2)
        }
      }
    }
  }
}
