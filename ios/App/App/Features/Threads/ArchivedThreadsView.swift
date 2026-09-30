import SwiftUI

/// Native counterpart to the PWA Archived Threads settings page. The selected
/// desktop remains authoritative; this view only projects its snapshot and
/// routes restore/delete through the exact-host lifecycle controller.
struct ArchivedThreadsView: View {
  @Bindable var session: AppSession

  @State private var lifecycle: ThreadLifecycleController
  @State private var mutatingThreadID: String?
  @State private var mutatingDraftKey: RichChatComposerDraftKey?
  @State private var failureMessage: String?

  init(session: AppSession) {
    self.session = session
    _lifecycle = State(initialValue: session.makeThreadLifecycleController())
  }

  var body: some View {
    Group {
      if archivedThreads.isEmpty {
        ContentUnavailableView {
          Label(ArchivedThreadsStrings.empty, systemImage: "archivebox")
        } description: {
          Text(ArchivedThreadsStrings.description)
        }
      } else {
        List(archivedThreads) { thread in
          row(thread)
        }
        .listStyle(.insetGrouped)
        .refreshable { await session.refreshSnapshot() }
      }
    }
    .navigationTitle(ArchivedThreadsStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        HostSelectionMenu(session: session)
      }
    }
    .threadLifecycleDestructiveConfirmation(controller: lifecycle) {
      Task { await lifecycle.confirmDestructiveIntent() }
    }
    .threadLifecycleFailureAlert(message: $failureMessage) {
      clearFailure()
    }
    .onChange(of: lifecycle.lastOutcome) { _, outcome in
      consume(outcome)
    }
    .onDisappear { lifecycle.deactivate() }
  }

  private var archivedThreads: [RemoteThread] {
    (session.snapshot?.threads ?? [])
      .filter(\.isArchived)
      .sorted { $0.updatedAt > $1.updatedAt }
  }

  private var projectsByID: [String: RemoteProject] {
    Dictionary(
      uniqueKeysWithValues: (session.snapshot?.projects ?? [])
        .filter { !($0.disabled ?? false) }
        .map { ($0.id, $0) }
    )
  }

  private var canOperate: Bool {
    session.currentThreadSessionAccess?.isReady == true
      && session.currentThreadSessionAccess?.isOnline == true
      && session.currentThreadSessionAccess?.isForeground == true
      && session.currentThreadSessionAccess?.scopes.contains("session:operate") == true
  }

  private func row(_ thread: RemoteThread) -> some View {
    HStack(spacing: 8) {
      PoracodeThreadRow(
        thread: thread,
        projectName: projectsByID[thread.projectId]?.name,
        showsRelativeTime: true,
        isOpening: lifecycle.isBusy && mutatingThreadID == thread.id
      )
      Menu {
        Button {
          restore(thread)
        } label: {
          PoracodeActionLabel(
            ThreadLifecycleStrings.unarchive,
            systemImage: "arrow.uturn.backward"
          )
        }
        .buttonStyle(.plain)
        Button(role: .destructive) {
          requestDelete(thread)
        } label: {
          PoracodeActionLabel(
            ThreadLifecycleStrings.delete,
            systemImage: "trash",
            tone: .destructive
          )
        }
        .buttonStyle(.plain)
      } label: {
        Image(systemName: "ellipsis.circle")
          .foregroundStyle(.secondary)
      }
      .disabled(!canOperate || lifecycle.isBusy)
      .accessibilityLabel(ThreadLifecycleStrings.actions)
    }
    .padding(.vertical, 2)
    .swipeActions(edge: .leading, allowsFullSwipe: true) {
      Button {
        restore(thread)
      } label: {
        Label(ThreadLifecycleStrings.unarchive, systemImage: "arrow.uturn.backward")
      }
      .tint(.accentColor)
      .disabled(!canOperate || lifecycle.isBusy)
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) {
        requestDelete(thread)
      } label: {
        Label(ThreadLifecycleStrings.delete, systemImage: "trash")
      }
      .disabled(!canOperate || lifecycle.isBusy)
    }
  }

  private func restore(_ thread: RemoteThread) {
    guard canOperate, let target = session.threadLifecycleTarget(threadID: thread.id) else {
      return
    }
    mutatingThreadID = thread.id
    mutatingDraftKey = RichChatComposerDraftKey(
      connectionID: target.lease.identity.clientConnectionID,
      threadID: thread.id
    )
    lifecycle.activate(target)
    Task { await lifecycle.unarchive(target: target) }
  }

  private func requestDelete(_ thread: RemoteThread) {
    guard canOperate, let target = session.threadLifecycleTarget(threadID: thread.id) else {
      return
    }
    mutatingThreadID = thread.id
    mutatingDraftKey = RichChatComposerDraftKey(
      connectionID: target.lease.identity.clientConnectionID,
      threadID: thread.id
    )
    lifecycle.activate(target)
    lifecycle.delete()
  }

  private func consume(_ outcome: ThreadLifecycleOutcome?) {
    switch outcome {
    case .succeeded(let action):
      if action == .delete, let key = mutatingDraftKey {
        session.richChatComposerDrafts.clear(key)
      }
      mutatingThreadID = nil
      mutatingDraftKey = nil
      Task { await session.refreshSnapshot() }
    case .failed(_, let failure):
      mutatingThreadID = nil
      mutatingDraftKey = nil
      failureMessage = ThreadLifecycleStrings.failureMessage(failure)
    case nil:
      break
    }
  }

  private func clearFailure() {
    failureMessage = nil
    lifecycle.clearLastOutcome()
  }
}
