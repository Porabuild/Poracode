import SwiftUI
import UIKit

/// Production composition boundary for port forwarding, presented from the
/// session menu.
///
/// The controller is retained for the lifetime of this presentation and is
/// rebound whenever the selected host or its connection generation changes.
/// Leaving the foreground or dismissing the sheet closes the transport path
/// synchronously, so no forward mutation can be enqueued for a host the user is
/// no longer on. Browser handoff goes through the system opener with the safe
/// entry URL built by the transport; the URL is never rendered or logged.
struct PortForwardingSessionView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase

  @Bindable var session: AppSession
  @State private var composition: PortForwardingComposition
  private let embeddedInNavigationStack: Bool

  init(
    session: AppSession,
    lease: PortForwardingHostLease,
    embeddedInNavigationStack: Bool = false
  ) {
    self.session = session
    self.embeddedInNavigationStack = embeddedInNavigationStack
    _composition = State(
      initialValue: session.makePortForwardingComposition(
        lease: lease,
        browser: PortForwardingBrowserOpener { url in
          await UIApplication.shared.open(url)
        }
      )
    )
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
    .task(id: session.currentPortForwardingAccess?.lease) {
      guard scenePhase != .background else { return }
      composition.scheduleActivation()
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        composition.scheduleActivation()
      } else {
        composition.suspend()
      }
    }
    .onDisappear { composition.suspend() }
  }

  private var content: some View {
    PortForwardingView(
      controller: composition.controller,
      access: session.currentPortForwardingAccess,
      copyAddress: { forwardID in
        await composition.entryAddress(forForwardID: forwardID)
      }
    )
    .toolbar {
      if !embeddedInNavigationStack {
        ToolbarItem(placement: .cancellationAction) {
          Button(PortForwardingStrings.close) { dismiss() }
        }
      }
      ToolbarItem(placement: .primaryAction) {
        HostSelectionMenu(session: session)
      }
    }
  }
}
