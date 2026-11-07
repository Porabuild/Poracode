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

struct RichChatBackgroundTasksSheet: View {
  let suite: RichChatControllerSuite
  let canOperate: Bool
  @Environment(\.dismiss) private var dismiss
  @State private var selection: RichChatBackgroundTaskSelection?
  /// Persistent across details close/reopen so the reader can reuse its single
  /// in-flight transport attempt.
  @State private var reader: RichChatBackgroundTaskDetailsController

  init(suite: RichChatControllerSuite, canOperate: Bool) {
    self.suite = suite
    self.canOperate = canOperate
    _selection = State(initialValue: nil)
    _reader = State(
      initialValue: RichChatBackgroundTaskDetailsController(
        sessionActions: suite.sessionActions
      )
    )
  }

  private var tasks: [RichBackgroundTaskPresentation] {
    (suite.transcript.state.backgroundTasks ?? []).map(RichBackgroundTaskPresentation.init)
  }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        if tasks.isEmpty {
          Color.clear
        } else {
          List {
            ForEach(tasks) { task in
              RichChatBackgroundTaskRow(task: task) {
                selection = RichChatBackgroundTaskSelection(taskID: task.id)
              }
              .listRowBackground(Color.clear)
            }
          }
          .listStyle(.insetGrouped)
        }
      }
      .navigationTitle(RichChatStrings.backgroundTasks)
      .navigationBarTitleDisplayMode(.inline)
      .sheet(item: $selection) { selection in
        RichChatBackgroundTaskDetailsView(
          suite: suite,
          taskID: selection.taskID,
          canOperate: canOperate,
          reader: reader
        )
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.done) { dismiss() }
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("background-tasks-panel")
      .onChange(of: tasks.map(\.id)) { _, ids in
        if ids.isEmpty { dismiss() }
        if let selected = selection, !ids.contains(selected.taskID) { selection = nil }
      }
    }
    .presentationDetents([.medium, .large])
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
