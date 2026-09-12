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

    @Bindable var session: AppSession
    @State private var composition: BrowserMirrorComposition
    private let embeddedInNavigationStack: Bool

    init(session: AppSession, embeddedInNavigationStack: Bool = false) {
      self.session = session
      self.embeddedInNavigationStack = embeddedInNavigationStack
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
      .onChange(of: session.currentBrowserMirrorAccess) { _, access in
        Task { await composition.synchronizeAccess(access) }
      }
      .onChange(of: session.socketState) { _, state in
        Task {
          if state == .online {
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

    private var content: some View {
      BrowserMirrorScreen(
        controller: composition.controller,
        onRetry: { Task { await composition.activate() } }
      )
      .toolbar {
        if !embeddedInNavigationStack {
          ToolbarItem(placement: .cancellationAction) {
            Button(BrowserMirrorStrings.dismiss) { dismiss() }
          }
        }
        ToolbarItemGroup(placement: .primaryAction) {
          HostSelectionMenu(session: session)
          Button(
            composition.controller.watchIntent
              ? BrowserMirrorStrings.stopMirroring
              : BrowserMirrorStrings.startMirroring
          ) {
            Task {
              if composition.controller.watchIntent {
                await composition.deactivate()
              } else {
                await composition.activate()
              }
            }
          }
        }
      }
    }
  }
#endif
