import SwiftUI

/// Unified mobile "More" surface. The destination list mirrors the mobile web
/// sheet one-to-one (Profile, Usage, Connections, Projects, Browser, Ports,
/// Notes, Pull requests, Schedules, Settings) plus the native Refresh action.
/// Pairing lifecycle lives in Connections — there is no single-connection
/// Disconnect action because the app keeps multiple desktops connected.
struct HomeMoreSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  @Binding var isRefreshing: Bool

  var body: some View {
    NavigationStack {
      List {
        Section {
          NavigationLink {
            SettingsMoreRouteView(session: session, route: .profile)
          } label: {
            HomeMoreLabel(SettingsUIStrings.profileTitle, systemImage: "person.crop.circle")
          }
          NavigationLink {
            SettingsMoreRouteView(session: session, route: .usage)
          } label: {
            HomeMoreLabel(SettingsUIStrings.usageTitle, systemImage: "chart.bar.xaxis")
          }
          NavigationLink {
            HostSwitcherView(session: session)
          } label: {
            HomeMoreLabel(HomeStrings.connections, systemImage: "server.rack")
          }
          .accessibilityIdentifier("native-e2e.more.connections")
          NavigationLink {
            ProjectManagementView(session: session, embeddedInNavigationStack: true)
          } label: {
            HomeMoreLabel(ProjectManagementStrings.title, systemImage: "folder")
          }
          .disabled(session.currentProjectControllerSession?.gate(.projectsManage) != nil)
          NavigationLink {
            BrowserMirrorSessionView(session: session, embeddedInNavigationStack: true)
          } label: {
            HomeMoreLabel(BrowserMirrorStrings.title, systemImage: "globe")
          }
          .disabled(session.currentBrowserMirrorAccess == nil)
          if let lease = session.currentPortForwardingAccess?.lease {
            NavigationLink {
              PortForwardingSessionView(
                session: session,
                lease: lease,
                embeddedInNavigationStack: true
              )
            } label: {
              HomeMoreLabel(PortForwardingStrings.title, systemImage: "powerplug")
            }
            .disabled(!session.canOpenPortForwarding)
          }
          NavigationLink {
            ProjectNotesPageView(session: session)
          } label: {
            HomeMoreLabel(ProjectManagementStrings.notes, systemImage: "note.text")
          }
          NavigationLink {
            PullRequestsPageView(session: session)
          } label: {
            HomeMoreLabel(PullRequestsStrings.title, systemImage: "arrow.triangle.pull")
          }
          NavigationLink {
            RemoteIntegrationsSessionView(
              session: session,
              initialRoute: .schedules,
              embeddedInNavigationStack: true
            )
          } label: {
            HomeMoreLabel(
              RemoteIntegrationsStrings.schedules,
              systemImage: "calendar.badge.clock"
            )
          }
          NavigationLink {
            SettingsMoreIndexView(session: session)
          } label: {
            HomeMoreLabel(SettingsUIStrings.title, systemImage: "slider.horizontal.3")
          }
        }

        Section {
          Button {
            guard !isRefreshing else { return }
            isRefreshing = true
            dismiss()
            Task {
              defer { isRefreshing = false }
              await session.refreshSnapshot()
            }
          } label: {
            HomeMoreLabel(HomeStrings.refresh, systemImage: "arrow.clockwise")
          }
          .disabled(isRefreshing)
          .buttonStyle(.plain)
        }
      }
      .navigationTitle(HomeStrings.more)
      .navigationBarTitleDisplayMode(.inline)
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    .presentationCornerRadius(28)
  }
}

private struct HomeMoreLabel: View {
  let title: String
  let systemImage: String

  init(_ title: String, systemImage: String) {
    self.title = title
    self.systemImage = systemImage
  }

  var body: some View {
    Label {
      Text(title)
        .foregroundStyle(.primary)
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
    }
  }
}
