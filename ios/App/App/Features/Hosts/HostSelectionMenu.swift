import SwiftUI

/// Compact machine picker for remote utility pages. It changes only the
/// selected session owner; each destination observes its normal host lease and
/// reloads through its existing exact-host controller path.
struct HostSelectionMenu: View {
  @Bindable var session: AppSession
  var showsSelectedHost = false

  private var selectedLabel: String {
    session.hosts.first { $0.connectionId == session.selectedConnectionId }?.label
      ?? session.profile?.label ?? HostStrings.switcherTitle
  }

  var body: some View {
    if session.hosts.count > 1 {
      Menu {
        ForEach(session.hosts) { host in
          Button {
            guard host.connectionId != session.selectedConnectionId else { return }
            Task { await session.switchHost(host.connectionId) }
          } label: {
            if host.connectionId == session.selectedConnectionId {
              Label(host.label, systemImage: "checkmark")
            } else {
              Text(host.label)
            }
          }
        }
      } label: {
        if showsSelectedHost {
          Label(selectedLabel, systemImage: "desktopcomputer")
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        } else {
          Image(systemName: "desktopcomputer")
        }
      }
      .accessibilityLabel(HostStrings.switcherAccessibility)
      .accessibilityValue(selectedLabel)
    } else if showsSelectedHost {
      Text(selectedLabel)
    }
  }
}
