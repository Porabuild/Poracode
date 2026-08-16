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
      Button(ThreadLifecycleStrings.rename, systemImage: "pencil") {
        perform(.rename)
      }
      Button(ThreadLifecycleStrings.relaunch, systemImage: "arrow.clockwise") {
        perform(.relaunch)
      }
      Button(
        thread.isStarred ? ThreadLifecycleStrings.unpin : ThreadLifecycleStrings.pin,
        systemImage: thread.isStarred ? "star.slash" : "star"
      ) {
        perform(.setPinned(!thread.isStarred))
      }
      Button(
        thread.isDone ? ThreadLifecycleStrings.markNotDone : ThreadLifecycleStrings.markDone,
        systemImage: thread.isDone ? "circle" : "checkmark.circle"
      ) {
        perform(.setDone(!thread.isDone))
      }
      Button(ThreadLifecycleStrings.acknowledge, systemImage: "checkmark.message") {
        perform(.acknowledge)
      }
      Divider()
      if thread.isArchived {
        Button(ThreadLifecycleStrings.unarchive, systemImage: "archivebox") {
          perform(.unarchive)
        }
      } else {
        Button(ThreadLifecycleStrings.archive, systemImage: "archivebox", role: .destructive) {
          perform(.archive)
        }
      }
      Button(ThreadLifecycleStrings.delete, systemImage: "trash", role: .destructive) {
        perform(.delete)
      }
    } label: {
      if isBusy {
        ProgressView()
          .controlSize(.small)
      } else {
        Image(systemName: "ellipsis.circle")
      }
    }
    .disabled(!enabled || isBusy)
    .accessibilityLabel(ThreadLifecycleStrings.actions)
  }
}

enum ThreadLifecycleMenuAction {
  case rename
  case relaunch
  case setPinned(Bool)
  case setDone(Bool)
  case acknowledge
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
