import SwiftUI

/// Page-local state for forking a conversation from a completed message and for
/// navigating to the fork or back to its source.
struct RichChatForkState {
  var anchor: String?
  var title = ""
  var id = UUID().uuidString
  var pending = false
  var attempt: RichChatThreadCommand?
  var destination: RemoteThread?
  var navigationGeneration: UInt64 = 0
  var navigationFailure = false
  var pageVisible = false
}

/// Fork sheet, source link, and navigation presentation for `RichChatThreadView`.
struct RichChatForkPresentation: ViewModifier {
  let page: RichChatThreadView

  func body(content: Content) -> some View {
    content
      .sheet(
        isPresented: Binding(
          get: { page.fork.anchor != nil },
          set: { if !$0 && !page.fork.pending { page.fork.anchor = nil } }
        )
      ) {
        sheet
          .poracodeFormSheetSizing()
          .modifier(PoracodeRetainNavigationWhilePresented())
      }
      .modifier(
        PoracodeRetainNavigationWhilePresented(
          isPresented: page.fork.anchor != nil || page.fork.destination != nil
        )
      )
      .navigationDestination(item: page.$fork.destination) { destination in
        let sourceConnection = page.session.selectedConnectionId
        RichChatThreadView(
          session: page.session, threadID: destination.id, title: destination.title,
          returnToForkSource: { id in
            guard id == page.threadID, page.session.selectedConnectionId == sourceConnection else {
              return false
            }
            page.fork.destination = nil
            return true
          }
        )
        .modifier(PoracodeRetainNavigationWhilePresented())
      }
      .alert(
        RichChatMessageActionStrings.sourceUnavailable,
        isPresented: Binding(
          get: { page.fork.navigationFailure && page.fork.anchor == nil },
          set: { if !$0 { page.fork.navigationFailure = false } }
        )
      ) { Button(RichChatStrings.cancel, role: .cancel) { page.fork.navigationFailure = false } }
      .onChange(of: page.activationID) {
        page.fork.navigationGeneration &+= 1
        page.fork.anchor = nil
        page.fork.attempt = nil
        page.fork.pending = false
        page.fork.destination = nil
        page.fork.navigationFailure = false
      }
      .onAppear { page.fork.pageVisible = true }
      .onDisappear {
        page.fork.pageVisible = false
        page.fork.pending = false
        page.fork.navigationGeneration &+= 1
      }
  }

  private var sheet: some View {
    NavigationStack {
      VStack(spacing: 0) {
        ScrollView {
          VStack(alignment: .leading, spacing: 14) {
            Text(RichChatMessageActionStrings.forkExplanation)
              .font(.subheadline)
              .foregroundStyle(Color.poracodeSecondaryLabel)
            TextField(RichChatMessageActionStrings.forkName, text: page.$fork.title)
              .padding(.horizontal, 12)
              .frame(minHeight: 44)
              .poracodeInputSurface()
              .disabled(page.fork.pending || page.fork.attempt != nil)
              .submitLabel(.done)
              .onSubmit { page.createFork() }
            if let failure = page.suite.conversation.state.failure {
              Text(RichChatStrings.failure(failure)).foregroundStyle(.red)
            }
            if page.fork.navigationFailure {
              Text(RichChatMessageActionStrings.sourceUnavailable).foregroundStyle(.red)
            }
          }
          .poracodeReadableWidth(540)
          .padding(16)
        }
        .clipped()
      }
      .navigationTitle(RichChatMessageActionStrings.forkTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { page.fork.anchor = nil }.disabled(page.fork.pending)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatMessageActionStrings.forkCreate) { page.createFork() }
            .disabled(!page.canSubmitFork)
        }
      }
      .interactiveDismissDisabled(page.fork.pending)
    }
  }
}

extension RichChatThreadView {
  var forkBoundaryID: String? { thread?.forkedFrom?["throughItemId"]?.stringValue }

  var forkSourceLink: (title: String, open: () -> Void)? {
    guard let source = thread?.forkedFrom?.objectValue,
      let sourceID = source["threadId"]?.stringValue,
      let sourceTitle = source["title"]?.stringValue
    else { return nil }
    return (
      RichChatMessageActionStrings.forkSource(sourceTitle), { navigateToForkThread(sourceID) }
    )
  }

  /// The message-action callback, absent while the thread cannot be forked.
  var forkRequest: ((String) -> Void)? {
    guard canFork else { return nil }
    return { anchor in
      fork.id = UUID().uuidString
      fork.attempt = nil
      fork.navigationFailure = false
      fork.title = RichChatMessageActionStrings.forkDefaultName(thread?.title ?? title)
      fork.anchor = anchor
    }
  }

  private var canFork: Bool {
    canOperate && session.state.threadForksSupported
      && ["idle", "inactive", "error"].contains(thread?.status ?? "")
  }

  var canSubmitFork: Bool {
    !fork.pending && canOperate && (fork.attempt != nil || canFork)
      && !fork.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  func createFork() {
    guard let anchor = fork.anchor, canSubmitFork else { return }
    if fork.attempt == nil {
      fork.attempt = RichChatThreadCommand(
        payload: [
          "kind": .string("fork"), "sourceThreadId": .string(threadID),
          "throughItemId": .string(anchor),
          "title": .string(fork.title.trimmingCharacters(in: .whitespacesAndNewlines)),
        ], commandID: fork.id, destinationThreadID: fork.id)
    }
    guard let command = fork.attempt else { return }
    let owner = activationID
    let navigation = fork.navigationGeneration
    let targetID = fork.id
    fork.pending = true
    fork.navigationFailure = false
    Task {
      let success = await suite.conversation.runCommand(command)
      guard activationID == owner, fork.pageVisible, navigation == fork.navigationGeneration
      else { return }
      if success {
        let destination = await session.ensureThreadLoadedForOpen(id: targetID)
        guard activationID == owner, fork.pageVisible, navigation == fork.navigationGeneration
        else {
          session.releasePendingNavigationPin(id: targetID)
          return
        }
        if let destination {
          fork.anchor = nil
          showLinkedThread(destination)
        } else {
          fork.navigationFailure = true
        }
      }
      fork.pending = false
    }
  }

  func navigateToForkThread(_ id: String) {
    if returnToForkSource?(id) == true { return }
    let owner = activationID
    fork.navigationGeneration &+= 1
    let navigation = fork.navigationGeneration
    Task {
      let destination = await session.ensureThreadLoadedForOpen(id: id)
      guard activationID == owner, fork.pageVisible, navigation == fork.navigationGeneration else {
        session.releasePendingNavigationPin(id: id)
        return
      }
      if let destination {
        showLinkedThread(destination)
      } else {
        fork.navigationFailure = true
      }
    }
  }

  private func showLinkedThread(_ destination: RemoteThread) {
    if let openLinkedThread {
      if !openLinkedThread(destination) {
        session.releasePendingNavigationPin(id: destination.id)
      }
    } else {
      fork.destination = destination
    }
  }
}
