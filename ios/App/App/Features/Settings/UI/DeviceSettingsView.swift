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
      Section {
        NavigationLink {
          GeneralSettingsView()
        } label: {
          settingsLabel(
            SettingsUIStrings.generalTitle,
            description: SettingsUIStrings.generalDescription,
            systemImage: "gearshape"
          )
        }

        NavigationLink {
          AppearanceSettingsView()
        } label: {
          settingsLabel(
            SettingsUIStrings.appearanceTitle,
            description: SettingsUIStrings.appearanceDescription,
            systemImage: "circle.lefthalf.filled"
          )
        }

        NavigationLink {
          NotificationSettingsView()
        } label: {
          settingsLabel(
            SettingsUIStrings.notificationsTitle,
            description: SettingsUIStrings.notificationsDescription,
            systemImage: "bell"
          )
        }

        NavigationLink {
          TerminalSettingsView()
        } label: {
          settingsLabel(
            SettingsUIStrings.terminalTitle,
            description: SettingsUIStrings.terminalDescription,
            systemImage: "terminal"
          )
        }

        NavigationLink {
          GitSettingsView(session: session)
        } label: {
          settingsLabel(
            SettingsUIStrings.gitTitle,
            description: SettingsUIStrings.gitDescription,
            systemImage: "arrow.triangle.branch"
          )
        }
      } footer: {
        Text(SettingsUIStrings.deviceSettingsSummary)
      }

      Section {
        NavigationLink {
          SettingsHostView(
            session: session,
            selection: selection,
            gateway: gateway,
            usesStackNavigation: true
          )
        } label: {
          settingsLabel(
            SettingsUIStrings.desktopSettingsTitle,
            description: SettingsUIStrings.desktopSettingsDescription,
            systemImage: "desktopcomputer"
          )
        }
        .disabled(selection == nil)
      } footer: {
        Text(SettingsUIStrings.desktopSettingsSummary)
      }

      Section {
        externalLink(
          SettingsUIStrings.privacyPolicy,
          systemImage: "hand.raised",
          urlString: "https://poracode.com/privacy"
        )
        externalLink(
          SettingsUIStrings.support,
          systemImage: "questionmark.circle",
          urlString: "https://poracode.com/support"
        )
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(SettingsUIStrings.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  private func settingsLabel(
    _ title: String,
    description: String,
    systemImage: String
  ) -> some View {
    Label {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .foregroundStyle(.primary)
        Text(description)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
    }
    .padding(.vertical, 2)
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

private struct GeneralSettingsView: View {
  @Environment(\.openURL) private var openURL
  @AppStorage(AIContentLanguagePreference.storageKey) private var contentLanguageID =
    AIContentLanguagePreference.matchApp.rawValue

  var body: some View {
    List {
      Section {
        LabeledContent(SettingsUIStrings.language, value: currentLanguage)
      } footer: {
        Text(SettingsUIStrings.generalDescription)
      }

      Section {
        Picker(SettingsUIStrings.commitPRLanguage, selection: contentLanguageSelection) {
          ForEach(AIContentLanguagePreference.allCases) { language in
            Text(language.displayName).tag(language.rawValue)
          }
        }

        NavigationLink {
          HomeShortcutSettingsView()
        } label: {
          Label(SettingsUIStrings.homeShortcuts, systemImage: "square.grid.2x2")
        }
      }

      Section {
        Button {
          guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
          openURL(url)
        } label: {
          Label(SettingsUIStrings.openSettings, systemImage: "gear")
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(SettingsUIStrings.generalTitle)
    .navigationBarTitleDisplayMode(.inline)
  }

  private var currentLanguage: String {
    guard let identifier = Locale.preferredLanguages.first else {
      return Locale.autoupdatingCurrent.identifier
    }
    return Locale.autoupdatingCurrent.localizedString(forIdentifier: identifier) ?? identifier
  }

  private var contentLanguageSelection: Binding<String> {
    Binding(
      get: { AIContentLanguagePreference.resolved(contentLanguageID).rawValue },
      set: { contentLanguageID = AIContentLanguagePreference.resolved($0).rawValue }
    )
  }
}

private struct NotificationSettingsView: View {
  @Bindable private var delivery = NotificationDeliveryController.shared

  var body: some View {
    List {
      Section {
        Toggle(
          String(localized: "notifications.enable"),
          isOn: Binding(
            get: { delivery.isEnabled },
            set: { enabled in
              Task { await delivery.setEnabled(enabled) }
            }
          )
        )
        if delivery.isEnabled {
          NotificationPermissionControl()
        }
      } footer: {
        Text(SettingsUIStrings.notificationsDescription)
      }

      Section {
        Toggle(
          SettingsUIStrings.notificationSound,
          isOn: alertBinding(\.soundEnabled, update: delivery.setSoundEnabled)
        )
        Picker(
          SettingsUIStrings.notificationPresentation,
          selection: Binding(
            get: { delivery.alertPreference.foregroundMode },
            set: { mode in Task { await delivery.setForegroundMode(mode) } }
          )
        ) {
          Text(SettingsUIStrings.notificationBackgroundOnly)
            .tag(NotificationForegroundMode.backgroundOnly)
          Text(SettingsUIStrings.notificationAlways).tag(NotificationForegroundMode.always)
        }
      }
      .disabled(!delivery.isEnabled)

      Section(SettingsUIStrings.notifyAbout) {
        Toggle(
          SettingsUIStrings.notificationDone,
          isOn: alertBinding(\.doneEnabled, update: delivery.setDoneEnabled)
        )
        Toggle(
          SettingsUIStrings.notificationNeedsAttention,
          isOn: alertBinding(\.needsAttentionEnabled, update: delivery.setNeedsAttentionEnabled)
        )
        Toggle(
          SettingsUIStrings.notificationError,
          isOn: alertBinding(\.errorEnabled, update: delivery.setErrorEnabled)
        )
      }
      .disabled(!delivery.isEnabled)
    }
    .listStyle(.insetGrouped)
    .navigationTitle(SettingsUIStrings.notificationsTitle)
    .navigationBarTitleDisplayMode(.inline)
    .task {
      await NotificationPermissionController.shared.refreshAndRegisterIfUsable()
    }
  }

  private func alertBinding(
    _ keyPath: KeyPath<NotificationAlertPreference, Bool>,
    update: @escaping (Bool) async -> Void
  ) -> Binding<Bool> {
    Binding(
      get: { delivery.alertPreference[keyPath: keyPath] },
      set: { enabled in Task { await update(enabled) } }
    )
  }
}

private struct TerminalSettingsView: View {
  @AppStorage(PoracodeTerminalTextSize.storageKey) private var agentTerminalTextSize =
    PoracodeTerminalTextSize.defaultValue
  @AppStorage(PoracodeTerminalTextSize.projectStorageKey) private var projectTerminalTextSize =
    PoracodeTerminalTextSizeRole.project.initialValue()

  var body: some View {
    List {
      Section {
        textSizeControl(
          value: $agentTerminalTextSize,
          accessibilityLabel: SettingsUIStrings.agentTerminalTextSize
        )
      } header: {
        Text(SettingsUIStrings.agentTerminalTextSize)
      }

      Section {
        textSizeControl(
          value: $projectTerminalTextSize,
          accessibilityLabel: SettingsUIStrings.projectTerminalTextSize
        )
      } header: {
        Text(SettingsUIStrings.projectTerminalTextSize)
      } footer: {
        Text(SettingsUIStrings.terminalSystemBehavior)
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(SettingsUIStrings.terminalTitle)
    .navigationBarTitleDisplayMode(.inline)
  }

  private func textSizeControl(
    value: Binding<Int>,
    accessibilityLabel: String
  ) -> some View {
    HStack(spacing: 12) {
      Image(systemName: "textformat.size.smaller")
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Slider(value: textSizeBinding(value), in: textSizeRange, step: 1)
        .accessibilityLabel(accessibilityLabel)
      Image(systemName: "textformat.size.larger")
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Text(verbatim: String(PoracodeTerminalTextSize.resolve(value.wrappedValue)))
        .monospacedDigit()
        .foregroundStyle(.secondary)
        .frame(minWidth: 24, alignment: .trailing)
    }
  }

  private func textSizeBinding(_ value: Binding<Int>) -> Binding<Double> {
    Binding(
      get: { Double(PoracodeTerminalTextSize.resolve(value.wrappedValue)) },
      set: { value.wrappedValue = PoracodeTerminalTextSize.resolve(Int($0.rounded())) }
    )
  }

  private var textSizeRange: ClosedRange<Double> {
    let lower = Double(PoracodeTerminalTextSize.range.lowerBound)
    let upper = Double(PoracodeTerminalTextSize.range.upperBound)
    return lower...upper
  }
}

private struct GitSettingsView: View {
  @Bindable var session: AppSession
  @State private var composition: SettingsComposition

  init(session: AppSession) {
    self.session = session
    _composition = State(
      initialValue: SettingsComposition(gateway: session.makeSettingsSessionGateway())
    )
  }

  var body: some View {
    Group {
      if let failure = composition.gate(.sessionRead) {
        SettingsUnavailableView(failure: failure)
      } else {
        SettingsGitView(composition: composition, refresh: refresh)
      }
    }
    .navigationTitle(SettingsUIStrings.gitTitle)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: refreshIdentity) {
      composition.activate(activeSelection)
      await composition.refresh(route: .workspace, query: SettingsProfileQuery())
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        HostSelectionMenu(session: session)
      }
    }
    .overlay(alignment: .bottom) {
      SettingsMutationBanner(
        notice: composition.mutationNotice,
        failure: composition.mutationFailure,
        dismiss: composition.clearMutationFeedback
      )
      .padding()
    }
  }

  private var activeSelection: SettingsHostSelection? {
    session.currentSettingsHostSelection
  }

  private var refreshIdentity: SettingsRefreshIdentity {
    SettingsRefreshIdentity(
      selection: activeSelection,
      route: .workspace,
      query: SettingsProfileQuery()
    )
  }

  private func refresh() {
    Task { await composition.refresh(route: .workspace, query: SettingsProfileQuery()) }
  }
}
