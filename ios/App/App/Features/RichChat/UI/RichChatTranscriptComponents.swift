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
      if let app = RichMcpAppPresentation(item: item) {
        RichChatMcpAppView(app: app, actions: actions, fallback: bodyText).id(item.id)
      } else {
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
        VStack(alignment: .leading, spacing: 2) {
          RichChatAssistantMessage(
            text: bodyText,
            supplements: supplements,
            images: images,
            mediaController: mediaController,
            duration: nil,
            isWorking: isWorking
          )
          assistantActionRow
          // PWA order: action row, then the turn's "Worked for" footer.
          if let duration {
            Text(duration)
              .poracodeChatText(.metadata)
              .foregroundStyle(.secondary)
              .padding(.top, 2)
          }
        }
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
          icon: activityIcon,
          duration: duration,
          isWorking: isWorking
        )
      }
      }
    }
    .contextMenu { messageActions }
    .accessibilityActions { messageActions }
  }

  private var duration: String? {
    actions.completedTurnLabel(itemID: item.id)
  }

  private var activityIcon: RichChatIcon.Kind {
    RichChatIcon.Kind(category: RichChatActivityGroupSummary.category(for: item))
  }

  @ViewBuilder
  private var messageActions: some View {
    if actions.canCopy(item: item, text: text) {
      Button {
        UIPasteboard.general.string = text
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      } label: {
        Label { Text(RichChatMessageActionStrings.copy) } icon: { RichChatIcon(.copy) }
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
      Button(role: .destructive) {
        requestTruncate(item.id)
      } label: {
        Label { Text(RichChatStrings.truncateAction) } icon: { RichChatIcon(.truncate) }
      }
      .accessibilityLabel(RichChatStrings.truncateAccessibilityLabel)
    }
  }

  /// Compact inline action row under a completed assistant reply, mirroring the
  /// PWA's copy / truncate / fork affordances. The same gating as the
  /// long-press menu applies, so truncate is never offered on the last item.
  @ViewBuilder
  private var assistantActionRow: some View {
    if !isWorking, hasInlineAction {
      HStack(spacing: 14) {
        if actions.canCopy(item: item, text: text) {
          actionButton(RichChatMessageActionStrings.copy, icon: .copy) {
            UIPasteboard.general.string = text
            UINotificationFeedbackGenerator().notificationOccurred(.success)
          }
        }
        if actions.canTruncate(itemID: item.id), let requestTruncate = actions.requestTruncate {
          actionButton(RichChatStrings.truncateAction, icon: .truncate) {
            requestTruncate(item.id)
          }
        }
        if actions.canFork(itemID: item.id),
          let anchor = actions.forkAnchorItemID(for: item.id),
          let requestFork = actions.requestFork
        {
          actionButton(RichChatMessageActionStrings.forkAction, icon: .fork) {
            requestFork(anchor)
          }
        }
      }
      .font(.caption)
      .foregroundStyle(.secondary)
      .padding(.leading, 4)
      .padding(.top, 1)
    }
  }

  private var hasInlineAction: Bool {
    actions.canCopy(item: item, text: text)
      || actions.canTruncate(itemID: item.id)
      || actions.canFork(itemID: item.id)
  }

  private func actionButton(
    _ label: String, icon: RichChatIcon.Kind, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      RichChatIcon(icon)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
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
        rendersVisuals: false,
        isAssistant: false,
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
          rendersVisuals: !isWorking,
          isAssistant: true,
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
  /// Settled replies render `poracode-html` fences as sandboxed previews.
  let rendersVisuals: Bool
  let isAssistant: Bool
  let supplements: [RichMessageSupplementPresentation]
  let images: [RichImagePresentation]
  let mediaController: RichChatMediaController
  let duration: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      if !text.isEmpty {
        if rendersMarkdown,
          let blocks = RichInlineVisualParser.blocks(for: text, settled: rendersVisuals)
        {
          RichChatInlineVisualBlocksView(blocks: blocks)
        } else if rendersMarkdown {
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
        RichChatMessageSupplementView(supplement: supplement, isAssistant: isAssistant)
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
