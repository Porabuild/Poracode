import SwiftUI

/// Compact dock strip for the thread's follow-up queue. The strip summarizes;
/// management (reorder/edit/remove/steer/pause/resume) happens in the native
/// sheet, mirroring the pending-steer strip → goal-sheet pattern.
struct RichFollowUpQueueStrip: View {
  let queue: RichFollowUpQueue
  let canOperate: Bool
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(alignment: .center, spacing: 9) {
        Image(systemName: "arrow.triangle.branch")
          .foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 2) {
          Text(RichChatStrings.queueTitle(queue.items.count))
            .font(.caption.weight(.semibold))
          if let preview = queue.items.first?.prompt, !queue.paused {
            Text(preview)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
        Spacer(minLength: 4)
        if queue.paused {
          Text(RichChatStrings.queuePausedShort)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .padding(.horizontal, 12)
    }
    .buttonStyle(.plain)
    .disabled(!canOperate && queue.items.isEmpty && !queue.paused)
    .accessibilityLabel(RichChatStrings.queueTitle(queue.items.count))
  }
}

/// Native management surface: swipe actions per row (move up/down map to the
/// wire's `beforeId` anchor, trailing removes), steer-now and edit on the
/// leading edge. Editing is pause-first — the server rejects
/// `expectedStagedAt` edits on unpaused records — and the edit rides the
/// original segments along (the server rebuilds the item from the payload
/// alone).
struct RichFollowUpQueueSheet: View {
  @Environment(\.dismiss) private var dismiss
  let queue: RichFollowUpQueue
  let conversation: RichChatConversationController
  let canOperate: Bool

  @State private var editingItem: RichPendingSteer?
  @State private var editingDraft = ""
  @State private var presentsEditor = false

  var body: some View {
    NavigationStack {
      List {
        if queue.paused {
          Section {
            RichFollowUpQueuePausedBanner(queue: queue, conversation: conversation)
              .listRowBackground(Color.clear)
              .listRowInsets(EdgeInsets())
          }
        }
        Section {
          ForEach(Array(queue.items.enumerated()), id: \.element.id) { index, item in
            RichFollowUpQueueRow(
              item: item,
              canOperate: canOperate,
              isFirst: index == 0,
              isLast: index == queue.items.count - 1,
              steer: { Task { await conversation.steerQueuedFollowUp(id: item.id) } },
              edit: { beginEditing(item) },
              moveUp: {
                Task {
                  await conversation.reorderQueuedFollowUp(
                    id: item.id, beforeID: queue.items[index - 1].id)
                }
              },
              moveDown: {
                Task {
                  let after = queue.items.indices.contains(index + 2)
                    ? queue.items[index + 2].id : nil
                  await conversation.reorderQueuedFollowUp(id: item.id, beforeID: after)
                }
              }
            )
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
              Button(role: .destructive) {
                Task { await conversation.removeQueuedFollowUp(id: item.id) }
              } label: {
                Label(RichChatStrings.queueRemove, systemImage: "trash")
              }
              .disabled(!canOperate)
            }
          }
        } footer: {
          if queue.items.isEmpty && !queue.paused {
            Text(RichChatStrings.queueEmpty)
          }
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(RichChatStrings.queueTitle(queue.items.count))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
      }
      .sheet(isPresented: $presentsEditor) {
        if let item = editingItem {
          RichFollowUpQueueEditorSheet(
            item: item,
            draft: $editingDraft,
            conversation: conversation
          )
        }
      }
    }
  }

  private func beginEditing(_ item: RichPendingSteer) {
    Task { @MainActor in
      if !queue.paused {
        guard await conversation.pauseFollowUps(id: item.id) else { return }
      }
      editingDraft = item.prompt
      editingItem = item
      presentsEditor = true
    }
  }
}

private struct RichFollowUpQueueRow: View {
  let item: RichPendingSteer
  let canOperate: Bool
  let isFirst: Bool
  let isLast: Bool
  let steer: () -> Void
  let edit: () -> Void
  let moveUp: () -> Void
  let moveDown: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(item.prompt)
        .font(.callout)
        .lineLimit(2)
      if let segments = item.segments, !segments.isEmpty {
        Label(
          RichChatStrings.queueSegmentCount(segments.count),
          systemImage: "paperclip"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
    }
    .swipeActions(edge: .leading, allowsFullSwipe: false) {
      Button {
        moveUp()
      } label: {
        Label(RichChatStrings.queueMoveUp, systemImage: "chevron.up")
      }
      .disabled(!canOperate || isFirst)
      Button {
        moveDown()
      } label: {
        Label(RichChatStrings.queueMoveDown, systemImage: "chevron.down")
      }
      .disabled(!canOperate || isLast)
      Button {
        edit()
      } label: {
        Label(RichChatStrings.queueEdit, systemImage: "pencil")
      }
      .disabled(!canOperate)
      Button {
        steer()
      } label: {
        Label(RichChatStrings.queueSteerNow, systemImage: "arrow.up.circle")
      }
      .disabled(!canOperate)
    }
  }
}

private struct RichFollowUpQueuePausedBanner: View {
  let queue: RichFollowUpQueue
  let conversation: RichChatConversationController

  var body: some View {
    HStack(spacing: 9) {
      Image(systemName: "pause.circle")
        .foregroundStyle(.secondary)
      Text(RichChatStrings.queuePaused)
        .font(.footnote)
        .foregroundStyle(.secondary)
      Spacer(minLength: 4)
      Button(RichChatStrings.queueResume) {
        Task { await conversation.resumeFollowUps() }
      }
      .buttonStyle(.bordered)
      .controlSize(.small)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .padding(.horizontal, 12)
  }
}

private struct RichFollowUpQueueEditorSheet: View {
  @Environment(\.dismiss) private var dismiss
  let item: RichPendingSteer
  @Binding var draft: String
  let conversation: RichChatConversationController
  @State private var saving = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(RichChatStrings.steerMessage, text: $draft, axis: .vertical)
            .lineLimit(3...8)
            .disabled(saving)
        } footer: {
          Text(RichChatStrings.queueEditFooter)
        }
      }
      .navigationTitle(RichChatStrings.queueEditTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatStrings.save) {
            guard let stagedAt = Int64(exactly: item.stagedAtMilliseconds) else {
              dismiss()
              return
            }
            saving = true
            Task {
              let saved = await conversation.editQueuedFollowUp(
                RichQueuedFollowUpEdit(
                  id: item.id,
                  expectedStagedAtMilliseconds: stagedAt,
                  prompt: draft,
                  segments: item.segments
                )
              )
              if saved { dismiss() } else { saving = false }
            }
          }
          .disabled(
            saving || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
    }
    .presentationDetents([.medium])
  }
}
