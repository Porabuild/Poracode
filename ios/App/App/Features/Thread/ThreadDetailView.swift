import SwiftUI

struct ThreadDetailView: View {
    @Bindable var session: AppSession
    let threadId: String
    let title: String

    @State private var draft = ""
    @FocusState private var composerFocused: Bool

    private var isWorking: Bool {
        let status = session.threadSnapshot?.thread.status
            ?? session.snapshot?.threads.first(where: { $0.id == threadId })?.status
        return status == "working" || status == "launching" || status == "needs_reply"
    }

    private var canMutateThread: Bool {
        session.canOperate
            && session.currentThreadSessionAccess?.isReady == true
            && session.currentThreadSessionAccess?.isOnline == true
            && session.currentThreadSessionAccess?.isForeground == true
    }

    var body: some View {
        VStack(spacing: 0) {
            content
            Divider()
            composer
        }
        .navigationTitle(title)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if isWorking && canMutateThread {
                    Button("Stop", systemImage: "stop.fill") {
                        Task { await session.interruptOpenThread() }
                    }
                    .accessibilityLabel("Stop agent")
                }
            }
        }
        .task(id: threadId) {
            session.openThread(id: threadId)
        }
        .onDisappear {
            // Only clear if still on this thread (avoid race when pushing deeper).
            if session.openThreadId == threadId {
                session.closeThread()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch session.threadLoadState {
        case .idle, .loading:
            LoadingStateView(message: "Loading transcript…")
        case .empty:
            EmptyStateView(
                title: "No messages yet",
                systemImage: "text.bubble",
                description: "Send a message to start the conversation."
            )
        case .failed(let message):
            ErrorStateView(message: message) {
                session.openThread(id: threadId)
            }
        case .loaded:
            TranscriptView(
                items: session.threadItems,
                hasOlder: session.threadOlderCursor != nil,
                isLoadingOlder: session.isLoadingOlder,
                onLoadOlder: {
                    Task { await session.loadOlderItems() }
                }
            )
        }
    }

    @ViewBuilder
    private var composer: some View {
        if session.canOperate {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message", text: $draft, axis: .vertical)
                    .lineLimit(1 ... 6)
                    .padding(10)
                    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .focused($composerFocused)
                    .accessibilityLabel("Message composer")
                    .onSubmit {
                        Task { await send() }
                    }
                    .disabled(!canMutateThread)

                Button {
                    Task { await send() }
                } label: {
                    if session.isSending {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                }
                .disabled(
                    !canMutateThread || session.isSending
                        || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
                .accessibilityLabel("Send message")
            }
            .padding(12)
            .background(.bar)
        } else {
            Text("Read-only session — sending is disabled.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(12)
                .background(.bar)
                .accessibilityLabel("Read-only session")
        }
    }

    private func send() async {
        guard canMutateThread else { return }
        let text = draft
        composerFocused = false
        // Preserve draft on failed send — only clear after success.
        let ok = await session.sendMessage(text)
        if ok {
            draft = ""
        }
    }
}
