import SwiftUI
import UIKit

/// PWA-aligned transcript item dispatcher. User prompts, assistant prose,
/// reasoning, and activity rows each retain a distinct native surface instead
/// of sharing one generic labeled card.
struct RichChatTranscriptItemView: View {
  let item: RichRuntimeItem
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions
  @Environment(\.richChatFindHighlight) private var find

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
          duration: nil,
          sentAtMilliseconds: actions.userMessageStarts[item.id]
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
        }
      case RichItemType.reasoning:
        RichChatReasoningRow(text: bodyText, isWorking: isWorking, disclosureID: "item:\(item.id)")
      case RichItemType.providerHandoff:
        RichChatProviderHandoffRow(item: item)
      case RichItemType.modelSwitch:
        RichChatModelSwitchRow(item: item)
      case "question_answer":
        RichChatQuestionAnswerView(
          entries: RichQuestionAnswerPresentation.entries(for: item),
          duration: nil
        )
      default:
        RichToolActivityItemView(item: item, fallbackText: bodyText, mediaController: mediaController)
      }
      }
    }
    .environment(\.richChatFindHighlight, RichChatFindHighlight(query: find.query, active: find.active, itemID: item.id))
    .accessibilityElement(children: .contain)
    .contextMenu { messageActions }
    .accessibilityActions { messageActions }
  }

  @ViewBuilder
  private var messageActions: some View {
    if let ask = actions.askInSideChat, !text.isEmpty,
      item.type == RichItemType.userMessage || item.type == RichItemType.assistantMessage {
      Button(SideChatStrings.ask, systemImage: "bubble.left.and.bubble.right") { ask(text) }
    }
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
      HStack(spacing: 0) {
        if actions.canCopy(item: item, text: text) {
          actionButton(RichChatMessageActionStrings.copy, systemImage: "doc.on.doc") {
            UIPasteboard.general.string = text
            UINotificationFeedbackGenerator().notificationOccurred(.success)
          }
        }
        if actions.canTruncate(itemID: item.id), let requestTruncate = actions.requestTruncate {
          actionButton(RichChatStrings.truncateAction, systemImage: "text.badge.minus") {
            requestTruncate(item.id)
          }
        }
        if actions.canFork(itemID: item.id),
          let anchor = actions.forkAnchorItemID(for: item.id),
          let requestFork = actions.requestFork
        {
          actionButton(RichChatMessageActionStrings.forkAction, systemImage: "arrow.triangle.branch") {
            requestFork(anchor)
          }
        }
        if actions.canCopy(item: item, text: text),
          let turn = actions.completedTurns.first(where: { $0.anchorItemID == item.id }) {
          RichChatMessageTimestamp(milliseconds: turn.endedAtMilliseconds,
            identifier: "native-e2e.assistant-message-time")
            .padding(.leading, 4)
        }
      }
      .foregroundStyle(.secondary)
    }
  }

  private var hasInlineAction: Bool {
    actions.canCopy(item: item, text: text)
      || actions.canTruncate(itemID: item.id)
      || actions.canFork(itemID: item.id)
  }

  private func actionButton(
    _ label: String, systemImage: String, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.callout)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.borderless)
    .tint(.secondary)
    .accessibilityLabel(label)
  }
}

private struct RichChatPromptMessage: View {
  let text: String
  let supplements: [RichMessageSupplementPresentation]
  let images: [RichImagePresentation]
  let mediaController: RichChatMediaController
  let duration: String?
  let sentAtMilliseconds: Int64?

  var body: some View {
    RichChatMessageSurface(kind: .prompt) {
      HStack(alignment: .top, spacing: 12) {
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
        if let sentAtMilliseconds {
          RichChatMessageTimestamp(milliseconds: sentAtMilliseconds,
            identifier: "native-e2e.user-message-time")
            .padding(.top, 2)
        }
      }
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
        if kind == .prompt {
          let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
          shape.fill(palette.contentSurface)
            .overlay { shape.strokeBorder(palette.foreground.opacity(0.03), lineWidth: 1) }
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
      ForEach(Array(supplements.enumerated()), id: \.offset) { index, supplement in
        RichChatMessageSupplementView(supplement: supplement, isAssistant: isAssistant,
          findPart: isAssistant ? nil : .supplement(index))
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
