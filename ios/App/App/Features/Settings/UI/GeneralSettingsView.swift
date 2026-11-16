import SwiftUI
import UIKit

struct GeneralSettingsView: View {
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
        .accessibilityIdentifier("native-e2e.settings.shortcuts")
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
    .poracodeReadableListMargins(740)
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
