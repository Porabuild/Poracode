import SwiftUI

struct ProjectThreadsView: View {
  @Bindable var session: AppSession
  let project: RemoteProject
  @State private var lifecycle: ThreadLifecycleController
  @State private var renameIntent: ThreadRenameIntent?
  @State private var relaunchIntent: ThreadRelaunchIntent?
  @State private var failureMessage: String?

  init(session: AppSession, project: RemoteProject) {
    self._session = Bindable(wrappedValue: session)
    self.project = project
    self._lifecycle = State(initialValue: session.makeThreadLifecycleController())
  }

  private var threads: [RemoteThread] {
    session.threads(for: project.id)
  }

  var body: some View {
    Group {
      if threads.isEmpty {
        EmptyStateView(
          title: "No threads",
          systemImage: "bubble.left.and.bubble.right",
          description: "Active threads for this project will show up here."
        )
      } else {
        List(threads) { thread in
          if let connectionId = session.selectedConnectionId {
            HStack(spacing: 8) {
              NavigationLink(
                value: ThreadRoute(
                  id: CompositeRemoteID(
                    connectionId: connectionId,
                    remoteId: thread.id
                  ),
                  title: thread.title
                )
              ) {
                // Authoritative cached Git summary for the selected host only.
                ThreadRowView(
                  thread: thread,
                  gitSummary: session.gitSummary(forThread: thread.id)
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
    .alert(
      ThreadLifecycleStrings.rename,
      isPresented: Binding(
        get: { renameIntent != nil },
        set: { if !$0 { renameIntent = nil } }
      )
    ) {
      TextField(
        ThreadLifecycleStrings.renamePrompt,
        text: Binding(
          get: { renameIntent?.title ?? "" },
          set: { renameIntent?.title = $0 }
        )
      )
      Button(ThreadLifecycleStrings.cancel, role: .cancel) { renameIntent = nil }
      Button(ThreadLifecycleStrings.rename) { submitRename() }
        .disabled(
          renameIntent?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
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
    .confirmationDialog(
      destructiveConfirmationTitle,
      isPresented: Binding(
        get: { lifecycle.pendingDestructiveIntent != nil },
        set: { if !$0 { lifecycle.cancelDestructiveIntent() } }
      ),
      titleVisibility: .visible
    ) {
      Button(destructiveConfirmationButton, role: .destructive) {
        Task { await lifecycle.confirmDestructiveIntent() }
      }
      Button(ThreadLifecycleStrings.cancel, role: .cancel) {
        lifecycle.cancelDestructiveIntent()
      }
    }
    .alert(
      ThreadLifecycleStrings.actionFailed,
      isPresented: Binding(
        get: { failureMessage != nil },
        set: {
          if !$0 {
            failureMessage = nil
            lifecycle.clearLastOutcome()
          }
        }
      )
    ) {
      Button(ThreadLifecycleStrings.cancel, role: .cancel) {
        failureMessage = nil
        lifecycle.clearLastOutcome()
      }
    } message: {
      Text(failureMessage ?? "")
    }
  }

  private func canOperate(on thread: RemoteThread) -> Bool {
    session.threadLifecycleTarget(threadID: thread.id) != nil
      && session.currentThreadSessionAccess?.isReady == true
      && session.currentThreadSessionAccess?.isOnline == true
      && session.currentThreadSessionAccess?.isForeground == true
      && session.currentThreadSessionAccess?.scopes.contains("session:operate") == true
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

  private var destructiveConfirmationTitle: String {
    switch lifecycle.pendingDestructiveIntent {
    case .archive:
      ThreadLifecycleStrings.archiveConfirmation
    case .delete, .deleteWorktreeGroup:
      ThreadLifecycleStrings.deleteConfirmation
    case nil:
      ThreadLifecycleStrings.actions
    }
  }

  private var destructiveConfirmationButton: String {
    switch lifecycle.pendingDestructiveIntent {
    case .archive:
      ThreadLifecycleStrings.archive
    case .delete, .deleteWorktreeGroup:
      ThreadLifecycleStrings.delete
    case nil:
      ThreadLifecycleStrings.cancel
    }
  }

  private func threadAccessibilityLabel(_ thread: RemoteThread) -> String {
    var parts = [thread.title, thread.status.replacingOccurrences(of: "_", with: " ")]
    if thread.isStarred { parts.append("starred") }
    if thread.isDone { parts.append("done") }
    return parts.joined(separator: ", ")
  }
}

struct ThreadRowView: View {
  let thread: RemoteThread
  /// Cached host-published summary. `nil` on older hosts, offline, or after a
  /// host switch — the row then renders no Git line rather than stale data.
  var gitSummary: GitThreadSummary?
  var projectName: String?
  var hostName: String?
  var showsRelativeTime = false

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      StatusDot(status: thread.status)
        .padding(.top, 4)
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Text(thread.title)
            .font(.body.weight(.medium))
            .lineLimit(2)
          if thread.isStarred {
            Image(systemName: "star.fill")
              .font(.caption)
              .foregroundStyle(.yellow)
              .accessibilityLabel("Starred")
          }
          Spacer(minLength: 8)
          if showsRelativeTime, let updated = CompactThreadDate.parse(thread.updatedAt) {
            Text(updated, style: .relative)
              .font(.caption.monospacedDigit())
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
        if let projectName, let hostName {
          HStack(spacing: 5) {
            Text(projectName)
              .lineLimit(1)
            Image(systemName: "desktopcomputer")
              .accessibilityHidden(true)
            Text(hostName)
              .lineLimit(1)
          }
          .font(.caption)
          .foregroundStyle(.secondary)
        }
        HStack(spacing: 8) {
          Text(thread.agentKind)
            .font(.caption)
            .foregroundStyle(.secondary)
          Text(thread.status.replacingOccurrences(of: "_", with: " "))
            .font(.caption)
            .foregroundStyle(statusColor(thread.status))
        }
        ThreadGitSummaryBadge(summary: gitSummary)
        if let error = thread.errorMessage, thread.status == "error" {
          Text(error)
            .font(.caption2)
            .foregroundStyle(.red)
            .lineLimit(2)
        }
      }
    }
    .padding(.vertical, 2)
  }

  private func statusColor(_ status: String) -> Color {
    switch status {
    case "working", "launching": return .blue
    case "needs_approval", "needs_reply": return .orange
    case "error": return .red
    case "finished", "idle": return .secondary
    default: return .secondary
    }
  }
}

private enum CompactThreadDate {
  static func parse(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }
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
      let snapshot = host.connectionId == selectedConnectionID
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
              ThreadPresentationFilter.isVisibleInGUIList(thread),
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

struct StatusDot: View {
  let status: String

  var body: some View {
    Circle()
      .fill(color)
      .frame(width: 10, height: 10)
      .accessibilityHidden(true)
  }

  private var color: Color {
    switch status {
    case "working", "launching": return .blue
    case "needs_approval", "needs_reply": return .orange
    case "error": return .red
    case "finished": return .green
    default: return .secondary
    }
  }
}
