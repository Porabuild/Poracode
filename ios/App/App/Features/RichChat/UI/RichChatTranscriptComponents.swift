import SwiftUI
import UIKit

/// PWA-aligned transcript item dispatcher. User prompts, assistant prose,
/// reasoning, and activity rows each retain a distinct native surface instead
/// of sharing one generic labeled card.
struct RichChatTranscriptItemView: View {
  let item: RichRuntimeItem
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions

  private var text: String { RichChatPresentation.text(for: item) }
  private var bodyText: String { RichChatPresentation.messageBody(for: item) }
  private var supplements: [RichMessageSupplementPresentation] {
    RichChatPresentation.messageSupplements(for: item)
  }
  private var images: [RichImagePresentation] {
    RichChatPresentation.images(for: item)
  }
  private var isWorking: Bool { item.state != .completed }

  var body: some View {
    Group {
      switch item.type {
      case RichItemType.userMessage:
        RichChatPromptMessage(
          text: bodyText,
          supplements: supplements,
          images: images,
          mediaController: mediaController,
          duration: duration
        )
      case RichItemType.assistantMessage:
        RichChatAssistantMessage(
          text: bodyText,
          supplements: supplements,
          images: images,
          mediaController: mediaController,
          duration: duration,
          isWorking: isWorking
        )
      case RichItemType.reasoning:
        RichChatReasoningRow(text: bodyText, isWorking: isWorking)
      case "question_answer":
        RichChatQuestionAnswerView(
          entries: RichQuestionAnswerPresentation.entries(for: item),
          duration: duration
        )
      default:
        RichChatActivityRow(
          title: RichChatPresentation.typeLabel(for: item),
          text: bodyText,
          systemImage: activitySystemImage,
          duration: duration,
          isWorking: isWorking
        )
      }
    }
    .contextMenu { messageActions }
    .accessibilityActions { messageActions }
  }

  private var duration: String? {
    actions.completedTurnLabel(itemID: item.id)
  }

  private var activitySystemImage: String {
    switch item.type {
    case "command_execution": "terminal"
    case "file_change": "doc.badge.gearshape"
    case "web_search": "globe"
    case "image_view": "photo"
    default: "wrench.and.screwdriver"
    }
  }

  @ViewBuilder
  private var messageActions: some View {
    if actions.canCopy(item: item, text: text) {
      Button(RichChatMessageActionStrings.copy, systemImage: "doc.on.doc") {
        UIPasteboard.general.string = text
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      }
    }
    if let plan = actions.revertPlan(itemID: item.id),
      let requestRevert = actions.requestRevert
    {
      Button(
        RichChatMessageActionStrings.revertAction,
        systemImage: "arrow.uturn.backward"
      ) {
        requestRevert(plan)
      }
    }
    if actions.canTruncate(itemID: item.id), let requestTruncate = actions.requestTruncate {
      Button(RichChatStrings.truncateAction, systemImage: "scissors", role: .destructive) {
        requestTruncate(item.id)
      }
      .accessibilityLabel(RichChatStrings.truncateAccessibilityLabel)
    }
  }
}

private struct RichChatPromptMessage: View {
  let text: String
  let supplements: [RichMessageSupplementPresentation]
  let images: [RichImagePresentation]
  let mediaController: RichChatMediaController
  let duration: String?

  var body: some View {
    RichChatMessageSurface(kind: .prompt) {
      RichChatMessageContent(
        text: text,
        role: .body,
        collapses: true,
        rendersMarkdown: false,
        supplements: supplements,
        images: images,
        mediaController: mediaController,
        duration: duration
      )
    }
  }
}

private struct RichChatAssistantMessage: View {
  let text: String
  let supplements: [RichMessageSupplementPresentation]
  let images: [RichImagePresentation]
  let mediaController: RichChatMediaController
  let duration: String?
  let isWorking: Bool

  var body: some View {
    RichChatMessageSurface(kind: .assistant) {
      if text.isEmpty && supplements.isEmpty && images.isEmpty && isWorking {
        ProgressView()
          .controlSize(.mini)
          .tint(.secondary)
          .accessibilityLabel(RichChatStrings.working)
      } else {
        RichChatMessageContent(
          text: text,
          role: .body,
          collapses: false,
          rendersMarkdown: true,
          supplements: supplements,
          images: images,
          mediaController: mediaController,
          duration: duration
        )
      }
    }
  }
}

enum RichChatMessageSurfaceKind {
  case prompt
  case assistant
}

struct RichChatMessageSurface<Content: View>: View {
  let kind: RichChatMessageSurfaceKind
  @ViewBuilder let content: () -> Content

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme

  var body: some View {
    content()
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 12)
      .padding(.vertical, 9)
      .background {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(kind == .prompt ? palette.surface : .clear)
          .overlay {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
              .stroke(kind == .prompt ? palette.border.opacity(0.7) : .clear, lineWidth: 0.5)
          }
      }
  }

  private var palette: PoracodeThemeVariant {
    theme.variant(for: colorScheme)
  }
}

private struct RichChatMessageContent: View {
  let text: String
  let role: PoracodeChatTextRole
  let collapses: Bool
  let rendersMarkdown: Bool
  let supplements: [RichMessageSupplementPresentation]
  let images: [RichImagePresentation]
  let mediaController: RichChatMediaController
  let duration: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      if !text.isEmpty {
        if rendersMarkdown {
          RichChatMarkdownView(source: text)
        } else {
          RichChatMessageText(
            text: RichChatAttributedText.presentation(text),
            role: role,
            collapses: collapses
          )
        }
      }
      ForEach(Array(supplements.enumerated()), id: \.offset) { _, supplement in
        RichChatMessageSupplementView(supplement: supplement)
      }
      ForEach(images) { source in
        RichChatImageView(source: source, controller: mediaController)
      }
      if let duration {
        Text(duration)
          .poracodeChatText(.metadata)
          .foregroundStyle(.tertiary)
          .padding(.top, 40)
      }
    }
  }
}
