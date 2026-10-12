import SwiftUI

/// State projection for a thread transcript. The page supplies domain inputs;
/// this view owns loading, empty, failure, and loaded presentation branches.
struct RichChatTranscriptSurface: View {
  let controller: RichChatTranscriptController
  let notice: RichChatNoticeController
  let mediaController: RichChatMediaController
  let conversation: RichChatConversationController
  let checkpointController: RichChatCheckpointController
  let projectLocation: ProjectLocation?
  let config: [String: RichJSON]
  let sharedTreeThreadCount: Int
  let allowsCheckpointRevert: Bool
  let canOperate: Bool
  let retry: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      // The durable notice is persistent state, not a transcript row: it stays
      // above the surface across pagination, live appends, resets and
      // reconnects, and is never rendered as a timeline item.
      RichChatNoticeBanner(notice: notice)
      content
    }
  }

  @ViewBuilder
  private var content: some View {
    switch controller.state.loadState {
    case .idle, .loading:
      LoadingStateView(message: RichChatStrings.loadingTranscript)
    case .empty:
      ContentUnavailableView {
        Label(RichChatStrings.emptyTranscript, systemImage: "text.bubble")
      } description: {
        Text(RichChatStrings.emptyTranscriptMessage)
      }
    case .failed(let failure):
      ErrorStateView(
        message: RichChatStrings.failure(failure),
        retryTitle: RichChatStrings.retry,
        retry: retry
      )
    case .loaded:
      RichChatTimelineView(
        controller: controller,
        mediaController: mediaController,
        conversation: conversation,
        checkpointController: checkpointController,
        projectLocation: projectLocation,
        config: config,
        sharedTreeThreadCount: sharedTreeThreadCount,
        allowsCheckpointRevert: allowsCheckpointRevert,
        canOperate: canOperate,
        isRefreshing: false
      )
    }
  }
}
