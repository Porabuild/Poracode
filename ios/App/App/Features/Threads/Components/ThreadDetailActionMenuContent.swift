import SwiftUI

struct ThreadDetailWorktreeContext {
  let path: String
  let branch: String
}

struct ThreadDetailActionMenuContent<LifecycleButtons: View>: View {
  let thread: RemoteThread
  let worktree: ThreadDetailWorktreeContext?
  let canMoveToWorktree: Bool
  let hasHandoffTarget: Bool
  let canOperateLifecycle: Bool
  let canRefresh: Bool
  let canClose: Bool
  let isBusy: Bool
  let selectDestination: (ThreadDetailDestination) -> Void
  let composeInWorktree: (ThreadDetailWorktreeContext) -> Void
  let moveToWorktree: (ThreadWorktreeMoveMode) -> Void
  let chooseHandoff: () -> Void
  let refresh: () -> Void
  let perform: (ThreadLifecycleMenuAction) -> Void
  let requestClose: () -> Void
  @ViewBuilder let lifecycleButtons: () -> LifecycleButtons

  var body: some View {
    Menu {
      // Shared PWA/Android order: Rename · Notes & to-dos · Open terminal ·
      // worktree moves · Mark Done · Pin to top.
      Section {
        lifecycleButton(
          ThreadLifecycleStrings.rename, systemImage: "pencil",
          action: .rename
        )
        destinationButton(ThreadLifecycleStrings.notesTodos, systemImage: "checklist", .notes)
        destinationButton(ThreadLifecycleStrings.openTerminal, systemImage: "terminal", .terminal)
        worktreeButtons
        lifecycleButton(
          thread.isDone ? ThreadLifecycleStrings.markNotDone : ThreadLifecycleStrings.markDone,
          systemImage: thread.isDone ? "circle" : "checkmark.circle",
          action: .setDone(!thread.isDone)
        )
        lifecycleButton(
          thread.isStarred ? ThreadLifecycleStrings.unpin : ThreadLifecycleStrings.pin,
          systemImage: thread.isStarred ? "star.slash" : "star",
          action: .setPinned(!thread.isStarred)
        )
      }

      // iOS extras, then the remaining lifecycle actions and Close thread.
      Section {
        destinationButton(ProjectWorkspaceStrings.files, systemImage: "folder", .files)
        destinationButton(
          ProjectWorkspaceStrings.git,
          systemImage: "arrow.triangle.branch",
          .git
        )
        destinationButton(
          AdvancedOperationsStrings.openFromThread,
          systemImage: "slider.horizontal.3",
          .advanced
        )
        if hasHandoffTarget {
          Button {
            chooseHandoff()
          } label: {
            PoracodeActionLabel(
              RichChatStrings.continueInProvider,
              systemImage: "arrow.trianglehead.2.clockwise"
            )
          }
          .buttonStyle(.plain)
          .disabled(!canOperateLifecycle)
        }
        Button(action: refresh) {
          PoracodeActionLabel(
            RichChatStrings.refreshTranscript,
            systemImage: "arrow.clockwise"
          )
        }
        .buttonStyle(.plain)
        .disabled(!canRefresh)
        lifecycleButtons().disabled(!canOperateLifecycle)
        Button(role: .destructive) {
          requestClose()
        } label: {
          PoracodeActionLabel(
            RichChatStrings.closeThread,
            systemImage: "xmark.circle",
            tone: .destructive
          )
        }
        .buttonStyle(.plain)
        .disabled(!canClose)
      }

      Section {
        if thread.isArchived {
          Button {
            perform(.unarchive)
          } label: {
            PoracodeActionLabel(ThreadLifecycleStrings.unarchive, systemImage: "archivebox")
          }
          .buttonStyle(.plain)
          .disabled(!canOperateLifecycle)
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
          .disabled(!canOperateLifecycle)
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
        .disabled(!canOperateLifecycle)
      }
    } label: {
      if isBusy {
        ProgressView().controlSize(.small)
      } else {
        Image(systemName: "ellipsis")
          .foregroundStyle(.secondary)
      }
    }
    .tint(.secondary)
    .accessibilityLabel(ThreadLifecycleStrings.actions)
  }

  @ViewBuilder
  private var worktreeButtons: some View {
    if let worktree {
      Button {
        composeInWorktree(worktree)
      } label: {
        PoracodeActionLabel(ThreadLifecycleStrings.newInWorktree, systemImage: "plus.bubble")
      }
      .buttonStyle(.plain)
    } else {
      Button {
        moveToWorktree(.withChanges)
      } label: {
        PoracodeActionLabel(
          ThreadLifecycleStrings.moveToWorktreeWithChanges,
          systemImage: "arrow.triangle.merge"
        )
      }
      .buttonStyle(.plain)
      .disabled(!canMoveToWorktree)
      Button {
        moveToWorktree(.clean)
      } label: {
        PoracodeActionLabel(
          ThreadLifecycleStrings.moveToCleanWorktree,
          systemImage: "arrow.triangle.branch"
        )
      }
      .buttonStyle(.plain)
      .disabled(!canMoveToWorktree)
    }
  }

  private func lifecycleButton(
    _ title: String, systemImage: String, action: ThreadLifecycleMenuAction
  ) -> some View {
    Button {
      perform(action)
    } label: {
      PoracodeActionLabel(title, systemImage: systemImage)
    }
    .buttonStyle(.plain)
    .disabled(!canOperateLifecycle)
  }

  private func destinationButton(
    _ title: String,
    systemImage: String,
    _ destination: ThreadDetailDestination
  ) -> some View {
    Button {
      selectDestination(destination)
    } label: {
      PoracodeActionLabel(title, systemImage: systemImage)
    }
    .buttonStyle(.plain)
  }
}
