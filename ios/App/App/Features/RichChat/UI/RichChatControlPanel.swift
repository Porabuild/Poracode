import SwiftUI

struct RichChatControlPanel: View {
  let suite: RichChatControllerSuite
  let projectLocation: ProjectLocation?
  let config: [String: RichJSON]
  let canOperate: Bool
  let canResolveRequests: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      RichChatContextIndicator(usage: suite.transcript.state.contextUsage)
      if let transcript = suite.transcript.state.transcript {
        RichChatRequestsView(
          requests: transcript.openRequests,
          controller: suite.requests,
          canResolve: canResolveRequests
        )
        RichChatGoalSteerView(
          items: transcript.itemsInOrder,
          pendingSteer: suite.transcript.state.pendingSteer,
          config: config,
          controller: suite.conversation,
          canOperate: canOperate
        )
      }
      if let projectLocation {
        RichChatCheckpointView(
          projectLocation: projectLocation,
          config: config,
          controller: suite.checkpoints,
          conversation: suite.conversation,
          canOperate: canOperate
        )
      }
    }
  }
}

/// Authoritative context-window occupancy for the selected thread. Renders only
/// when the desktop reported a usable window; it never estimates token counts.
struct RichChatContextIndicator: View {
  let usage: RichContextUsage?

  var body: some View {
    if let summary = RichChatPresentation.contextUsage(usage) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 8) {
          Text(RichChatStrings.contextWindow).font(.footnote)
          Spacer(minLength: 0)
          Text(headline(summary))
            .font(.footnote.monospacedDigit())
            .foregroundStyle(.secondary)
        }
        if let percent = summary.percent {
          ProgressView(value: Double(percent), total: 100)
            .progressViewStyle(.linear)
        }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(RichChatStrings.contextWindow)
      .accessibilityValue(accessibilityValue(summary))
    }
  }

  private func headline(_ summary: RichContextUsagePresentation) -> String {
    guard let percent = summary.percent else { return RichChatStrings.contextUsageUnknown }
    return RichChatStrings.contextPercent(percent)
  }

  private func accessibilityValue(_ summary: RichContextUsagePresentation) -> String {
    guard let percent = summary.percent, let used = summary.usedTokens else {
      return RichChatStrings.contextUsageUnknown
    }
    let tokens = RichChatStrings.contextTokens(used: used, maxTokens: summary.maxTokens)
    return "\(RichChatStrings.contextPercent(percent)), \(tokens)"
  }
}

struct RichChatStatusView: View {
  let suite: RichChatControllerSuite
  let canOperate: Bool

  var body: some View {
    VStack(spacing: 0) {
      if let failure = displayedFailure {
        Label(RichChatStrings.failure(failure), systemImage: "exclamationmark.triangle")
          .font(.footnote)
          .foregroundStyle(.red)
          .padding(.horizontal, 16)
          .padding(.vertical, 6)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      if needsRefresh {
        HStack {
          Text(RichChatStrings.refreshRequired).font(.footnote)
          Spacer()
          Button(RichChatStrings.retry) {
            Task { await suite.refreshAuthoritativeHistory() }
          }
          .buttonStyle(.bordered)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
      }
      if !canOperate {
        Label(RichChatStrings.readOnly, systemImage: "lock")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .padding(.horizontal, 16)
          .padding(.vertical, 6)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  private var displayedFailure: RichChatControllerFailure? {
    suite.conversation.state.failure
      ?? suite.requests.state.failure
      ?? suite.media.state.failure
      ?? suite.checkpoints.state.failure
      ?? suite.transcript.state.pageFailure
  }

  private var needsRefresh: Bool {
    suite.requiresAuthoritativeRefresh
  }
}
