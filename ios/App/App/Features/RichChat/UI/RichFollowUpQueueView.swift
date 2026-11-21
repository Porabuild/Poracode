import SwiftUI

/// Keeps the next queued instruction and its immediate action near the composer.
struct RichFollowUpQueueStrip: View {
  let queue: RichFollowUpQueue
  let canSteer: Bool
  let open: () -> Void
  let steer: (String) -> Void

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .trailing, spacing: 2))
      : AnyLayout(HStackLayout(spacing: 8))
    layout {
      Button(action: open) {
        HStack(spacing: 8) {
          Image(systemName: "list.number")
            .foregroundStyle(Color.poracodeSecondaryLabel)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 3) {
            Text(RichChatStrings.queueTitle(queue.items.count))
              .font(.caption.weight(.semibold))
            if let preview = queue.items.first?.prompt {
              Text(preview)
                .font(.caption)
                .foregroundStyle(Color.poracodeSecondaryLabel)
                .lineLimit(1)
            }
            if queue.paused {
              Text(RichChatStrings.queuePausedShort)
                .font(.caption2.weight(.medium))
                .foregroundStyle(Color.poracodeSecondaryLabel)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          Image(systemName: "chevron.right")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.poracodeSecondaryLabel)
            .accessibilityHidden(true)
        }
        .multilineTextAlignment(.leading)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("native-e2e.follow-ups.open")

      if let next = queue.items.first {
        Button {
          steer(next.id)
        } label: {
          Text(RichChatStrings.queueSteerNow)
            .font(.caption.weight(.semibold))
            .fixedSize(horizontal: true, vertical: false)
            .frame(minWidth: 44, minHeight: 44)
        }
        .poracodeSurfaceButtonStyle()
        .disabled(!canSteer)
        .accessibilityIdentifier("native-e2e.follow-ups.steer-first")
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 4)
    .poracodeGlassBackground(in: PoracodeShapes.content)
    .padding(.horizontal, 12)
  }
}

/// The sheet observes the queue directly so an empty broadcast can update
/// its list while a nested editor retains the draft.
struct RichFollowUpQueueSheet: View {
  let transcript: RichChatTranscriptController
  let conversation: RichChatConversationController
  let canOperate: Bool

  @Environment(\.dismiss) private var dismiss
  @State private var editing: EditingSession?

  private struct EditingSession {
    let item: RichPendingSteer
    let target: RichChatThreadTarget
  }

  private var queue: RichFollowUpQueue? { transcript.state.followUpQueue }
  private var items: [RichPendingSteer] { queue?.items ?? [] }
  private var canManage: Bool { canOperate && conversation.state.activeMutation == nil }

  var body: some View {
    NavigationStack {
      List {
        if queue?.paused == true {
          Section {
            HStack {
              Label(RichChatStrings.queuePaused, systemImage: "pause.circle")
                .foregroundStyle(Color.poracodeSecondaryLabel)
              Spacer(minLength: 8)
              Button(RichChatStrings.queueResume) {
                Task { await conversation.resumeFollowUps() }
              }
              .poracodeSurfaceButtonStyle()
              .disabled(!canManage)
              .accessibilityIdentifier("native-e2e.follow-ups.resume")
            }
          }
        }
        Section {
          ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            RichFollowUpQueueRow(
              item: item,
              canManage: canManage,
              isFirst: index == 0,
              isLast: index == items.count - 1,
              steer: { Task { await conversation.steerQueuedFollowUp(id: item.id) } },
              edit: { beginEditing(item) },
              moveUp: { move(item.id, by: -1) },
              moveDown: { move(item.id, by: 1) },
              remove: { Task { await conversation.removeQueuedFollowUp(id: item.id) } }
            )
          }
        } footer: {
          if items.isEmpty { Text(RichChatStrings.queueEmpty) }
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(RichChatStrings.queueTitle(items.count))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
            .accessibilityIdentifier("native-e2e.follow-ups.close")
        }
      }
      .navigationDestination(
        isPresented: Binding(
          get: { editing != nil },
          set: { if !$0 { editing = nil } }
        )
      ) {
        if let editing {
          RichFollowUpQueueEditor(
            item: editing.item,
            target: editing.target,
            transcript: transcript,
            conversation: conversation,
            canOperate: canOperate
          )
        }
      }
    }
  }

  private func beginEditing(_ item: RichPendingSteer) {
    Task { @MainActor in
      guard canManage, let target = conversation.state.target, transcript.state.target == target,
        let queue, queue.items.contains(item)
      else { return }
      if !queue.paused {
        guard await conversation.pauseFollowUps(id: item.id) else { return }
      }
      guard conversation.state.target == target else { return }
      editing = EditingSession(item: item, target: target)
    }
  }

  private func move(_ id: String, by offset: Int) {
    guard canManage, let index = items.firstIndex(where: { $0.id == id }),
      items.indices.contains(index + offset)
    else { return }
    let anchorIndex = offset < 0 ? index - 1 : index + 2
    let beforeID = items.indices.contains(anchorIndex) ? items[anchorIndex].id : nil
    Task { await conversation.reorderQueuedFollowUp(id: id, beforeID: beforeID) }
  }
}

private struct RichFollowUpQueueRow: View {
  let item: RichPendingSteer
  let canManage: Bool
  let isFirst: Bool
  let isLast: Bool
  let steer: () -> Void
  let edit: () -> Void
  let moveUp: () -> Void
  let moveDown: () -> Void
  let remove: () -> Void

  private var contextCount: Int {
    item.segments?.filter {
      if case .text = $0 { return false }
      return true
    }.count ?? 0
  }

  var body: some View {
    HStack(spacing: 8) {
      Button(action: edit) {
        HStack(spacing: 7) {
          VStack(alignment: .leading, spacing: 3) {
            Text(item.prompt)
              .font(.callout)
              .lineLimit(2)
            if contextCount > 0 {
              Label(RichChatStrings.queueSegmentCount(contextCount), systemImage: "paperclip")
                .font(.caption)
                .foregroundStyle(Color.poracodeSecondaryLabel)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          Image(systemName: "pencil")
            .foregroundStyle(Color.poracodeSecondaryLabel)
            .accessibilityHidden(true)
        }
        .multilineTextAlignment(.leading)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.borderless)
      .foregroundStyle(.primary)
      .accessibilityHint(RichChatStrings.queueEdit)
      .accessibilityIdentifier("native-e2e.follow-ups.row.\(item.id)")

      Button(action: steer) {
        Image(systemName: "arrow.up.circle")
          .font(.callout)
          .frame(width: 44, height: 44)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(RichChatStrings.queueSteerNow)
      .accessibilityIdentifier("native-e2e.follow-ups.steer.\(item.id)")
    }
    .disabled(!canManage)
    .contextMenu { managementActions }
    .accessibilityActions { managementActions }
    .swipeActions(edge: .leading, allowsFullSwipe: false) { reorderActions }
    .swipeActions(edge: .trailing, allowsFullSwipe: false) { removeAction }
  }

  @ViewBuilder private var managementActions: some View {
    if canManage {
      reorderActions
      removeAction
    }
  }

  @ViewBuilder private var reorderActions: some View {
    if !isFirst {
      Button(action: moveUp) {
        Label(RichChatStrings.queueMoveUp, systemImage: "chevron.up")
      }
      .disabled(!canManage)
    }
    if !isLast {
      Button(action: moveDown) {
        Label(RichChatStrings.queueMoveDown, systemImage: "chevron.down")
      }
      .disabled(!canManage)
    }
  }

  private var removeAction: some View {
    Button(role: .destructive, action: remove) {
      Label(RichChatStrings.queueRemove, systemImage: "trash")
    }
    .disabled(!canManage)
  }
}

private struct RichFollowUpQueueEditor: View {
  let item: RichPendingSteer
  let target: RichChatThreadTarget
  let transcript: RichChatTranscriptController
  let conversation: RichChatConversationController
  let canOperate: Bool

  @Environment(\.dismiss) private var dismiss
  @FocusState private var focusedSegment: Int?
  @State private var draft: RichQueuedFollowUpDraft
  @State private var saving = false
  @State private var failure: RichChatControllerFailure?

  init(
    item: RichPendingSteer, target: RichChatThreadTarget, transcript: RichChatTranscriptController,
    conversation: RichChatConversationController, canOperate: Bool
  ) {
    self.item = item
    self.target = target
    self.transcript = transcript
    self.conversation = conversation
    self.canOperate = canOperate
    _draft = State(initialValue: RichQueuedFollowUpDraft(item: item))
  }

  var body: some View {
    VStack(spacing: 0) {
      ScrollViewReader { scroll in
        ScrollView {
          VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 0) {
              ForEach(draft.segments.indices, id: \.self) { index in
                if index > draft.segments.startIndex { Divider() }
                segmentRow(at: index)
                  .padding(.horizontal, 14)
                  .padding(.vertical, 10)
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .id(index)
              }
            }
            .poracodeContentCardBackground()
            Text(editorStatus)
              .font(.footnote)
              .foregroundStyle(Color.poracodeSecondaryLabel)
              .accessibilityIdentifier("native-e2e.follow-ups.edit-status")
              .padding(.horizontal, 8)
          }
          .poracodeReadableWidth(680)
          .padding(.horizontal, 16)
          .padding(.vertical, 10)
        }
        .onGeometryChange(for: CGRect.self) {
          $0.frame(in: .global)
        } action: { _ in
          if let focusedSegment { scroll.scrollTo(focusedSegment, anchor: .center) }
        }
      }
      .clipped()
    }
    .navigationTitle(RichChatStrings.queueEditTitle)
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden()
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button(RichChatStrings.cancel) { dismiss() }
          .accessibilityIdentifier("native-e2e.follow-ups.cancel-edit")
      }
      ToolbarItem(placement: .confirmationAction) {
        Button(RichChatStrings.save, action: save)
          .disabled(!canSave)
          .accessibilityIdentifier("native-e2e.follow-ups.save")
      }
    }
  }

  @ViewBuilder private func segmentRow(at index: Int) -> some View {
    if draft.text(at: index) != nil {
      TextField(RichChatStrings.steerMessage, text: textBinding(at: index), axis: .vertical)
        .lineLimit(3...8)
        .focused($focusedSegment, equals: index)
        .disabled(saving)
        .accessibilityIdentifier("native-e2e.follow-ups.edit-draft")
    } else {
      contextRow(draft.segments[index])
    }
  }

  private var editorStatus: String {
    if !canOperate { return RichChatStrings.readOnly }
    if !matchesQueuedRevision { return RichChatStrings.queueEditChanged }
    if let failure { return RichChatStrings.failure(failure) }
    return RichChatStrings.queueEditFooter
  }

  private var matchesQueuedRevision: Bool {
    guard let current = transcript.state.target, conversation.state.target == current,
      current.threadID == target.threadID, current.lease.connectionID == target.lease.connectionID
    else { return false }
    return transcript.state.followUpQueue?.containsEditableRevision(item) == true
  }

  private var canSave: Bool {
    canOperate && !saving && conversation.state.activeMutation == nil
      && matchesQueuedRevision && draft.edit() != nil
  }

  private func textBinding(at index: Int) -> Binding<String> {
    Binding(
      get: { draft.text(at: index) ?? "" },
      set: { draft.updateText(at: index, to: $0) })
  }

  @ViewBuilder private func contextRow(_ segment: RichPromptSegment) -> some View {
    if case .attachment(let path, _) = segment {
      Label(RichChatFilePolicy.basename(path), systemImage: "paperclip")
        .foregroundStyle(Color.poracodeSecondaryLabel)
    } else if let label = segment.composerChipLabel ?? segment.promptText {
      Text(label)
        .foregroundStyle(Color.poracodeSecondaryLabel)
        .lineLimit(2)
    }
  }

  private func save() {
    guard canSave, let edit = draft.edit() else { return }
    saving = true
    failure = nil
    Task {
      let saved = await conversation.editQueuedFollowUp(edit)
      if saved {
        dismiss()
      } else {
        failure = conversation.state.failure
        saving = false
      }
    }
  }
}
