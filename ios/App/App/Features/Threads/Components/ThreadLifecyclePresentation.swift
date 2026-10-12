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

private struct ThreadRenameAlertModifier: ViewModifier {
  @Binding var intent: ThreadRenameIntent?
  let submit: () -> Void

  func body(content: Content) -> some View {
    content.alert(
      ThreadLifecycleStrings.rename,
      isPresented: Binding(
        get: { intent != nil },
        set: { if !$0 { intent = nil } }
      )
    ) {
      TextField(
        ThreadLifecycleStrings.renamePrompt,
        text: Binding(
          get: { intent?.title ?? "" },
          set: { intent?.title = $0 }
        )
      )
      Button(ThreadLifecycleStrings.cancel, role: .cancel) { intent = nil }
      Button(ThreadLifecycleStrings.rename, action: submit)
        .disabled(intent?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }
  }
}

private struct ThreadLifecycleDestructiveConfirmationModifier: ViewModifier {
  @Bindable var controller: ThreadLifecycleController
  let confirm: () -> Void

  func body(content: Content) -> some View {
    content.confirmationDialog(
      ThreadLifecycleDestructivePresentation.title(controller.pendingDestructiveIntent),
      isPresented: Binding(
        get: { controller.pendingDestructiveIntent != nil },
        set: { if !$0 { controller.cancelDestructiveIntent() } }
      ),
      titleVisibility: .visible
    ) {
      Button(
        ThreadLifecycleDestructivePresentation.button(controller.pendingDestructiveIntent),
        role: .destructive,
        action: confirm
      )
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
  func threadRenameAlert(
    intent: Binding<ThreadRenameIntent?>,
    submit: @escaping () -> Void
  ) -> some View {
    modifier(ThreadRenameAlertModifier(intent: intent, submit: submit))
  }

  func threadLifecycleDestructiveConfirmation(
    controller: ThreadLifecycleController,
    confirm: @escaping () -> Void
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
