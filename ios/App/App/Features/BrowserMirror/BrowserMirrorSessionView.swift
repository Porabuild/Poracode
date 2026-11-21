#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  /// Production entry point for Browser Mirror, presented from the session menu.
  ///
  /// The composition binds the controller to the selected host and the shared session
  /// socket for exactly as long as this presentation is on screen. Host switches, socket
  /// generation changes, and scene-phase changes are all funnelled through it so no frame
  /// or input can outlive the selection it was captured for.
  struct BrowserMirrorSessionView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector

    @Bindable var session: AppSession
    @State private var composition: BrowserMirrorComposition
    private let embeddedInNavigationStack: Bool
    private let showsHostSelection: Bool

    init(
      session: AppSession,
      embeddedInNavigationStack: Bool = false,
      showsHostSelection: Bool = true
    ) {
      self.session = session
      self.embeddedInNavigationStack = embeddedInNavigationStack
      self.showsHostSelection = showsHostSelection
      _composition = State(initialValue: session.makeBrowserMirrorComposition())
    }

    @ViewBuilder
    var body: some View {
      Group {
        if embeddedInNavigationStack {
          content
        } else {
          NavigationStack {
            content
          }
        }
      }
      .task { await composition.activate() }
      .onDisappear { Task { [composition] in await composition.deactivate() } }
      .onChange(of: session.currentBrowserMirrorAccess) { _, _ in
        Task { await composition.synchronizeAccess(session.currentBrowserMirrorAccess) }
      }
      .onChange(of: session.socketState) { _, _ in
        Task {
          if session.socketState == .online {
            await composition.synchronizeSocket()
          } else {
            composition.socketDisconnected()
          }
        }
      }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active {
          Task { await composition.resume() }
        } else {
          composition.suspend()
        }
      }
    }

    @ViewBuilder
    private var content: some View {
      let screen = BrowserMirrorScreen(
        controller: composition.controller,
        onRetry: { Task { await composition.activate() } },
        isMirroring: composition.controller.watchIntent,
        onToggleMirroring: toggleMirroring
      )
      if embeddedInInspector {
        screen
      } else {
        screen
          .toolbar {
            if !embeddedInNavigationStack {
              ToolbarItem(placement: .cancellationAction) {
                Button(BrowserMirrorStrings.dismiss, systemImage: "xmark") { dismiss() }
              }
            }
            ToolbarItemGroup(placement: .primaryAction) {
              if showsHostSelection {
                HostSelectionMenu(session: session)
              }
              Button(
                composition.controller.watchIntent
                  ? BrowserMirrorStrings.stopMirroring
                  : BrowserMirrorStrings.startMirroring,
                systemImage: composition.controller.watchIntent ? "stop.circle" : "play.circle",
                action: toggleMirroring
              )
            }
          }
      }
    }

    private func toggleMirroring() {
      Task {
        if composition.controller.watchIntent {
          await composition.deactivate()
        } else {
          await composition.activate()
        }
      }
    }
  }
#endif
