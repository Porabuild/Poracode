import SwiftUI

/// The complete body belongs to its expanded row, not a second transcript or
/// persistent cache. Collapsing or retiring the row releases the large value.
struct RichDeferredHistoryItemRead<Content: View>: View {
  let item: RichRuntimeItem
  let expanded: Bool
  let content: (RichRuntimeItem) -> Content
  @Environment(\.runtimeItemHeadings) private var reader
  @State private var loaded: Loaded?
  @State private var failure: RichChatControllerFailure?
  @State private var attempt = 0

  private struct Loaded {
    let source: RichRuntimeItem
    let target: RichChatThreadTarget
    let item: RichRuntimeItem
  }
  private struct Work: Equatable {
    let source: RichRuntimeItem?
    let target: RichChatThreadTarget?
    let readable: Bool
    let expanded: Bool
    let attempt: Int
  }

  var body: some View {
    let accepted = expanded && loaded?.source == item && loaded?.target == reader?.target ? loaded?.item : nil
    VStack(alignment: .leading, spacing: 4) {
      content(accepted ?? item)
      if expanded, item.detailsDeferred, accepted == nil {
        if let failure {
          HStack(alignment: .center, spacing: 8) {
            Text(RichChatStrings.failure(failure)).foregroundStyle(.secondary)
            Button(RichChatStrings.retry) { attempt += 1 }
              .frame(minWidth: 44, minHeight: 44)
              .accessibilityIdentifier("native-e2e.history-details.retry.\(item.id)")
          }
          .poracodeChatText(.metadata)
          .padding(.leading, 16)
        } else {
          ProgressView().controlSize(.small)
            .accessibilityLabel(StateViewStrings.loading)
            .accessibilityIdentifier("native-e2e.history-details.loading.\(item.id)")
            .padding(.leading, 16)
        }
      }
    }
    .task(id: Work(source: item.detailsDeferred ? item : nil, target: reader?.target, readable: reader?.canReadAdvisory == true,
      expanded: expanded, attempt: attempt)) {
      loaded = nil; failure = nil
      guard expanded, item.detailsDeferred else { return }
      guard let reader, reader.canReadAdvisory, let target = reader.target else {
        failure = .unavailable; return
      }
      do {
        let complete = try await reader.readHistoryItem(item)
        try Task.checkCancellation()
        loaded = .init(source: item, target: target, item: complete)
      } catch is CancellationError {
        // An authority fence may retire a read without cancelling this view's
        // task. Keep an explicit retry instead of leaving a permanent spinner.
        if !Task.isCancelled { failure = .unavailable }
      }
      catch { if !Task.isCancelled { failure = .map(error) } }
    }
    .onDisappear { loaded = nil }
  }
}
