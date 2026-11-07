import Foundation
import SwiftUI

// MARK: - Background tasks

struct RichChatBackgroundTaskSelection: Identifiable, Hashable {
  let taskID: String
  var id: String { taskID }
}

/// Sidebar section for the selected thread's live background roster. Mirrors
/// the desktop dock: one row per task with its display class, known age and a
/// genuine progress report, opening one shared details surface.
struct RichChatBackgroundTasksPanel: View {
  let suite: RichChatControllerSuite
  let tasks: [RichBackgroundTaskPresentation]
  let canOperate: Bool

  @State private var selection: RichChatBackgroundTaskSelection?
  /// Owned by the persistent panel (not the transient details sheet) so a
  /// close/reopen of the same details reuses one transport-read attempt.
  @State private var reader: RichChatBackgroundTaskDetailsController

  init(
    suite: RichChatControllerSuite,
    tasks: [RichBackgroundTaskPresentation],
    canOperate: Bool
  ) {
    self.suite = suite
    self.tasks = tasks
    self.canOperate = canOperate
    _selection = State(initialValue: nil)
    _reader = State(
      initialValue: RichChatBackgroundTaskDetailsController(
        sessionActions: suite.sessionActions
      )
    )
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Label(RichChatStrings.backgroundTasks, systemImage: "gearshape.2")
          .poracodeChatText(.body, weight: .semibold)
        Spacer(minLength: 4)
        Text(tasks.count.formatted())
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
      }
      RichChatBackgroundTasksList(tasks: tasks) { taskID in
        selection = RichChatBackgroundTaskSelection(taskID: taskID)
      }
    }
    .padding(12)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("background-tasks-panel")
    .sheet(item: $selection) { selection in
      RichChatBackgroundTaskDetailsView(
        suite: suite,
        taskID: selection.taskID,
        canOperate: canOperate,
        reader: reader
      )
    }
  }
}

struct RichChatBackgroundTasksList: View {
  let tasks: [RichBackgroundTaskPresentation]
  let open: (String) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      ForEach(tasks) { task in
        RichChatBackgroundTaskRow(task: task) {
          open(task.id)
        }
        if task.id != (tasks.last?.id ?? "") {
          Divider().opacity(0.35)
        }
      }
    }
  }
}

/// One row. Purpose once, category and known age once, genuine progress once;
/// no placeholder for a missing progress report.
struct RichChatBackgroundTaskRow: View {
  let task: RichBackgroundTaskPresentation
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(spacing: 9) {
        Image(systemName: task.category.systemImage)
          .foregroundStyle(.tint)
          .frame(width: 18)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(task.label)
            .poracodeChatText(.metadata, weight: .semibold)
            .fontDesign(task.commandIsLabel ? .monospaced : .default)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
          metadata
        }
        Spacer(minLength: 4)
        Image(systemName: "chevron.right")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.tertiary)
          .accessibilityHidden(true)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(task.label)
    .accessibilityValue(accessibilityValue)
    .accessibilityIdentifier("background-task-open:\(task.id)")
  }

  private var metadata: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      HStack(spacing: 4) {
        Text(task.category.label)
        if let age = age(at: context.date) {
          separator
          Text(age)
        }
        if let progress = task.progress {
          separator
          Text(progress).lineLimit(1)
        }
      }
      .poracodeChatText(.metadata)
      .foregroundStyle(.secondary)
    }
  }

  private func age(at now: Date) -> String? {
    guard let startedAt = task.startedAtMilliseconds else { return nil }
    return RichBackgroundTaskElapsed.text(startedAtMilliseconds: startedAt, now: now)
  }

  private var separator: some View {
    Text(verbatim: "·").accessibilityHidden(true)
  }

  private var accessibilityValue: String {
    var parts = [task.category.label]
    if let progress = task.progress { parts.append(progress) }
    return parts.joined(separator: ", ")
  }
}

/// The one selected-task surface, used from both the sidebar and the compact
/// controls. Reads poll only while this surface is visible, the scene is
/// active, and the task still has an output capability; Stop is an independent
/// exclusive attempt.
struct RichChatBackgroundTaskDetailsView: View {
  let suite: RichChatControllerSuite
  let taskID: String
  let canOperate: Bool
  /// Owned by the persistent panel/sheet so close/reopen can reuse the reader's
  /// single in-flight transport attempt.
  let reader: RichChatBackgroundTaskDetailsController

  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase

  init(
    suite: RichChatControllerSuite,
    taskID: String,
    canOperate: Bool,
    reader: RichChatBackgroundTaskDetailsController
  ) {
    self.suite = suite
    self.taskID = taskID
    self.canOperate = canOperate
    self.reader = reader
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        if let task, let presentation {
          VStack(alignment: .leading, spacing: 18) {
            header(presentation)
            TimelineView(.periodic(from: .now, by: 1)) { context in
              metadata(presentation, now: context.date)
            }
            if presentation.showsCommandSection, let command = presentation.command {
              section(RichChatStrings.command) {
                boundedCode(command, identifier: "background-task-command")
              }
            }
            outputSection(presentation)
            stopFailure
          }
          .padding()
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityElement(children: .contain)
          .accessibilityIdentifier("background-task-details")
        }
      }
      .navigationTitle(RichChatStrings.backgroundTask)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.done) {
            reader.stopReading()
            dismiss()
          }
          .accessibilityIdentifier("background-task-close")
        }
        if let key = stopKey, let action = stopAction {
          ToolbarItem(placement: .primaryAction) {
            stopButton(identity: key, action: action)
          }
        }
      }
      .onAppear {
        guard task != nil else {
          dismiss()
          return
        }
        syncRead()
      }
      .onChange(of: scenePhase) { _, _ in syncRead() }
      .onChange(of: readKey?.value) { _, _ in syncRead() }
      .onChange(of: isOperable) { _, _ in syncRead() }
      .onChange(of: suite.sessionActions.state.actionIDs) { _, _ in syncRead() }
      .onChange(of: taskIDs) { _, ids in
        if ids?.contains(taskID) != true {
          reader.stopReading()
          dismiss()
        }
      }
      .onDisappear { reader.stopReading() }
    }
  }

  private var task: RemoteBackgroundTaskIdentity? {
    suite.transcript.state.backgroundTasks?.first { $0.taskId == taskID }
  }

  private var presentation: RichBackgroundTaskPresentation? {
    task.map(RichBackgroundTaskPresentation.init)
  }

  private var taskIDs: [String]? {
    suite.transcript.state.backgroundTasks?.map(\.taskId)
  }

  private var readKey: RichChatBackgroundTaskReadKey? {
    guard let task, let action = task.outputAction else { return nil }
    return RichChatBackgroundTaskReadKey(
      lease: suite.sessionActions.state.target?.lease,
      owner: suite.sessionActions.state.owner,
      taskID: task.taskId,
      action: action
    )
  }

  private var stopKey: RichChatBackgroundTaskReadKey? {
    guard let task, let action = task.stopAction else { return nil }
    return RichChatBackgroundTaskReadKey(
      lease: suite.sessionActions.state.target?.lease,
      owner: suite.sessionActions.state.owner,
      taskID: task.taskId,
      action: action
    )
  }

  private var stopAction: RemoteBackgroundTaskStopAction? {
    guard canOperate, isOperable, let action = task?.stopAction,
      listedActionIDs.contains(action.id)
    else { return nil }
    return action
  }

  private var isOperable: Bool {
    canOperate && !suite.requiresAuthoritativeRefresh
      && suite.sessionActions.state.access?.controllerGate(.sessionOperate) == nil
  }

  private var listedActionIDs: Set<String> {
    Set(suite.sessionActions.state.actionIDs)
  }

  private var outputActionListed: Bool {
    guard let action = task?.outputAction else { return false }
    return listedActionIDs.contains(action.id)
  }

  private var inventoryLoading: Bool {
    suite.sessionActions.state.inventoryRefreshing && listedActionIDs.isEmpty
  }

  private func header(_ presentation: RichBackgroundTaskPresentation) -> some View {
    HStack(alignment: presentation.commandIsLabel ? .top : .firstTextBaseline, spacing: 10) {
      Image(systemName: presentation.category.systemImage)
        .font(.title3)
        .foregroundStyle(.tint)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 3) {
        if presentation.commandIsLabel {
          boundedCode(presentation.label, identifier: "background-task-command")
        } else {
          Text(presentation.label)
            .font(.headline)
        }
        Text(presentation.category.label)
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: presentation.commandIsLabel ? .contain : .combine)
  }

  @ViewBuilder
  private func metadata(
    _ presentation: RichBackgroundTaskPresentation,
    now: Date
  ) -> some View {
    if presentation.startedAtMilliseconds != nil || presentation.progress != nil {
      VStack(alignment: .leading, spacing: 5) {
        if let startedAt = presentation.startedAtMilliseconds {
          Text(
            RichChatStrings.backgroundTaskRunningFor(
              RichBackgroundTaskElapsed.text(startedAtMilliseconds: startedAt, now: now)
            ))
        }
        if let progress = presentation.progress {
          Text(progress)
            .textSelection(.enabled)
            .foregroundStyle(.primary)
        }
        if presentation.progress != nil, let lastProgressAt = presentation.lastProgressAtMilliseconds {
          Text(
            RichChatStrings.backgroundTaskLastProgress(
              RichBackgroundTaskElapsed.text(
                startedAtMilliseconds: lastProgressAt, now: now)
            ))
        }
      }
      .poracodeChatText(.metadata)
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder
  private func outputSection(_ presentation: RichBackgroundTaskPresentation) -> some View {
    section(RichChatStrings.backgroundTaskOutput) {
      if presentation.outputAction == nil {
        Text(RichChatStrings.backgroundTaskOutputUnavailable)
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("background-task-output")
      } else if !isOperable {
        Text(outputAccessMessage)
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("background-task-output")
      } else if inventoryLoading {
        loadingOutput
      } else if let failure = suite.sessionActions.state.inventoryFailure {
        VStack(alignment: .leading, spacing: 8) {
          Text(RichChatStrings.failure(failure))
            .poracodeChatText(.metadata)
            .foregroundStyle(.red)
            .accessibilityIdentifier("background-task-output")
          inventoryRetryButton
        }
      } else if outputActionListed, let key = readKey, let action = presentation.outputAction {
        outputState(identity: key, action: action)
      } else {
        // The live inventory is authoritative for invokable actions; an
        // unlisted output action is not offered rather than failing on tap.
        Text(RichChatStrings.backgroundTaskOutputUnavailable)
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("background-task-output")
      }
    }
  }

  private var loadingOutput: some View {
    HStack(spacing: 6) {
      ProgressView().controlSize(.small)
      Text(RichChatStrings.backgroundTaskOutputLoading)
    }
    .poracodeChatText(.metadata)
    .foregroundStyle(.secondary)
    .accessibilityIdentifier("background-task-output")
  }

  private var inventoryRetryButton: some View {
    Button(RichChatStrings.retry) {
      Task { await suite.sessionActions.refreshInventory() }
    }
    .buttonStyle(.bordered)
    .accessibilityIdentifier("background-task-output-retry")
  }

  /// Neutral, local explanation for a read-only details surface when this
  /// client may not invoke the read. Never a global thread error.
  private var outputAccessMessage: String {
    if let failure = suite.sessionActions.state.access?.controllerGate(.sessionOperate) {
      return RichChatStrings.failure(failure)
    }
    return RichChatStrings.refreshRequired
  }

  @ViewBuilder
  private func outputState(
    identity: RichChatBackgroundTaskReadKey,
    action: RemoteBackgroundTaskStopAction
  ) -> some View {
    switch reader.displayedOutput(for: identity.value) {
    case .idle, .loading:
      HStack(spacing: 6) {
        ProgressView().controlSize(.small)
        Text(RichChatStrings.backgroundTaskOutputLoading)
      }
      .poracodeChatText(.metadata)
      .foregroundStyle(.secondary)
      .accessibilityIdentifier("background-task-output")
    case .failed:
      VStack(alignment: .leading, spacing: 8) {
        Text(RichChatStrings.backgroundTaskOutputFailed)
          .poracodeChatText(.metadata)
          .foregroundStyle(.red)
          .accessibilityIdentifier("background-task-output")
        Button(RichChatStrings.retry) {
          reader.retry(identity: identity, action: action)
        }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("background-task-output-retry")
      }
    case .ready(let output):
      VStack(alignment: .leading, spacing: 8) {
        if output.truncated {
          Text(RichChatStrings.backgroundTaskOutputTruncated(output.totalBytes.formatted()))
            .poracodeChatText(.metadata)
            .foregroundStyle(.secondary)
        }
        if output.output.isEmpty {
          Text(RichChatStrings.backgroundTaskOutputEmpty)
            .poracodeChatText(.metadata)
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("background-task-output")
        } else {
          ScrollView(.vertical) {
            Text(output.output)
              .font(.footnote.monospaced())
              .textSelection(.enabled)
              .frame(maxWidth: .infinity, alignment: .leading)
              .accessibilityIdentifier("background-task-output")
          }
          .frame(maxHeight: 320)
        }
      }
    }
  }

  private func stopButton(
    identity: RichChatBackgroundTaskReadKey,
    action: RemoteBackgroundTaskStopAction
  ) -> some View {
    let state = reader.displayedStopState(for: identity.value)
    return Button(role: .destructive) {
      Task { await reader.stop(identity: identity, action: action) }
    } label: {
      if state?.isPending == true {
        ProgressView().controlSize(.small)
      } else {
        Label(RichChatStrings.backgroundTaskStop, systemImage: "stop.fill")
          .labelStyle(.iconOnly)
      }
    }
    .disabled(state?.isPending == true)
    .accessibilityIdentifier("background-task-stop")
    .accessibilityLabel(
      state?.isPending == true
        ? RichChatStrings.backgroundTaskStopping : RichChatStrings.backgroundTaskStop
    )
  }

  @ViewBuilder
  private var stopFailure: some View {
    if let key = stopKey, let failure = reader.displayedStopState(for: key.value)?.failure {
      Label(RichChatStrings.failure(failure), systemImage: "exclamationmark.triangle")
        .font(.footnote)
        .foregroundStyle(.red)
        .accessibilityIdentifier("background-task-stop-error")
    }
  }

  private func section<Content: View>(
    _ title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .poracodeChatText(.metadata, weight: .semibold)
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func boundedCode(_ text: String, identifier: String) -> some View {
    ScrollView(.vertical) {
      Text(text)
        .font(.footnote.monospaced())
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier(identifier)
    }
    .frame(maxHeight: 220)
  }

  private func syncRead() {
    guard scenePhase == .active, isOperable, outputActionListed, let key = readKey,
      let action = task?.outputAction
    else {
      reader.stopReading()
      return
    }
    reader.startReading(identity: key, action: action)
  }
}
