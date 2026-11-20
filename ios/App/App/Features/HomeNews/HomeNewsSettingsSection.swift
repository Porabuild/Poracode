import SwiftUI

struct HomeNewsSettingsSection: View {
  @Environment(\.locale) private var locale
  @AppStorage(HomeNewsPreferences.enabledKey) private var enabled = true
  @AppStorage(HomeNewsPreferences.activityKey) private var activity = true

  private func copy(_ key: String) -> String { HomeNewsCatalog.bundled.message(key, locale: locale) }

  var body: some View {
    Section {
      Toggle(copy("News line"), isOn: $enabled).poracodeSwitchStyle()
        .accessibilityIdentifier("native-e2e.news.enabled")
    }
    if enabled {
      Section {
        Toggle(copy("Activity highlights"), isOn: $activity).poracodeSwitchStyle()
          .accessibilityIdentifier("native-e2e.news.activity")
      } footer: {
        Text(copy("Include your streaks, prompt counts, and usage limits in the news line."))
      }
    }
  }
}
