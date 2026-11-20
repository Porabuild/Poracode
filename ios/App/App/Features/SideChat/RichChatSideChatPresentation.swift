import SwiftUI

extension RichChatThreadView {
  var retainedSideChat: SideChatEntry? {
    guard conversationConnectionID == session.selectedConnectionId else { return nil }
    return session.sideChats.entry(parentID: threadID, connectionID: conversationConnectionID)
  }

  var offersSideChat: Bool {
    guard conversationConnectionID == session.selectedConnectionId,
      !isAuxiliaryConversation, let thread, thread.presentationMode == "gui",
      let connectionID = session.selectedConnectionId else { return false }
    return !session.sideChats.isHidden(threadID: threadID, connectionID: connectionID)
  }

  func openSideChat(fresh: Bool = false) {
    guard let thread, offersSideChat, let owner = conversationConnectionID else { return }
    do {
      if fresh || retainedSideChat == nil {
        _ = try session.sideChats.open(session: session, source: thread, owner: owner, fresh: fresh)
      }
      presentSideChatSurface()
      Task { await session.sideChats.retryDisposals(session: session, force: fresh) }
    } catch {
      sideChatFailure = SideChatStrings.contextFailure(error as? SideChatContextFailure ?? .unavailable)
    }
  }

  func openSideQuestion(_ question: String) async -> Bool {
    guard let thread, offersSideChat, let owner = conversationConnectionID else { return false }
    do {
      // Validate conversion before replacing any retained auxiliary draft.
      _ = try currentComposerDraft.segments.map { try $0.lifecyclePromptSegment() }
      let entry = try session.sideChats.open(session: session, source: thread, owner: owner, question: question, fresh: true)
      entry.draft.attachments = currentComposerDraft.attachments.map {
        HomeComposerAttachment(name: $0.name, mimeType: $0.mimeType, remotePath: $0.remotePath)
      }
      entry.draft.skills = currentComposerDraft.skills
      entry.draft.mentionedMCPs = currentComposerDraft.mcps
      entry.draft.additionalSegments = currentComposerDraft.segments
      presentSideChatSurface()
      Task { await session.sideChats.retryDisposals(session: session, force: true) }
      return true
    } catch {
      sideChatFailure = SideChatStrings.contextFailure(error as? SideChatContextFailure ?? .unavailable)
      return false
    }
  }

  func addMessageToSideChat(_ text: String) {
    guard let thread, offersSideChat, let owner = conversationConnectionID,
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    do {
      let entry = try retainedSideChat ?? session.sideChats.open(session: session, source: thread, owner: owner)
      let segment = RichPromptSegment.selectedText(content: text)
      if let threadID = entry.threadID {
        session.richChatComposerDrafts.enqueue(segment, for: .init(connectionID: entry.key.connectionID, threadID: threadID))
      } else if entry.uncertain || entry.draft.lifecycle.isBusy {
        session.richChatComposerDrafts.enqueue(segment, for: .init(connectionID: entry.key.connectionID, threadID: entry.launchThreadID))
      } else { entry.draft.additionalSegments.append(segment) }
      presentSideChatSurface()
    } catch {
      sideChatFailure = SideChatStrings.contextFailure(error as? SideChatContextFailure ?? .unavailable)
    }
  }

  private func presentSideChatSurface() {
    retainedSideChat?.isPresented = true
    composerExpanded = false
    if inspectorCapability.supportsInspector {
      showsSideChatSheet = false
      rightPanelTab = .sideChat
      isInspectorVisible = true
    } else { showsSideChatSheet = true }
  }

  func hideSideChat() {
    retainedSideChat?.isPresented = false
    showsSideChatSheet = false
    if rightPanelTab == .sideChat { isInspectorVisible = false }
  }

  func restoreSideChatPresentation() {
    if retainedSideChat?.isPresented == true { presentSideChatSurface() }
  }

  func adaptSideChat(toWideInspector supported: Bool) {
    if supported, showsSideChatSheet {
      showsSideChatSheet = false
      rightPanelTab = .sideChat
      isInspectorVisible = true
    } else if !supported, rightPanelTab == .sideChat, isInspectorVisible == true, retainedSideChat != nil {
      showsSideChatSheet = true
    }
  }
}

struct RichChatSideChatPresentation: ViewModifier {
  let page: RichChatThreadView

  func body(content: Content) -> some View {
    content
      .sheet(isPresented: page.$showsSideChatSheet) {
        if let entry = page.retainedSideChat {
          SideChatContentView(session: page.session, entry: entry,
            hide: { page.hideSideChat() }, newChat: { page.openSideChat(fresh: true) })
            .id(entry.id)
            .poracodeFormSheetSizing()
            .presentationDetents([.large])
        }
      }
      .alert(SideChatStrings.title, isPresented: Binding(
        get: { page.sideChatFailure != nil }, set: { if !$0 { page.sideChatFailure = nil } }
      )) {
        Button(RichChatStrings.done) { page.sideChatFailure = nil }
      } message: { Text(page.sideChatFailure ?? "") }
      .onChange(of: page.inspectorCapability.supportsInspector) { _, supported in
        page.adaptSideChat(toWideInspector: supported)
      }
      .onChange(of: page.retainedSideChat?.id) { previous, current in
        if previous != nil, current == nil { page.hideSideChat() }
      }
      .onAppear { page.restoreSideChatPresentation() }
      .onChange(of: page.showsSideChatSheet) { _, shown in
        if !shown, !page.inspectorCapability.supportsInspector {
          if page.retainedSideChat?.voice.request == nil { page.retainedSideChat?.isPresented = false }
        }
      }
      .onChange(of: page.rightPanelTab) { _, tab in
        if page.inspectorCapability.supportsInspector, page.retainedSideChat?.voice.request == nil {
          page.retainedSideChat?.isPresented = tab == .sideChat && page.isInspectorVisible == true
        }
      }
  }
}

struct RichChatNavigationChrome: ViewModifier {
  let title: String
  let auxiliary: Bool
  @ViewBuilder func body(content: Content) -> some View {
    if auxiliary { content }
    else {
      content.navigationTitle(title).navigationBarTitleDisplayMode(.inline)
        .toolbarRole(.editor).poracodeNavigationBarChrome()
    }
  }
}

extension RichChatComposerView {
  func transferSideQuestionIfPresent() -> Bool {
    guard let sideQuestion, let question = SideChatCommand.question(in: draft) else { return false }
    onSubmissionStarted()
    transferringSideQuestion = true
    Task {
      let accepted = await sideQuestion(question)
      if accepted {
        draft = ""; attachments = []; skills = []; mcps = []; queuedSegments = []
      }
      transferringSideQuestion = false
      onSubmissionFinished(accepted)
    }
    return true
  }
}
