import SwiftUI

struct RichChatGoalSteerView: View {
  let items: [RichRuntimeItem]
  let pendingSteer: RichPendingSteer?
  let config: [String: RichJSON]
  let controller: RichChatConversationController
  let canOperate: Bool

  @State private var editor: Editor?
  @State private var draft = ""

  enum Editor: String, Identifiable {
    case goal
    case steer
    var id: String { rawValue }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let goal = RichChatPresentation.latestGoal(in: items) {
        goalCard(goal)
      }
      steerCard
    }
    .sheet(item: $editor) { editor in
      NavigationStack {
        Form {
          TextField(
            editor == .goal ? RichChatStrings.goalObjective : RichChatStrings.steerMessage,
            text: $draft,
            axis: .vertical
          )
          .lineLimit(3...8)
        }
        .navigationTitle(editor == .goal ? RichChatStrings.editGoal : RichChatStrings.editSteer)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(RichChatStrings.cancel) { self.editor = nil }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button(RichChatStrings.save) { save(editor) }
              .disabled(
                !canOperate || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              )
          }
        }
      }
      .presentationDetents([.medium, .large])
    }
  }

  private func goalCard(_ goal: RichGoalPresentation) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack {
        Label(RichChatStrings.goal, systemImage: "scope")
          .font(.subheadline.weight(.semibold))
        Spacer()
        Text(RichChatStrings.goalStatus(goal.status)).font(.caption).foregroundStyle(.secondary)
      }
      Text(goal.objective)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 6) {
          if goal.availableActions.contains("edit") {
            Button(RichChatStrings.editGoal) {
              draft = goal.objective
              editor = .goal
            }
          }
          if goal.availableActions.contains("pause") {
            Button(RichChatStrings.pauseGoal) { updateGoal(.pause) }
          }
          if goal.availableActions.contains("resume") {
            Button(RichChatStrings.resumeGoal) { updateGoal(.resume) }
          }
          if goal.availableActions.contains("clear") {
            Button(RichChatStrings.clearGoal, role: .destructive) { updateGoal(.clear) }
          }
        }
        .buttonStyle(.bordered)
        .disabled(!canOperate)
      }
    }
    .padding(12)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private var steerCard: some View {
    VStack(alignment: .leading, spacing: 7) {
      Label(RichChatStrings.pendingSteer, systemImage: "arrow.triangle.branch")
        .font(.subheadline.weight(.semibold))
      Text(pendingSteer?.prompt ?? RichChatStrings.noPendingSteer)
        .foregroundStyle(pendingSteer == nil ? .secondary : .primary)
      HStack {
        Button(pendingSteer == nil ? RichChatStrings.addSteer : RichChatStrings.editSteer) {
          draft = pendingSteer?.prompt ?? ""
          editor = .steer
        }
        if pendingSteer != nil {
          Button(RichChatStrings.clearSteer, role: .destructive) {
            Task { await controller.clearPendingSteer() }
          }
        }
      }
      .buttonStyle(.bordered)
      .disabled(!canOperate)
    }
    .padding(12)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private func updateGoal(_ update: RichChatGoalUpdate) {
    Task { await controller.updateGoal(update) }
  }

  private func save(_ editor: Editor) {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    self.editor = nil
    Task {
      switch editor {
      case .goal:
        await controller.updateGoal(.edit(objective: text))
      case .steer:
        await controller.setPendingSteer(
          RichSetPendingSteerInput(prompt: text, segments: nil, config: config)
        )
      }
    }
  }
}
