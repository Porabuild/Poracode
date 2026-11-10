import SwiftUI

struct ThreadRenameIntent: Identifiable {
  let id: String
  let thread: RemoteThread
  let target: ThreadLifecycleTarget
  var title: String
}

struct ThreadRelaunchIntent: Identifiable {
  let id: String
  let thread: RemoteThread
  let target: ThreadLifecycleTarget
  var prompt = ""
}

/// Shared action content for toolbar menus and touch context menus. Keeping one
/// definition prevents the compact Home list from drifting from project/thread pages.
struct ThreadLifecycleActionsContent: View {
  let thread: RemoteThread
  let enabled: Bool
  let isBusy: Bool
  let perform: (ThreadLifecycleMenuAction) -> Void

  var body: some View {
    Group {
      ThreadLifecyclePrimaryActionsContent(thread: thread, perform: perform)
      Divider()
      if thread.isArchived {
        Button {
          perform(.unarchive)
        } label: {
          PoracodeActionLabel(ThreadLifecycleStrings.unarchive, systemImage: "archivebox")
        }
        .buttonStyle(.plain)
      } else {
        Button(role: .destructive) {
          perform(.archive)
        } label: {
          PoracodeActionLabel(
            ThreadLifecycleStrings.archive,
            systemImage: "archivebox",
            tone: .destructive
          )
        }
        .buttonStyle(.plain)
      }
      Button(role: .destructive) {
        perform(.delete)
      } label: {
        PoracodeActionLabel(
          ThreadLifecycleStrings.delete,
          systemImage: "trash",
          tone: .destructive
        )
      }
      .buttonStyle(.plain)
    }
    .disabled(!enabled || isBusy)
  }
}

/// The subset of primary lifecycle actions a surface wants to render. The
/// compact Home menu shows all of them; the thread detail drawer pulls
/// rename/done/pin into the shared PWA order and keeps the rest as extras.
struct ThreadLifecyclePrimaryActions: OptionSet {
  let rawValue: Int
  static let rename = ThreadLifecyclePrimaryActions(rawValue: 1 << 0)
  static let relaunch = ThreadLifecyclePrimaryActions(rawValue: 1 << 1)
  static let pin = ThreadLifecyclePrimaryActions(rawValue: 1 << 2)
  static let done = ThreadLifecyclePrimaryActions(rawValue: 1 << 3)
  static let acknowledge = ThreadLifecyclePrimaryActions(rawValue: 1 << 4)
  static let removeFromGroup = ThreadLifecyclePrimaryActions(rawValue: 1 << 5)
  static let all: ThreadLifecyclePrimaryActions = [
    .rename, .relaunch, .pin, .done, .acknowledge, .removeFromGroup,
  ]
}

struct ThreadLifecyclePrimaryActionsContent: View {
  let thread: RemoteThread
  let perform: (ThreadLifecycleMenuAction) -> Void
  var actions: ThreadLifecyclePrimaryActions = .all

  var body: some View {
    Group {
      if actions.contains(.rename) {
        Button {
          perform(.rename)
        } label: {
          PoracodeActionLabel(ThreadLifecycleStrings.rename, systemImage: "pencil")
        }
        .buttonStyle(.plain)
      }
      if actions.contains(.relaunch) {
        Button {
          perform(.relaunch)
        } label: {
          PoracodeActionLabel(ThreadLifecycleStrings.relaunch, systemImage: "arrow.clockwise")
        }
        .buttonStyle(.plain)
      }
      if actions.contains(.pin) {
        Button {
          perform(.setPinned(!thread.isStarred))
        } label: {
          PoracodeActionLabel(
            thread.isStarred ? ThreadLifecycleStrings.unpin : ThreadLifecycleStrings.pin,
            systemImage: thread.isStarred ? "star.slash" : "star"
          )
        }
        .buttonStyle(.plain)
      }
      if actions.contains(.done) {
        Button {
          perform(.setDone(!thread.isDone))
        } label: {
          PoracodeActionLabel(
            thread.isDone ? ThreadLifecycleStrings.markNotDone : ThreadLifecycleStrings.markDone,
            systemImage: thread.isDone ? "circle" : "checkmark.circle"
          )
        }
        .buttonStyle(.plain)
      }
      if actions.contains(.acknowledge) {
        Button {
          perform(.acknowledge)
        } label: {
          PoracodeActionLabel(
            ThreadLifecycleStrings.acknowledge,
            systemImage: "checkmark.message"
          )
        }
        .buttonStyle(.plain)
      }
      if actions.contains(.removeFromGroup), thread.groupId != nil {
        Button {
          perform(.removeFromGroup)
        } label: {
          PoracodeActionLabel(
            ThreadLifecycleStrings.removeFromGroup,
            systemImage: "rectangle.portrait.on.rectangle.portrait.slash"
          )
        }
        .buttonStyle(.plain)
      }
    }
  }
}

enum ThreadLifecycleMenuAction {
  case rename
  case relaunch
  case setPinned(Bool)
  case setDone(Bool)
  case acknowledge
  case removeFromGroup
  case archive
  case unarchive
  case delete
}

struct ThreadRelaunchSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var intent: ThreadRelaunchIntent
  let isBusy: Bool
  let submit: (String) -> Void

  var body: some View {
    NavigationStack {
      Form {
        TextField(
          ThreadLifecycleStrings.relaunchPrompt,
          text: $intent.prompt,
          axis: .vertical
        )
        .lineLimit(3...8)
      }
      .navigationTitle(ThreadLifecycleStrings.relaunch)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(ThreadLifecycleStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(ThreadLifecycleStrings.submit) {
            let prompt = intent.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
            submit(prompt)
            dismiss()
          }
          .disabled(intent.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isBusy)
        }
      }
    }
    .presentationDetents([.medium])
  }
}

extension ThreadConfig {
  var lifecycleLaunchConfiguration: ThreadLaunchConfiguration {
    ThreadLaunchConfiguration(
      model: model,
      effort: effort,
      contextSize: contextSize,
      fast: fast,
      thinking: thinking,
      workflows: workflows,
      mode: mode,
      approvalPolicy: approvalPolicy,
      approvalsReviewer: approvalsReviewer,
      sandboxMode: sandboxMode,
      browserMcp: browserMcp,
      crossagentMcp: crossagentMcp,
      computerUse: computerUse,
      chromeMcp: chromeMcp,
      executionEnvironment: executionEnvironment,
      mcpServerOverrides: mcpServerOverrides,
      pluginOverrides: pluginOverrides,
      crew: crew
    )
  }
}
