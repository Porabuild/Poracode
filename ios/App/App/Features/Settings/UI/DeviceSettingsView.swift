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
  @State private var settingsQuery = ""
  @AppStorage(GitHubPullRequestCreationMode.storageKey) private var createPRMode =
    GitHubPullRequestCreationMode.dialog.rawValue

  var body: some View {
    List {
      if NativeSettingsSearch.isActive(settingsQuery) {
        SettingsSearchResults(session: session, selection: selection, gateway: gateway, query: settingsQuery) {
          createPRPicker
        }
      } else {
        sections
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .navigationTitle(SettingsUIStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .searchable(text: $settingsQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: SettingsUIStrings.search)
  }

  @ViewBuilder private var sections: some View {
    Section(SettingsUIStrings.personalSection) {
      ForEach(DeviceSettingsDestination.personal, id: \.self) { destination in
        DeviceSettingsDestinationLink(session: session, destination: destination)
      }
    }
    Section {
      DeviceSettingsDestinationLink(session: session, destination: .terminal)
      createPRPicker
      DeviceSettingsDestinationLink(session: session, destination: .worktrees)
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
      .accessibilityIdentifier("native-e2e.settings.desktop")
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

  private var createPRPicker: some View {
    Picker(SettingsUIStrings.defaultCreatePRAction, selection: $createPRMode) {
      Text(SettingsUIStrings.openDialog).tag(GitHubPullRequestCreationMode.dialog.rawValue)
      Text(SettingsUIStrings.autoGenerate).tag(GitHubPullRequestCreationMode.auto.rawValue)
    }
    .accessibilityIdentifier("native-e2e.settings.git.create-pr-mode")
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
