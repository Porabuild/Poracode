import SwiftUI

struct SideChatContentView: View {
  @Environment(\.poracodeEmbeddedInInspector) private var embedded
  @Environment(\.verticalSizeClass) private var verticalSizeClass
  @Bindable var session: AppSession
  @Bindable var entry: SideChatEntry
  let hide: @MainActor @Sendable () -> Void
  let newChat: () -> Void
  @State private var confirmsClose = false

  private var ownsHost: Bool { session.selectedConnectionId == entry.key.connectionID }

  var body: some View {
    Group {
      if embedded {
        VStack(spacing: 8) {
          panelHeader
          content
        }
        .environment(\.horizontalSizeClass, .compact)
      } else {
        NavigationStack {
          content
            .navigationTitle(SideChatStrings.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarRole(.editor)
            .toolbar {
              ToolbarItem(placement: .topBarTrailing) { moreMenu }
              if #available(iOS 26.0, *) {
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
              }
              ToolbarItem(placement: .topBarTrailing) { doneButton }
            }
        }
      }
    }
    .frame(minWidth: 0, maxWidth: .infinity, maxHeight: .infinity)
    // Keep this entry's voice presenter outside its navigation content.
    // Its capture and draft owner survive an adaptive panel replacement.
    .modifier(ComposerVoiceHost(session: session, state: entry.voice))
    .ignoresSafeArea(.keyboard, edges: .bottom)
    // Keep the status-bar preference stable while UIKit rotates an editable
    // sheet; an unresolved preference can re-enter SwiftUI's trait graph.
    .statusBarHidden(false)
    .confirmationDialog(SideChatStrings.closeConfirmation, isPresented: $confirmsClose, titleVisibility: .visible) {
      Button(SideChatStrings.close, role: .destructive) {
        session.sideChats.retire(entry, session: session)
        hide()
        Task { await session.sideChats.retryDisposals(session: session, force: true) }
      }
      Button(RichChatStrings.cancel, role: .cancel) {}
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("native-e2e.side-chat.surface")
    .onChange(of: session.richChatThread(id: entry.launchThreadID)) { _, row in
      guard ownsHost, entry.threadID == nil, entry.launchState.prepared != nil,
        let row, row.parentThreadId == entry.source.id else { return }
      session.sideChats.started(entry, threadID: row.id, session: session)
    }
  }

  private var panelHeader: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text(SideChatStrings.title).font(.headline)
        Text(entry.source.title).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
      }
      Spacer(minLength: 0)
      PoracodeGlassGroup(spacing: 4) {
        HStack(spacing: 8) {
          moreMenu.frame(minWidth: 44, minHeight: 44)
          doneButton.frame(minWidth: 44, minHeight: 44)
        }
        .font(.body)
        .poracodeGlassButtonStyle()
        .buttonBorderShape(.circle)
        .controlSize(.regular)
      }
    }
    .padding(.horizontal, 12)
    .padding(.top, 4)
  }

  @ViewBuilder private var content: some View {
    if !ownsHost {
      ContentUnavailableView(SideChatStrings.title, systemImage: "bubble.left.and.bubble.right",
        description: Text(SideChatStrings.switchedHost))
    } else if let threadID = entry.threadID {
      RichChatThreadView(session: session, threadID: threadID,
        title: "\(SideChatStrings.title): \(entry.source.title)", auxiliary: true, retainedSuite: entry.suite)
        .environment(\.poracodeCloseThreadDetail, hide)
    } else {
      VStack(spacing: 12) {
        if !embedded && verticalSizeClass != .compact {
          Label { Text(entry.source.title).lineLimit(2) } icon: { Image(systemName: "arrow.turn.up.left") }
            .font(.caption).foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel("\(SideChatStrings.parent): \(entry.source.title)")
        }
        Spacer(minLength: 0)
        if entry.uncertain {
          VStack(alignment: .leading, spacing: 8) {
            Text(SideChatStrings.uncertain).font(.callout)
            Button(SideChatStrings.retry) { Task { await session.sideChats.retryInitial(entry, session: session) } }
              .disabled(entry.retrying || !ownsHost || !session.canOperate)
              .accessibilityIdentifier("native-e2e.side-chat.retry-original")
          }
        }
        HomeQuickComposeView(session: session, isExpanded: $entry.composing, draft: entry.draft,
          showsContextHeader: false, onNewsAction: nil) {
          session.sideChats.started(entry, threadID: $0, session: session)
        }
          .disabled(entry.uncertain || entry.retrying)
      }
      .padding(12)
    }
  }

  private var doneButton: some View {
    Button(action: hide) { headerIcon(RichChatStrings.done, symbol: "xmark") }
      .accessibilityIdentifier("native-e2e.side-chat.hide")
  }

  private var moreMenu: some View {
    Menu {
      Button(SideChatStrings.newChat, systemImage: "square.and.pencil", action: newChat)
      Button(SideChatStrings.close, systemImage: "xmark.bubble", role: .destructive) { confirmsClose = true }
    } label: { headerIcon(HomeStrings.more, symbol: "ellipsis") }
    .foregroundStyle(.secondary)
    .tint(.secondary)
    .accessibilityLabel(HomeStrings.more)
    .accessibilityIdentifier("native-e2e.side-chat.more")
  }

  private func headerIcon(_ title: String, symbol: String) -> some View {
    Label(title, systemImage: symbol).labelStyle(.iconOnly).frame(width: 20, height: 20)
  }
}
