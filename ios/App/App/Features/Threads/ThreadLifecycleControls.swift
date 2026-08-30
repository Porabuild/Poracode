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

struct ThreadLifecycleActionMenu: View {
  let thread: RemoteThread
  let enabled: Bool
  let isBusy: Bool
  let perform: (ThreadLifecycleMenuAction) -> Void

  var body: some View {
    Menu {
      ThreadLifecycleActionsContent(
        thread: thread,
        enabled: enabled,
        isBusy: isBusy,
        perform: perform
      )
    } label: {
      if isBusy {
        ProgressView()
          .controlSize(.small)
      } else {
        Image(systemName: "ellipsis.circle")
          .foregroundStyle(.secondary)
      }
    }
    .disabled(!enabled || isBusy)
    .accessibilityLabel(ThreadLifecycleStrings.actions)
  }
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

struct ThreadLifecyclePrimaryActionsContent: View {
  let thread: RemoteThread
  let perform: (ThreadLifecycleMenuAction) -> Void

  var body: some View {
    Group {
      Button {
        perform(.rename)
      } label: {
        PoracodeActionLabel(ThreadLifecycleStrings.rename, systemImage: "pencil")
      }
      .buttonStyle(.plain)
      Button {
        perform(.relaunch)
      } label: {
        PoracodeActionLabel(ThreadLifecycleStrings.relaunch, systemImage: "arrow.clockwise")
      }
      .buttonStyle(.plain)
      Button {
        perform(.setPinned(!thread.isStarred))
      } label: {
        PoracodeActionLabel(
          thread.isStarred ? ThreadLifecycleStrings.unpin : ThreadLifecycleStrings.pin,
          systemImage: thread.isStarred ? "star.slash" : "star"
        )
      }
      .buttonStyle(.plain)
      Button {
        perform(.setDone(!thread.isDone))
      } label: {
        PoracodeActionLabel(
          thread.isDone ? ThreadLifecycleStrings.markNotDone : ThreadLifecycleStrings.markDone,
          systemImage: thread.isDone ? "circle" : "checkmark.circle"
        )
      }
      .buttonStyle(.plain)
      Button {
        perform(.acknowledge)
      } label: {
        PoracodeActionLabel(
          ThreadLifecycleStrings.acknowledge,
          systemImage: "checkmark.message"
        )
      }
      .buttonStyle(.plain)
      if thread.groupId != nil {
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
      mode: mode,
      approvalPolicy: approvalPolicy,
      approvalsReviewer: approvalsReviewer,
      sandboxMode: sandboxMode,
      browserMcp: browserMcp,
      crossagentMcp: crossagentMcp,
      computerUse: computerUse,
      chromeMcp: chromeMcp
    )
  }
}
