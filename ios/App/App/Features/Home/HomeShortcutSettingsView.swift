import SwiftUI

struct HomeShortcutSettingsView: View {
  @AppStorage(HomeShortcutPreferences.storageKey) private var storageValue =
    HomeShortcutPreferences.defaultStorageValue

  var body: some View {
    List {
      Section {
        ForEach(preferences.order) { shortcut in
          Toggle(isOn: visibilityBinding(for: shortcut)) {
            Label(shortcut.title, systemImage: shortcut.systemImage)
          }
          .poracodeSwitchStyle()
          .accessibilityIdentifier("native-e2e.shortcuts.toggle.\(shortcut.rawValue)")
        }
        .onMove(perform: move)
      } footer: {
        Text(SettingsUIStrings.homeShortcutsDescription)
      }
    }
    .accessibilityIdentifier("native-e2e.shortcuts.list")
    .navigationTitle(SettingsUIStrings.homeShortcuts)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar { EditButton() }
  }

  private var preferences: HomeShortcutPreferences {
    HomeShortcutPreferences(storageValue: storageValue)
  }

  private func visibilityBinding(for shortcut: HomeShortcutID) -> Binding<Bool> {
    Binding(
      get: { !preferences.hidden.contains(shortcut) },
      set: { visible in
        var updated = preferences
        updated.setVisible(visible, for: shortcut)
        storageValue = updated.encoded
      }
    )
  }

  private func move(fromOffsets: IndexSet, toOffset: Int) {
    var updated = preferences
    updated.move(fromOffsets: fromOffsets, toOffset: toOffset)
    storageValue = updated.encoded
  }
}
