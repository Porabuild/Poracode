import SwiftUI

/// The selected desktop owns the archive. A presented row keeps the lease of
/// the desktop that supplied it, including while a system menu is open.
struct ArchivedThreadsView: View {
  @Bindable var session: AppSession
  @Environment(\.calendar) private var calendar
  @Environment(\.locale) private var locale
  @Environment(\.timeZone) private var timeZone

  @State private var lifecycle: ThreadLifecycleController
  @State private var actionRow: ArchivedThreadAction?
  @State private var mutatingTarget: ThreadLifecycleTarget?
  @State private var failureMessage: String?

  init(session: AppSession) {
    self.session = session
    _lifecycle = State(initialValue: session.makeThreadLifecycleController())
  }

  var body: some View {
    archive
      .navigationTitle(ArchivedThreadsStrings.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          HostSelectionMenu(session: session)
        }
      }
      .threadLifecycleDestructiveConfirmation(controller: lifecycle) { intent in
        guard canOperate(intent.target) else { return }
        mutatingTarget = intent.target
        Task { await lifecycle.confirmDestructiveIntent(intent) }
      }
      .threadLifecycleFailureAlert(message: $failureMessage) {
        failureMessage = nil
        lifecycle.clearLastOutcome()
      }
      .onChange(of: lifecycle.lastOutcome) { _, outcome in consume(outcome) }
      .onChange(of: session.currentThreadHostLease) { resetActions() }
      .onDisappear { resetActions() }
      .confirmationDialog(
        actionRow?.thread.title ?? ArchivedThreadsStrings.title,
        isPresented: Binding(
          get: { actionRow != nil },
          set: { if !$0 { actionRow = nil } }
        ),
        titleVisibility: .visible,
        presenting: actionRow
      ) { row in
        Button(ThreadLifecycleStrings.unarchive) { restore(row.target) }
          .disabled(!canOperate(row.target))
        Button(ThreadLifecycleStrings.delete, role: .destructive) { requestDelete(row.target) }
          .disabled(!canOperate(row.target))
      }
  }

  @ViewBuilder private var archive: some View {
    let days = archiveDays
    if session.snapshot == nil && session.phase == .connecting {
      SettingsLoadingView()
    } else if let lease = session.currentThreadHostLease, !days.isEmpty {
      List {
        ForEach(days) { section in
          Section {
            ForEach(section.entries) { entry in
              row(entry, lease: lease)
            }
          } header: {
            if let day = section.day {
              Text(day, format: .dateTime.weekday(.wide).year().month(.wide).day())
                .accessibilityIdentifier("native-e2e.archived.date")
            }
          }
        }
      }
      .listStyle(.insetGrouped)
      .poracodeReadableListMargins(760)
      .refreshable { await session.refreshSnapshot() }
    } else if session.snapshot != nil {
      ContentUnavailableView {
        Label(ArchivedThreadsStrings.empty, systemImage: "archivebox")
      } description: {
        Text(ArchivedThreadsStrings.description)
      }
      .accessibilityIdentifier("native-e2e.archived.empty")
    } else {
      ContentUnavailableView(SettingsUIStrings.unavailable, systemImage: "desktopcomputer.trianglebadge.exclamationmark")
    }
  }

  private var archiveDays: [ArchivedThreadDay] {
    var localCalendar = calendar
    localCalendar.timeZone = timeZone
    return ArchivedThreadDay.group(session.snapshot?.threads ?? [], calendar: localCalendar)
  }

  private var projectsByID: [String: RemoteProject] {
    Dictionary(
      uniqueKeysWithValues: (session.snapshot?.projects ?? [])
        .filter { !($0.disabled ?? false) }
        .map { ($0.id, $0) }
    )
  }

  private func canOperate(_ target: ThreadLifecycleTarget) -> Bool {
    ArchivedThreadAction.canOperate(target, access: session.currentThreadSessionAccess,
      threads: session.snapshot?.threads ?? []) && mutatingTarget == nil && !lifecycle.isBusy
  }

  private func row(_ entry: ArchivedThreadDay.Entry, lease: ThreadHostLease) -> some View {
    let thread = entry.thread
    let target = ThreadLifecycleTarget(lease: lease, threadID: thread.id)
    return Button { actionRow = ArchivedThreadAction(thread: thread, target: target) } label: {
      PoracodeThreadRow(
        thread: thread,
        projectName: projectsByID[thread.projectId]?.name,
        showsRelativeTime: false,
        timeLabel: entry.timestamp?.formatted(
          Date.FormatStyle(locale: locale, calendar: calendar, timeZone: timeZone).hour().minute()
        ),
        isOpening: lifecycle.isBusy && mutatingTarget == target,
        hasBackgroundActivity: session.workflowActivity.isLive(connectionID: lease.identity.clientConnectionID, threadID: thread.id)
      )
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("native-e2e.archived.thread.\(thread.id)")
    .padding(.vertical, 2)
    .swipeActions(edge: .leading, allowsFullSwipe: true) {
      Button { restore(target) } label: {
        Label(ThreadLifecycleStrings.unarchive, systemImage: "arrow.uturn.backward")
      }
      .tint(.gray)
      .disabled(!canOperate(target))
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) { requestDelete(target) } label: {
        Label(ThreadLifecycleStrings.delete, systemImage: "trash")
      }
      .disabled(!canOperate(target))
    }
    .contextMenu { archivedActions(target) }
    .accessibilityActions { archivedActions(target) }
  }

  @ViewBuilder private func archivedActions(_ target: ThreadLifecycleTarget) -> some View {
    Button { restore(target) } label: {
      PoracodeActionLabel(ThreadLifecycleStrings.unarchive, systemImage: "arrow.uturn.backward")
    }
    .buttonStyle(.plain)
    .disabled(!canOperate(target))
    Button(role: .destructive) { requestDelete(target) } label: {
      PoracodeActionLabel(ThreadLifecycleStrings.delete, systemImage: "trash", tone: .destructive)
    }
    .buttonStyle(.plain)
    .disabled(!canOperate(target))
  }

  private func restore(_ target: ThreadLifecycleTarget) {
    actionRow = nil
    guard canOperate(target) else { return }
    mutatingTarget = target
    lifecycle.activate(target)
    Task { await lifecycle.unarchive(target: target) }
  }

  private func requestDelete(_ target: ThreadLifecycleTarget) {
    actionRow = nil
    guard canOperate(target) else { return }
    lifecycle.activate(target)
    lifecycle.delete()
  }

  private func consume(_ outcome: ThreadLifecycleOutcome?) {
    guard let target = mutatingTarget, target.lease == session.currentThreadHostLease else { return }
    switch outcome {
    case .succeeded(let action):
      if action == .delete {
        session.richChatComposerDrafts.clear(RichChatComposerDraftKey(
          connectionID: target.lease.identity.clientConnectionID, threadID: target.threadID
        ))
      }
      mutatingTarget = nil
      Task {
        guard target.lease == session.currentThreadHostLease else { return }
        await session.refreshSnapshot()
      }
    case .failed(_, let failure):
      mutatingTarget = nil
      failureMessage = ThreadLifecycleStrings.failureMessage(failure)
    case nil:
      break
    }
  }

  private func resetActions() {
    actionRow = nil
    mutatingTarget = nil
    failureMessage = nil
    lifecycle.deactivate()
  }
}

struct ArchivedThreadAction {
  let thread: RemoteThread
  let target: ThreadLifecycleTarget

  static func canOperate(_ target: ThreadLifecycleTarget, access: ThreadSessionAccess?, threads: [RemoteThread]) -> Bool {
    guard let access, access.lease == target.lease, access.isOnline, access.isReady,
      access.isForeground, access.scopes.contains("session:operate") else { return false }
    return threads.contains { $0.id == target.threadID && $0.isArchived }
  }
}

struct ArchivedThreadDay: Identifiable {
  struct Entry: Identifiable {
    let thread: RemoteThread
    let timestamp: Date?
    var id: String { thread.id }
  }

  let day: Date?
  let entries: [Entry]
  var id: Date? { day }

  @MainActor
  static func group(_ threads: [RemoteThread], calendar: Calendar) -> [Self] {
    let entries = threads.filter(\.isArchived).map { thread in
      Entry(thread: thread, timestamp: thread.archivedAt.flatMap(PoracodeThreadRelativeDate.parse)
        ?? PoracodeThreadRelativeDate.parse(thread.updatedAt))
    }.sorted {
      let first = $0.timestamp ?? .distantPast
      let second = $1.timestamp ?? .distantPast
      return first == second ? $0.id < $1.id : first > second
    }
    let sections = Dictionary(grouping: entries) { entry in
      entry.timestamp.map { calendar.startOfDay(for: $0) }
    }
    return sections.map { Self(day: $0.key, entries: $0.value) }
      .sorted { ($0.day ?? .distantPast) > ($1.day ?? .distantPast) }
  }
}
