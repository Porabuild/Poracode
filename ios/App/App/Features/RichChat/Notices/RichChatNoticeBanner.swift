import SwiftUI

/// Persistent history-incomplete banner for the transcript surface. It renders
/// the durable notice and, when the host reports a current unacknowledged
/// episode, one explicit acknowledgement action with a truthful lower bound.
/// It never fabricates a timeline item and never auto-acknowledges; every
/// branch comes from `RichChatNoticeController.presentation`.
struct RichChatNoticeBanner: View {
  let notice: RichChatNoticeController

  var body: some View {
    if let presentation = notice.presentation {
      VStack(alignment: .leading, spacing: 8) {
        Label(presentation.title, systemImage: "exclamationmark.triangle.fill")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.primary)
        Text(presentation.message)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
        actionView(presentation)
        if let failureText = presentation.failureText {
          Text(failureText)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .padding(.horizontal, 12)
      .padding(.top, 8)
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("native-e2e.historyNotice")
      .accessibilityLabel("\(presentation.title). \(presentation.message)")
    }
  }

  @ViewBuilder
  private func actionView(_ presentation: RichChatNoticeStrings.Presentation) -> some View {
    switch presentation.action {
    case .none:
      EmptyView()
    case .acknowledge, .retryAcknowledgement, .retryDescriptor:
      if presentation.isBusy {
        HStack(spacing: 8) {
          ProgressView()
          Text(busyLabel(presentation.action))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      } else {
        Button(label(presentation.action)) {
          perform(presentation.action)
        }
        .buttonStyle(.bordered)
        .font(.footnote.weight(.semibold))
        .accessibilityIdentifier("native-e2e.historyNotice.acknowledge")
      }
    }
  }

  private func label(_ action: RichChatNoticeStrings.Presentation.Action) -> String {
    switch action {
    case .none: return ""
    case .acknowledge: return RichChatNoticeStrings.acknowledge
    case .retryAcknowledgement, .retryDescriptor: return RichChatNoticeStrings.retry
    }
  }

  private func busyLabel(_ action: RichChatNoticeStrings.Presentation.Action) -> String {
    switch action {
    case .acknowledge: return RichChatNoticeStrings.acknowledging
    default: return RichChatNoticeStrings.retry
    }
  }

  private func perform(_ action: RichChatNoticeStrings.Presentation.Action) {
    switch action {
    case .none:
      break
    case .acknowledge:
      Task { await notice.acknowledgeCurrentEpisode() }
    case .retryAcknowledgement:
      notice.retryAfterUncertainAcknowledgement()
      Task { await notice.acknowledgeCurrentEpisode() }
    case .retryDescriptor:
      Task { await notice.refreshDescriptor() }
    }
  }
}
