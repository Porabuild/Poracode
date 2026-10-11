import SwiftUI

struct ProjectThreadsView: View {
  @Bindable var session: AppSession
  let project: RemoteProject
  @State private var lifecycle: ThreadLifecycleController
  @State private var renameIntent: ThreadRenameIntent?
  @State private var groupRenameIntent: ThreadGroupRenameIntent?
  @State private var relaunchIntent: ThreadRelaunchIntent?
  @State private var failureMessage: String?
  @State private var expandedGroupIDs = Set<String>()

  init(session: AppSession, project: RemoteProject) {
    self._session = Bindable(wrappedValue: session)
    self.project = project
    self._lifecycle = State(initialValue: session.makeThreadLifecycleController())
  }

  private var threads: [RemoteThread] {
    session.threads(for: project.id)
  }

  private var entries: [HomeThreadListEntry] {
    guard let connectionID = session.selectedConnectionId else { return [] }
    return HomeThreadListPresentation.entries(
      from: threads.map {
        UnifiedThreadListItem(
          connectionID: connectionID,
          hostName: session.state.profile?.label ?? "",
          project: project,
          thread: $0
        )
      }
    )
  }

  var body: some View {
    Group {
      if threads.isEmpty {
        EmptyStateView(
          title: HomeStrings.emptyThreadsTitle,
          systemImage: "bubble.left.and.bubble.right",
          description: HomeStrings.projectThreadsEmptyDescription
        )
      } else {
        List {
          ForEach(entries) { entry in
            switch entry {
            case .thread(let item):
              threadRow(item.thread)
            case .worktree(let group):
              DisclosureGroup(isExpanded: expansionBinding(group.id)) {
                ForEach(group.threads) { item in threadRow(item.thread) }
              } label: {
                groupLabel(
                  group.worktreeBranch,
                  count: group.threads.count,
                  systemImage: "arrow.triangle.branch"
                )
                .contextMenu {
                  Button {
                    markAllDone(group.threads.map(\.thread))
                  } label: {
                    PoracodeActionLabel(
                      ThreadLifecycleStrings.markDone,
                      systemImage: "checkmark.circle"
                    )
                  }
                  .buttonStyle(.plain)
                  .disabled(!canOperate(group.threads.map(\.thread)))
                  Button(role: .destructive) {
                    requestDeleteWorktree(group)
                  } label: {
                    PoracodeActionLabel(
                      ThreadLifecycleStrings.delete,
                      systemImage: "trash",
                      tone: .destructive
                    )
                  }
                  .buttonStyle(.plain)
                  .disabled(!canOperate(group.threads.map(\.thread)))
                }
              }
            case .conversation(let group):
              DisclosureGroup(isExpanded: expansionBinding(group.id)) {
                ForEach(group.threads) { item in threadRow(item.thread) }
              } label: {
                groupLabel(
                  group.groupName,
                  count: group.threads.count,
                  systemImage: "square.stack.3d.up.fill"
                )
                .contextMenu {
                  Button {
                    groupRenameIntent = ThreadGroupRenameIntent(
                      id: group.groupID,
                      title: group.groupName,
                      threads: group.threads.map(\.thread)
                    )
                  } label: {
                    PoracodeActionLabel(ThreadLifecycleStrings.rename, systemImage: "pencil")
                  }
                  .buttonStyle(.plain)
                  .disabled(!canOperate(group.threads.map(\.thread)))
                  Button {
                    markAllDone(group.threads.map(\.thread))
                  } label: {
                    PoracodeActionLabel(
                      ThreadLifecycleStrings.markDone,
                      systemImage: "checkmark.circle"
                    )
                  }
                  .buttonStyle(.plain)
                  .disabled(!canOperate(group.threads.map(\.thread)))
                }
              }
            }
          }
        }
        .listStyle(.insetGrouped)
      }
    }
    .navigationTitle(project.name)
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    .onDisappear { lifecycle.deactivate() }
    .onChange(of: lifecycle.lastOutcome) { _, outcome in
      switch outcome {
      case .succeeded:
        Task { await session.refreshSnapshot() }
      case .failed(_, let failure):
        failureMessage = ThreadLifecycleStrings.failureMessage(failure)
      case nil:
        break
      }
    }
    .threadRenameAlert(intent: $renameIntent) {
      submitRename()
    }
    .alert(
      ThreadLifecycleStrings.rename,
      isPresented: Binding(
        get: { groupRenameIntent != nil },
        set: { if !$0 { groupRenameIntent = nil } }
      )
    ) {
      TextField(
        ThreadLifecycleStrings.renamePrompt,
        text: Binding(
          get: { groupRenameIntent?.title ?? "" },
          set: { groupRenameIntent?.title = $0 }
        )
      )
      Button(ThreadLifecycleStrings.cancel, role: .cancel) { groupRenameIntent = nil }
      Button(ThreadLifecycleStrings.rename) { submitGroupRename() }
        .disabled(
          groupRenameIntent?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true)
    }
    .sheet(item: $relaunchIntent) { intent in
      ThreadRelaunchSheet(
        intent: Binding(
          get: { relaunchIntent ?? intent },
          set: { relaunchIntent = $0 }
        ),
        isBusy: lifecycle.isBusy,
        submit: { submitRelaunch(intent: intent, prompt: $0) }
      )
    }
    .threadLifecycleDestructiveConfirmation(controller: lifecycle) {
      Task { await lifecycle.confirmDestructiveIntent() }
    }
    .threadLifecycleFailureAlert(message: $failureMessage) {
      failureMessage = nil
      lifecycle.clearLastOutcome()
    }
  }

  private func expansionBinding(_ id: String) -> Binding<Bool> {
    Binding(
      get: { expandedGroupIDs.contains(id) },
      set: { expanded in
        if expanded {
          expandedGroupIDs.insert(id)
        } else {
          expandedGroupIDs.remove(id)
        }
      }
    )
  }

  private func groupLabel(_ title: String, count: Int, systemImage: String) -> some View {
    HStack(spacing: 10) {
      Label(title, systemImage: systemImage)
        .font(.body.weight(.semibold))
        .lineLimit(1)
      Spacer(minLength: 8)
      Text("\(count)")
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(title), \(HomeStrings.threadCount(count))")
  }

  @ViewBuilder
  private func threadRow(_ thread: RemoteThread) -> some View {
    if let connectionID = session.selectedConnectionId {
      HStack(spacing: 8) {
        NavigationLink(
          value: ThreadRoute(
            id: CompositeRemoteID(
              connectionId: connectionID,
              remoteId: thread.id
            ),
            title: thread.title
          )
        ) {
          PoracodeThreadRow(
            thread: thread,
            gitSummary: session.gitSummary(forThread: thread.id),
            hasDraft: hasDraft(thread),
            showsRelativeTime: true,
            showsGitBranch: thread.worktreePath?.isEmpty == false
          )
        }
        .accessibilityLabel(threadAccessibilityLabel(thread))
        .accessibilityIdentifier("native-e2e.thread.\(thread.id)")
        ThreadLifecycleActionMenu(
          thread: thread,
          enabled: canOperate(on: thread),
          isBusy: lifecycle.isBusy,
          perform: { action in perform(action, on: thread) }
        )
      }
    }
  }

  private func canOperate(on thread: RemoteThread) -> Bool {
    session.threadLifecycleTarget(threadID: thread.id) != nil
      && session.currentThreadSessionAccess?.isReady == true
      && session.currentThreadSessionAccess?.isOnline == true
      && session.currentThreadSessionAccess?.isForeground == true
      && session.currentThreadSessionAccess?.scopes.contains("session:operate") == true
  }

  private func canOperate(_ threads: [RemoteThread]) -> Bool {
    !threads.isEmpty && !lifecycle.isBusy && threads.allSatisfy { canOperate(on: $0) }
  }

  private func activate(_ thread: RemoteThread) -> ThreadLifecycleTarget? {
    guard let target = session.threadLifecycleTarget(threadID: thread.id) else { return nil }
    lifecycle.activate(target)
    return target
  }

  private func perform(_ action: ThreadLifecycleMenuAction, on thread: RemoteThread) {
    guard let target = activate(thread) else { return }
    switch action {
    case .rename:
      renameIntent = ThreadRenameIntent(
        id: thread.id,
        thread: thread,
        target: target,
        title: thread.title
      )
    case .relaunch:
      relaunchIntent = ThreadRelaunchIntent(id: thread.id, thread: thread, target: target)
    case .setPinned(let pinned):
      Task { await lifecycle.setPinned(pinned, target: target) }
    case .setDone(let done):
      Task { await lifecycle.setDone(done, target: target) }
    case .acknowledge:
      Task { await lifecycle.acknowledge(target: target) }
    case .removeFromGroup:
      Task { await lifecycle.clearGroup(target: target) }
    case .archive:
      lifecycle.archive()
    case .unarchive:
      Task { await lifecycle.unarchive(target: target) }
    case .delete:
      lifecycle.delete()
    }
  }

  private func submitRename() {
    guard let intent = renameIntent,
      session.threadLifecycleTarget(threadID: intent.thread.id) == intent.target
    else { return }
    lifecycle.activate(intent.target)
    let title = intent.title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty else { return }
    renameIntent = nil
    Task { await lifecycle.rename(to: title, target: intent.target) }
  }

  private func submitGroupRename() {
    guard let intent = groupRenameIntent else { return }
    let title = intent.title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty, canOperate(intent.threads) else { return }
    groupRenameIntent = nil
    Task {
      for thread in intent.threads {
        guard let target = session.threadLifecycleTarget(threadID: thread.id) else { return }
        lifecycle.activate(target)
        await lifecycle.setGroup(id: intent.id, name: title)
        if case .failed(_, _)? = lifecycle.lastOutcome { return }
      }
      await session.refreshSnapshot()
    }
  }

  private func markAllDone(_ threads: [RemoteThread]) {
    guard canOperate(threads) else { return }
    Task {
      for thread in threads where !thread.isDone {
        guard let target = session.threadLifecycleTarget(threadID: thread.id) else { return }
        lifecycle.activate(target)
        await lifecycle.setDone(true, target: target)
        if case .failed(_, _)? = lifecycle.lastOutcome { return }
      }
      await session.refreshSnapshot()
    }
  }

  private func requestDeleteWorktree(_ group: HomeWorktreeThreadGroup) {
    let threads = group.threads.map(\.thread)
    guard canOperate(threads), let first = threads.first,
      activate(first) != nil
    else { return }
    lifecycle.deleteWorktreeGroup(
      projectID: project.id,
      worktreePath: group.worktreePath,
      threadIDs: threads.map(\.id)
    )
  }

  /// Relaunching a thread the user can already see is `thread-start-existing`
  /// (`POST /api/threads/start`), not the generic thread-command surface: the
  /// thread identity and its real execution location are already known, so the
  /// dedicated route is what the desktop expects. The controller mints one
  /// fresh command id per explicit action and makes exactly one attempt.
  private func submitRelaunch(intent: ThreadRelaunchIntent, prompt: String) {
    guard session.threadLifecycleTarget(threadID: intent.thread.id) == intent.target,
      let request = session.threadStartExistingRequest(
        threadID: intent.thread.id,
        prompt: prompt
      )
    else { return }
    lifecycle.activate(intent.target)
    Task { await lifecycle.start(request, target: intent.target) }
  }

  private func threadAccessibilityLabel(_ thread: RemoteThread) -> String {
    var parts = [thread.title, ThreadLifecycleStrings.status(thread.status)]
    if thread.isStarred { parts.append(HomeStrings.starred) }
    if hasDraft(thread) { parts.append(HomeStrings.unsentDraft) }
    if thread.isDone { parts.append(SettingsUIStrings.done) }
    return parts.joined(separator: ", ")
  }

  private func hasDraft(_ thread: RemoteThread) -> Bool {
    guard let connectionID = session.selectedConnectionId else { return false }
    return session.richChatComposerDrafts.hasDraft(
      for: RichChatComposerDraftKey(connectionID: connectionID, threadID: thread.id)
    )
  }
}

private struct ThreadGroupRenameIntent: Identifiable {
  let id: String
  var title: String
  let threads: [RemoteThread]
}

struct UnifiedThreadListItem: Identifiable, Sendable, Equatable {
  var connectionID: ClientConnectionID
  var hostName: String
  var project: RemoteProject
  var thread: RemoteThread

  var id: String {
    CompositeRemoteID(connectionId: connectionID, remoteId: thread.id).rawValue
  }
}

/// Host-keyed projection for the mobile flat list. Remote object ids stay raw
/// inside each entry and become composite only at the UI/navigation boundary.
enum UnifiedThreadPresentation {
  static func entries(
    hosts: [HostRecord],
    selectedConnectionID: ClientConnectionID?,
    selectedSnapshot: RemoteShellSnapshot?,
    hostSnapshots: [ClientConnectionID: RemoteShellSnapshot]
  ) -> [UnifiedThreadListItem] {
    hosts.flatMap { host -> [UnifiedThreadListItem] in
      let snapshot =
        host.connectionId == selectedConnectionID
        ? (selectedSnapshot ?? hostSnapshots[host.connectionId])
        : hostSnapshots[host.connectionId]
      guard let snapshot else { return [] }
      let projects = Dictionary(
        uniqueKeysWithValues: snapshot.projects
          .filter { !($0.disabled ?? false) }
          .map { ($0.id, $0) }
      )
      return snapshot.threads.compactMap { thread in
        guard !thread.isArchived,
          ThreadPresentationFilter.isVisibleInNativeList(thread),
          let project = projects[thread.projectId]
        else { return nil }
        return UnifiedThreadListItem(
          connectionID: host.connectionId,
          hostName: host.label,
          project: project,
          thread: thread
        )
      }
    }
    .sorted { lhs, rhs in
      if lhs.thread.isStarred != rhs.thread.isStarred {
        return lhs.thread.isStarred && !rhs.thread.isStarred
      }
      if lhs.thread.updatedAt != rhs.thread.updatedAt {
        return lhs.thread.updatedAt > rhs.thread.updatedAt
      }
      return lhs.id < rhs.id
    }
  }
}
