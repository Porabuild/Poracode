import SwiftUI

struct RichChatGoalSteerView: View {
  let items: [RichRuntimeItem]
  let pendingSteer: RichPendingSteer?
  let config: [String: RichJSON]
  let controller: RichChatConversationController
  let canOperate: Bool
  var showsEmptySteerCard = false
  var embedded = false

  @State private var editor: Editor?

  enum Editor: Identifiable {
    case goal(String)
    case steer(String)
    var id: String { isGoal ? "goal" : "steer" }
    var isGoal: Bool { if case .goal = self { return true }; return false }
    var initialText: String {
      switch self { case .goal(let text), .steer(let text): text }
    }
  }

  var body: some View {
    let goal = RichChatPresentation.latestGoal(in: items)
    if goal != nil || pendingSteer != nil || showsEmptySteerCard {
      VStack(alignment: .leading, spacing: 8) {
        if let goal {
          goalCard(goal)
        }
        if pendingSteer != nil || showsEmptySteerCard {
          steerCard
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .sheet(item: $editor) { editor in
        RichChatGoalEditorSheet(editor: editor, controller: controller, config: config, canOperate: canOperate)
      }
    }
  }

  private func goalCard(_ goal: RichGoalPresentation) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      if !embedded {
      HStack {
        Label { Text(RichChatStrings.goal) } icon: { RichChatGoalStatusIcon(status: goal.status) }
          .poracodeChatText(.metadata, weight: .semibold)
        Spacer()
        Text(RichChatStrings.goalStatus(goal.status))
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
      }
      }
      Text(goal.objective)
        .poracodeChatText(.body)
      RichChatGoalMetadata(goal: goal)
      if let reason = goal.lastReason, !reason.isEmpty {
        Text(reason).poracodeChatText(.metadata).foregroundStyle(.secondary).textSelection(.enabled)
      }
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 6) {
          if goal.availableActions.contains("edit") {
            goalAction(RichChatStrings.editGoal, systemImage: "pencil") {
              editor = .goal(goal.objective)
            }
          }
          if goal.availableActions.contains("pause") {
            goalAction(RichChatStrings.pauseGoal, systemImage: "pause") { updateGoal(.pause) }
          }
          if goal.availableActions.contains("resume") {
            goalAction(RichChatStrings.resumeGoal, systemImage: "play") { updateGoal(.resume) }
          }
          if goal.availableActions.contains("clear") {
            goalAction(RichChatStrings.clearGoal, systemImage: "xmark", color: .red) { updateGoal(.clear) }
          }
        }
        .disabled(!canOperate || controller.state.activeMutation != nil)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeContentCardBackground(enabled: !embedded)
  }

  private var steerCard: some View {
    VStack(alignment: .leading, spacing: 7) {
      if !embedded {
        Label(RichChatStrings.pendingSteer, systemImage: "arrow.triangle.branch")
          .poracodeChatText(.metadata, weight: .semibold)
      }
      Text(pendingSteer?.prompt ?? RichChatStrings.noPendingSteer)
        .poracodeChatText(.body)
        .foregroundStyle(pendingSteer == nil ? .secondary : .primary)
      HStack(spacing: 8) {
        Button(pendingSteer == nil ? RichChatStrings.addSteer : RichChatStrings.editSteer) {
          editor = .steer(pendingSteer?.prompt ?? "")
        }
        if pendingSteer != nil {
          Button(RichChatStrings.clearSteer, role: .destructive) {
            Task { await controller.clearPendingSteer() }
          }
          .tint(.red)
        }
      }
      .controlSize(.small)
      .poracodeSurfaceButtonStyle()
      .disabled(!canOperate)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeContentCardBackground(enabled: !embedded)
  }

  private func updateGoal(_ update: RichChatGoalUpdate) {
    Task { await controller.updateGoal(update) }
  }

  private func goalAction(
    _ title: String, systemImage: String, color: Color = .secondary,
    action: @escaping () -> Void
  ) -> some View {
    PoracodeCircleButton(color: color, size: 30, action: action) {
      Image(systemName: systemImage).font(.callout)
    }
    .accessibilityLabel(title)
  }

 }

private struct RichChatGoalMetadata: View {
  let goal: RichGoalPresentation

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 12) {
          budget
          checks
          elapsed(at: context.date)
        }
        .fixedSize(horizontal: true, vertical: false)
        VStack(alignment: .leading, spacing: 4) {
          budget
          HStack(spacing: 12) {
            checks
            elapsed(at: context.date)
          }
        }
      }
      .poracodeChatText(.metadata)
      .foregroundStyle(.secondary)
    }
  }

  @ViewBuilder private var budget: some View {
    if let used = goal.tokensUsed {
      Text(goal.tokenBudget.map { RichChatStrings.contextTokens(used: used, maxTokens: $0) }
        ?? "\(used.formatted()) \(SettingsUIStrings.tokensTitle)")
    }
  }

  @ViewBuilder private var checks: some View {
    if let iterations = goal.iterations, iterations > 0 {
      Text("\(PullRequestsStrings.checks): \(iterations.formatted())")
    }
  }

  @ViewBuilder private func elapsed(at now: Date) -> some View {
    if let elapsed = goal.elapsedSeconds(at: now) {
      Text(RichBackgroundTaskElapsed.compactText(
        startedAtMilliseconds: (now.timeIntervalSince1970 - elapsed) * 1_000, now: now
      )).monospacedDigit()
    }
  }
}

private struct RichChatGoalEditorSheet: View {
  let editor: RichChatGoalSteerView.Editor
  let controller: RichChatConversationController
  let config: [String: RichJSON]
  let canOperate: Bool
  @Environment(\.dismiss) private var dismiss
  @State private var draft: String

  init(editor: RichChatGoalSteerView.Editor, controller: RichChatConversationController, config: [String: RichJSON], canOperate: Bool) {
    self.editor = editor
    self.controller = controller
    self.config = config
    self.canOperate = canOperate
    _draft = State(initialValue: editor.initialText)
  }

  var body: some View {
    NavigationStack {
      Form {
        TextField(editor.isGoal ? RichChatStrings.goalObjective : RichChatStrings.steerMessage, text: $draft, axis: .vertical)
          .lineLimit(3...8)
          .disabled(controller.state.activeMutation != nil)
          .accessibilityIdentifier("native-e2e.goal-editor")
        if let failure = controller.state.failure {
          Text(RichChatStrings.failure(failure)).foregroundStyle(.red)
        }
      }
      .navigationTitle(editor.isGoal ? RichChatStrings.editGoal : RichChatStrings.editSteer)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatStrings.save, action: save)
            .disabled(!canOperate || controller.state.activeMutation != nil || normalized.isEmpty || normalized == editor.initialText)
            .accessibilityIdentifier("native-e2e.goal-editor-save")
        }
      }
    }
    .poracodeFormSheetSizing()
    .presentationDetents([.medium, .large])
    .interactiveDismissDisabled(controller.state.activeMutation != nil)
  }

  private var normalized: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

  private func save() {
    let text = normalized
    Task {
      let succeeded: Bool
      switch editor {
      case .goal: succeeded = await controller.updateGoal(.edit(objective: text))
      case .steer:
        succeeded = await controller.setPendingSteer(RichSetPendingSteerInput(prompt: text, segments: nil, config: config))
      }
      if succeeded { dismiss() }
    }
  }
}
