import SwiftUI

/// Contextual shell terminal for one project location.
///
/// Reached from a project (its root) and from a GUI thread (its worktree
/// overlay when it has one), so the shell always starts where the user is
/// actually working. The surface offers only what the real socket seam
/// supports: once the shell is live it is the same terminal view used for
/// thread-backed PTYs, with no controls the desktop cannot honour.
struct ProjectShellTerminalView: View {
  @Bindable var session: AppSession
  let projectLocation: ProjectLocation
  let worktreePath: String?
  let initialCommand: String?
  let title: String?

  @Environment(\.scenePhase) private var scenePhase
  @State private var shell: ProjectShellTerminalSession
  @State private var sentInitialCommand = false

  init(
    session: AppSession,
    projectLocation: ProjectLocation,
    worktreePath: String? = nil,
    initialCommand: String? = nil,
    title: String? = nil
  ) {
    self.session = session
    self.projectLocation = projectLocation
    self.worktreePath = worktreePath
    self.initialCommand = initialCommand
    self.title = title
    _shell = State(
      initialValue: ProjectShellTerminalSession(
        suite: session.makeRichChatControllerSuite()
      )
    )
  }

  var body: some View {
    content
      .navigationTitle(title ?? TerminalStrings.shellTitle)
      .navigationBarTitleDisplayMode(.inline)
      .task(id: activationID) { startIfPossible() }
      .onChange(of: session.phase) { updateAccess() }
      .onChange(of: session.socketState) { updateAccess() }
      .onChange(of: shell.phase) { _, phase in
        guard phase == .live else { return }
        sendInitialCommandIfNeeded()
      }
      .onChange(of: scenePhase) { _, phase in
        guard let access = session.currentRichChatAccess else { return }
        if phase == .background {
          shell.enterBackground()
        } else if phase == .active {
          shell.leaveBackground(access: access)
        }
      }
      .onDisappear { shell.end() }
  }

  @ViewBuilder
  private var content: some View {
    switch shell.phase {
    case .idle:
      ContentUnavailableView {
        Label(TerminalStrings.shellTitle, systemImage: "terminal")
      } description: {
        Text(TerminalStrings.shellIdle)
      } actions: {
        Button(TerminalStrings.shellStart) { startIfPossible() }
          .disabled(session.currentRichChatAccess == nil)
      }
    case .starting:
      LoadingStateView(message: TerminalStrings.shellStarting)
    case .failed(let failure):
      ErrorStateView(
        message: RichChatStrings.failure(failure),
        retryTitle: TerminalStrings.shellRetry
      ) {
        startIfPossible()
      }
    case .live:
      if let shellID = shell.shellID {
        RichTerminalView(
          controller: shell.terminal,
          terminalID: shellID,
          canOperate: canOperate,
          textSizeRole: .project
        )
      }
    }
  }

  private var canOperate: Bool {
    session.currentRichChatAccess?.controllerGate(.terminalOperate) == nil
  }

  /// Any host, generation, or location change restarts this surface from
  /// scratch rather than reusing a shell that belongs to another host.
  private var activationID: String {
    let lease = session.currentRichChatAccess?.lease
    return [
      lease?.connectionID.rawValue ?? "none",
      String(lease?.generation ?? 0),
      projectLocation.displayPath,
      worktreePath ?? "",
    ].joined(separator: ":")
  }

  private func startIfPossible() {
    guard scenePhase != .background,
      let access = session.currentRichChatAccess,
      access.controllerGate(.terminalOperate) == nil
    else { return }
    shell.start(
      access: access,
      projectLocation: projectLocation,
      worktreePath: worktreePath,
      initialSize: nil
    )
  }

  private func updateAccess() {
    guard let access = session.currentRichChatAccess else {
      shell.end()
      return
    }
    shell.updateAccess(access)
  }

  private func sendInitialCommandIfNeeded() {
    guard !sentInitialCommand,
      canOperate,
      let initialCommand,
      !initialCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return }
    sentInitialCommand = true
    Task { await shell.terminal.write(initialCommand + "\n") }
  }
}
