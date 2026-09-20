import SwiftUI

struct RichChatAuthenticationSheet: View {
  let agentStatus: AgentStatusRecord
  let refresh: @MainActor () async -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var isRefreshing = false

  var body: some View {
    NavigationStack {
      List {
        RichChatAuthenticationRequiredView(
          agentStatus: agentStatus,
          isRefreshing: isRefreshing,
          refresh: refreshStatus
        )
      }
      .listStyle(.insetGrouped)
      .navigationTitle(SettingsUIStrings.authenticationMissing)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium])
  }

  private func refreshStatus() {
    guard !isRefreshing else { return }
    isRefreshing = true
    Task {
      await refresh()
      isRefreshing = false
    }
  }
}

struct RichChatInfoSheet<Content: View>: View {
  let title: String
  let content: Content
  @Environment(\.dismiss) private var dismiss

  init(title: String, @ViewBuilder content: () -> Content) {
    self.title = title
    self.content = content()
  }

  var body: some View {
    NavigationStack {
      ScrollView { content.padding() }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(RichChatStrings.cancel) { dismiss() }
          }
        }
    }
    .presentationDetents([.medium, .large])
  }
}

struct RichChatContextControlSheet: View {
  let usage: RichContextUsage?
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        Section {
          RichChatContextIndicator(usage: usage)
            .padding(.vertical, 8)
        }
      }
      .listStyle(.insetGrouped)
      .navigationTitle(RichChatStrings.contextWindow)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium])
  }
}

struct RichChatGoalControlSheet: View {
  let transcript: RichTranscriptState?
  let pendingSteer: RichPendingSteer?
  let config: [String: RichJSON]
  let conversation: RichChatConversationController
  let canOperate: Bool
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        RichChatGoalSteerView(
          items: transcript?.itemsInOrder ?? [],
          pendingSteer: pendingSteer,
          config: config,
          controller: conversation,
          canOperate: canOperate
        )
        .padding()
      }
      .navigationTitle(RichChatStrings.goal)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }
}
