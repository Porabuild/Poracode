import Observation
import SwiftUI

/// Owns lifecycle actions launched from the cross-host Home list. Mutations are
/// allowed only for the currently selected, foreground, online host; cached rows
/// from another desktop remain readable but cannot accidentally target it.
@MainActor
@Observable
final class HomeThreadLifecycleCoordinator {
  unowned let session: AppSession
  let controller: ThreadLifecycleController
  let richChat: RichChatControllerSuite

  var renameIntent: ThreadRenameIntent?
  var relaunchIntent: ThreadRelaunchIntent?
  var closeIntent: UnifiedThreadListItem?
  var failureMessage: String?
  private(set) var isClosing = false
  private var closeRevision: UInt64 = 0

  init(session: AppSession) {
    self.session = session
    controller = session.makeThreadLifecycleController()
    richChat = session.makeRichChatControllerSuite()
  }

  func canClose(_ item: UnifiedThreadListItem) -> Bool {
    canOperate(item)
      && !isClosing
      && item.thread.status != "inactive"
      && item.thread.status != "launching"
      && session.currentRichChatAccess?.controllerGate(.sessionOperate) == nil
  }

  func requestClose(_ item: UnifiedThreadListItem) {
    guard canClose(item) else { return }
    closeIntent = item
  }

  func confirmClose() {
    guard let item = closeIntent, canClose(item),
      let access = session.currentRichChatAccess,
      item.connectionID == access.lease.connectionID
    else {
      closeIntent = nil
      return
    }
    closeIntent = nil
    richChat.select(access: access, threadID: item.thread.id)
    closeRevision &+= 1
    let revision = closeRevision
    isClosing = true
    Task {
      await richChat.conversation.close()
      guard closeRevision == revision else { return }
      isClosing = false
      if let failure = richChat.conversation.state.failure {
        failureMessage = RichChatStrings.failure(failure)
      } else {
        await session.refreshUnifiedThreadList()
      }
      richChat.deselect()
    }
  }

  func cancelClose() {
    closeIntent = nil
  }

  func canOperate(_ item: UnifiedThreadListItem) -> Bool {
    guard !controller.isBusy, !isClosing,
      item.connectionID == session.selectedConnectionId,
      session.threadLifecycleTarget(threadID: item.thread.id) != nil,
      let access = session.currentThreadSessionAccess
    else { return false }
    return access.isReady
      && access.isOnline
      && access.isForeground
      && access.scopes.contains("session:operate")
  }

  func perform(_ action: ThreadLifecycleMenuAction, on item: UnifiedThreadListItem) {
    guard canOperate(item),
      let target = session.threadLifecycleTarget(threadID: item.thread.id)
    else { return }
    controller.activate(target)
    switch action {
    case .rename:
      requestRename(item.thread, target: target)
    case .relaunch:
      relaunchIntent = ThreadRelaunchIntent(
        id: item.thread.id,
        thread: item.thread,
        target: target
      )
    case .setPinned(let pinned):
      run { [controller] in await controller.setPinned(pinned, target: target) }
    case .setDone(let done):
      run { [controller] in await controller.setDone(done, target: target) }
    case .acknowledge:
      run { [controller] in await controller.acknowledge(target: target) }
    case .removeFromGroup:
      run { [controller] in await controller.clearGroup(target: target) }
    case .archive:
      controller.archive()
    case .unarchive:
      run { [controller] in await controller.unarchive(target: target) }
    case .delete:
      controller.delete()
    }
  }

  func requestRename(_ thread: RemoteThread, target: ThreadLifecycleTarget) {
    guard !controller.isBusy, !isClosing,
      session.threadLifecycleTarget(threadID: thread.id) == target
    else { return }
    renameIntent = ThreadRenameIntent(id: thread.id, thread: thread, target: target, title: thread.title)
  }

  func submitRename() {
    guard let intent = renameIntent,
      session.threadLifecycleTarget(threadID: intent.thread.id) == intent.target
    else { return }
    let title = intent.title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty else { return }
    renameIntent = nil
    controller.activate(intent.target)
    run { [controller] in await controller.rename(to: title, target: intent.target) }
  }

  func submitRelaunch(intent: ThreadRelaunchIntent, prompt: String) {
    guard session.threadLifecycleTarget(threadID: intent.thread.id) == intent.target,
      let request = session.threadStartExistingRequest(
        threadID: intent.thread.id,
        prompt: prompt
      )
    else { return }
    controller.activate(intent.target)
    run { [controller] in await controller.start(request, target: intent.target) }
  }

  func confirmDestructiveIntent(_ intent: ThreadLifecycleDestructiveIntent) {
    run { [controller] in await controller.confirmDestructiveIntent(intent) }
  }

  func cancelDestructiveIntent() {
    controller.cancelDestructiveIntent()
  }

  func dismissFailure() {
    failureMessage = nil
    controller.clearLastOutcome()
  }

  func deactivate() {
    closeRevision &+= 1
    isClosing = false
    controller.deactivate()
    richChat.deselect()
    closeIntent = nil
  }

  private func run(_ operation: @escaping @MainActor () async -> Void) {
    Task {
      await operation()
      switch controller.lastOutcome {
      case .succeeded:
        await session.refreshUnifiedThreadList()
      case .failed(_, let failure):
        failureMessage = ThreadLifecycleStrings.failureMessage(failure)
      case nil:
        break
      }
    }
  }
}

struct HomeThreadLifecyclePresentationModifier: ViewModifier {
  @Bindable var coordinator: HomeThreadLifecycleCoordinator

  func body(content: Content) -> some View {
    content
      .environment(coordinator)
      .onDisappear { coordinator.deactivate() }
      .onChange(of: coordinator.session.currentThreadHostLease) { _, lease in
        if let intent = coordinator.renameIntent, intent.target.lease != lease {
          coordinator.renameIntent = nil
        }
      }
      .threadRenameSheet(intent: $coordinator.renameIntent) {
        coordinator.submitRename()
      }
      .sheet(item: $coordinator.relaunchIntent) { intent in
        ThreadRelaunchSheet(
          intent: Binding(
            get: { coordinator.relaunchIntent ?? intent },
            set: { coordinator.relaunchIntent = $0 }
          ),
          isBusy: coordinator.controller.isBusy,
          submit: { coordinator.submitRelaunch(intent: intent, prompt: $0) }
        )
      }
      .threadLifecycleDestructiveConfirmation(controller: coordinator.controller) { intent in
        coordinator.confirmDestructiveIntent(intent)
      }
      .confirmationDialog(
        RichChatStrings.closeThreadConfirmationTitle,
        isPresented: Binding(
          get: { coordinator.closeIntent != nil },
          set: { if !$0 { coordinator.cancelClose() } }
        ),
        titleVisibility: .visible
      ) {
        Button(RichChatStrings.closeThread, role: .destructive) {
          coordinator.confirmClose()
        }
        Button(RichChatStrings.cancel, role: .cancel) {
          coordinator.cancelClose()
        }
      } message: {
        Text(RichChatStrings.closeThreadConfirmationMessage)
      }
      .threadLifecycleFailureAlert(message: $coordinator.failureMessage) {
        coordinator.dismissFailure()
      }
  }
}

extension View {
  func homeThreadLifecyclePresentation(
    _ coordinator: HomeThreadLifecycleCoordinator
  ) -> some View {
    modifier(HomeThreadLifecyclePresentationModifier(coordinator: coordinator))
  }
}
