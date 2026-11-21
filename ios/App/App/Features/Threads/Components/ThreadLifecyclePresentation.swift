import SwiftUI

enum ThreadLifecycleDestructivePresentation {
  static func title(_ intent: ThreadLifecycleDestructiveIntent?) -> String {
    switch intent {
    case .archive:
      ThreadLifecycleStrings.archiveConfirmation
    case .delete, .deleteWorktreeGroup:
      ThreadLifecycleStrings.deleteConfirmation
    case nil:
      ThreadLifecycleStrings.actions
    }
  }

  static func button(_ intent: ThreadLifecycleDestructiveIntent?) -> String {
    switch intent {
    case .archive:
      ThreadLifecycleStrings.archive
    case .delete, .deleteWorktreeGroup:
      ThreadLifecycleStrings.delete
    case nil:
      ThreadLifecycleStrings.cancel
    }
  }
}

private struct ThreadRenameSheetModifier: ViewModifier {
  @Binding var intent: ThreadRenameIntent?
  let submit: () -> Void

  func body(content: Content) -> some View {
    content.sheet(item: $intent) { request in
      NavigationStack {
        Form {
          TextField(
            ThreadLifecycleStrings.renamePrompt,
            text: Binding(
              get: { intent?.title ?? "" },
              set: { intent?.title = $0 }
            )
          )
          .submitLabel(.done)
          .onSubmit(commit)
          .accessibilityIdentifier("native-e2e.thread.rename.title")
        }
        .navigationTitle(ThreadLifecycleStrings.rename)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(ThreadLifecycleStrings.cancel, systemImage: "xmark") { intent = nil }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button(ThreadLifecycleStrings.rename, systemImage: "checkmark", action: commit)
              .disabled(!canRename)
              .accessibilityIdentifier("native-e2e.thread.rename.submit")
          }
        }
      }
      .nativeCommands(identity: "thread-rename:\(request.id)", blocksParentActions: true)
      .poracodeFormSheetSizing()
      .presentationDetents([.fraction(0.7), .large])
    }
  }

  private var canRename: Bool {
    intent?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
  }

  private func commit() {
    if canRename { submit() }
  }
}

private struct ThreadLifecycleDestructiveConfirmationModifier: ViewModifier {
  @Bindable var controller: ThreadLifecycleController
  let confirm: (ThreadLifecycleDestructiveIntent) -> Void

  func body(content: Content) -> some View {
    content.alert(
      ThreadLifecycleDestructivePresentation.title(controller.pendingDestructiveIntent),
      isPresented: Binding(
        get: { controller.pendingDestructiveIntent != nil },
        set: { if !$0 { controller.cancelDestructiveIntent() } }
      )
    ) {
      Button(ThreadLifecycleDestructivePresentation.button(controller.pendingDestructiveIntent), role: .destructive) {
        guard let intent = controller.takePendingDestructiveIntent() else { return }
        confirm(intent)
      }
      Button(ThreadLifecycleStrings.cancel, role: .cancel) {
        controller.cancelDestructiveIntent()
      }
    }
  }
}

private struct ThreadLifecycleFailureAlertModifier: ViewModifier {
  @Binding var message: String?
  let clear: () -> Void

  func body(content: Content) -> some View {
    content.alert(
      ThreadLifecycleStrings.actionFailed,
      isPresented: Binding(
        get: { message != nil },
        set: { if !$0 { clear() } }
      )
    ) {
      Button(ThreadLifecycleStrings.cancel, role: .cancel, action: clear)
    } message: {
      Text(message ?? "")
    }
  }
}

extension View {
  func threadRenameSheet(
    intent: Binding<ThreadRenameIntent?>,
    submit: @escaping () -> Void
  ) -> some View {
    modifier(ThreadRenameSheetModifier(intent: intent, submit: submit))
  }

  func threadLifecycleDestructiveConfirmation(
    controller: ThreadLifecycleController,
    confirm: @escaping (ThreadLifecycleDestructiveIntent) -> Void
  ) -> some View {
    modifier(
      ThreadLifecycleDestructiveConfirmationModifier(
        controller: controller,
        confirm: confirm
      )
    )
  }

  func threadLifecycleFailureAlert(
    message: Binding<String?>,
    clear: @escaping () -> Void
  ) -> some View {
    modifier(ThreadLifecycleFailureAlertModifier(message: message, clear: clear))
  }
}
