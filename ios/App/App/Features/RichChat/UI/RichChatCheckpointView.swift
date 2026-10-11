import SwiftUI

private enum RichChatCheckpointPresentation: String, Identifiable {
  case checkpoints
  var id: String { rawValue }
}

struct RichChatCheckpointView: View {
  let projectLocation: ProjectLocation
  let config: [String: RichJSON]
  let controller: RichChatCheckpointController
  let conversation: RichChatConversationController
  let canOperate: Bool

  @State private var presentation: RichChatCheckpointPresentation?

  var body: some View {
    Button {
      presentation = .checkpoints
    } label: {
      Label(
        RichChatStrings.checkpoints,
        systemImage: "clock.arrow.trianglehead.counterclockwise.rotate.90"
      )
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.bordered)
    .disabled(controller.state.activeMutation != nil)
    .sheet(item: $presentation) { _ in
      RichChatCheckpointSheet(
        projectLocation: projectLocation,
        config: config,
        controller: controller,
        conversation: conversation,
        canOperate: canOperate
      )
    }
  }
}

struct RichChatCheckpointSheet: View {
  let projectLocation: ProjectLocation
  let config: [String: RichJSON]
  let controller: RichChatCheckpointController
  let conversation: RichChatConversationController
  let canOperate: Bool

  @Environment(\.dismiss) private var dismiss
  @State private var confirmation: Confirmation?

  private enum Confirmation: Identifiable {
    case restore(RichCheckpoint)
    case rollback

    var id: String {
      switch self {
      case .restore(let checkpoint): "restore:\(checkpoint.id)"
      case .rollback: "rollback"
      }
    }
  }

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(RichChatStrings.checkpoints)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(RichChatStrings.cancel) { dismiss() }
          }
          ToolbarItem(placement: .topBarTrailing) {
            Button(RichChatStrings.refreshCheckpoints, systemImage: "arrow.clockwise") {
              Task { await controller.load(projectLocation: projectLocation) }
            }
            .labelStyle(.iconOnly)
          }
        }
    }
    .task { await controller.load(projectLocation: projectLocation) }
    .confirmationDialog(
      confirmationTitle,
      isPresented: Binding(
        get: { confirmation != nil },
        set: { if !$0 { confirmation = nil } }
      ),
      titleVisibility: .visible
    ) {
      confirmationButtons
      Button(RichChatStrings.cancel, role: .cancel) { confirmation = nil }
    } message: {
      Text(confirmationMessage)
    }
  }

  @ViewBuilder
  private var content: some View {
    switch controller.state.loadState {
    case .idle, .loading:
      LoadingStateView(message: RichChatStrings.loadingCheckpoints)
    case .empty:
      ContentUnavailableView(RichChatStrings.noCheckpoints, systemImage: "clock.badge.xmark")
    case .failed(let failure):
      ErrorStateView(message: RichChatStrings.failure(failure), retryTitle: RichChatStrings.retry) {
        Task { await controller.load(projectLocation: projectLocation) }
      }
    case .loaded:
      checkpointList
    }
  }

  @ViewBuilder
  private var confirmationButtons: some View {
    switch confirmation {
    case .restore(let checkpoint):
      Button(RichChatStrings.restoreFiles, role: .destructive) {
        Task { await controller.restore(itemID: checkpoint.id, projectLocation: projectLocation) }
        confirmation = nil
      }
      .disabled(!canOperate)
    case .rollback:
      Button(RichChatStrings.rollback, role: .destructive) {
        Task { await conversation.rollback(turnCount: 1, config: config) }
        confirmation = nil
      }
      .disabled(!canOperate)
    case nil:
      EmptyView()
    }
  }

  private var checkpointList: some View {
    List {
      ForEach(checkpoints) { checkpoint in
        VStack(alignment: .leading, spacing: 4) {
          Text(checkpoint.isTurn ? RichChatStrings.turnCheckpoint : RichChatStrings.fileCheckpoint)
            .font(.body.weight(.medium))
          Text(checkpoint.capturedAt).font(.caption).foregroundStyle(.secondary)
          if let count = checkpoint.changedFiles?.count {
            Text(changedFilesText(count)).font(.caption2).foregroundStyle(.secondary)
          }
        }
        .swipeActions {
          Button(RichChatStrings.restoreFiles, role: .destructive) {
            confirmation = .restore(checkpoint)
          }
          .disabled(!canOperate)
        }
      }
      Section {
        Button(RichChatStrings.rollbackOneTurn, role: .destructive) {
          confirmation = .rollback
        }
        .disabled(!canOperate)
      }
    }
    .listStyle(.insetGrouped)
  }

  private var checkpoints: [RichCheckpoint] {
    var seen: Set<String> = []
    return (controller.state.collection.turns + controller.state.collection.checkpoints)
      .filter { seen.insert($0.id).inserted }
      .sorted { $0.capturedAt > $1.capturedAt }
  }

  private var confirmationTitle: String {
    switch confirmation {
    case .restore: RichChatStrings.restoreTitle
    case .rollback: RichChatStrings.rollbackTitle
    case nil: ""
    }
  }

  private var confirmationMessage: String {
    switch confirmation {
    case .restore: RichChatStrings.restoreMessage
    case .rollback: RichChatStrings.rollbackMessage
    case nil: ""
    }
  }

  private func changedFilesText(_ count: Int) -> String {
    let format = RichChatStrings.value("rich_chat_changed_files_count", "%lld changed files")
    return String(format: format, locale: .current, Int64(count))
  }
}
