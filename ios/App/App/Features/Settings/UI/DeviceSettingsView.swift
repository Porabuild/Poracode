import SwiftUI
import UIKit

/// Native settings index matching the compact PWA's device/desktop split.
/// Device-owned controls stay local; host-owned values push into the selected
/// desktop's remote settings hierarchy.
struct DeviceSettingsView: View {
  @Environment(\.openURL) private var openURL

  @Bindable var session: AppSession
  let selection: SettingsHostSelection?
  let gateway: any SettingsSessionGateway

  var body: some View {
    List {
      Section(SettingsUIStrings.personalSection) {
        ForEach(DeviceSettingsDestination.personal, id: \.self) { destination in
          DeviceSettingsDestinationLink(session: session, destination: destination)
        }
      }
      Section {
        ForEach(DeviceSettingsDestination.workspace, id: \.self) { destination in
          DeviceSettingsDestinationLink(session: session, destination: destination)
        }
      } header: {
        Text(SettingsUIStrings.workspaceTitle)
      } footer: {
        Text(SettingsUIStrings.deviceSettingsSummary)
      }
      Section(SettingsUIStrings.agentsTitle) {
        ForEach(DeviceSettingsDestination.agents, id: \.self) { destination in
          DeviceSettingsDestinationLink(session: session, destination: destination)
        }
      }
      Section {
        DeviceSettingsDestinationLink(session: session, destination: .connections)
        NavigationLink {
          SettingsHostView(session: session, selection: selection, gateway: gateway, usesStackNavigation: true)
        } label: {
          DeviceSettingsLabel(title: SettingsUIStrings.desktopSettingsTitle,
            description: SettingsUIStrings.desktopSettingsDescription, systemImage: "desktopcomputer")
        }
        .disabled(selection == nil)
      } header: {
        Text(HomeStrings.connections)
      } footer: {
        Text(SettingsUIStrings.desktopSettingsSummary)
      }
      Section {
        DeviceSettingsDestinationLink(session: session, destination: .changelog)
        externalLink(SettingsUIStrings.privacyPolicy, systemImage: "hand.raised", urlString: "https://poracode.com/privacy")
        externalLink(SettingsUIStrings.support, systemImage: "questionmark.circle", urlString: "https://poracode.com/support")
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .navigationTitle(SettingsUIStrings.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  private func externalLink(
    _ title: String,
    systemImage: String,
    urlString: String
  ) -> some View {
    Button {
      guard let url = URL(string: urlString) else { return }
      openURL(url)
    } label: {
      HStack(spacing: 12) {
        Image(systemName: systemImage)
          .foregroundStyle(.secondary)
        Text(title)
          .foregroundStyle(.primary)
        Spacer(minLength: 8)
        Image(systemName: "arrow.up.right")
          .font(.caption)
          .foregroundStyle(.tertiary)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}
