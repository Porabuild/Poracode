import Foundation

#if DEBUG
  /// Debug-only launch hook for the NativeE2E XCUITest journeys. Each family
  /// test must pair from a pristine app, but XCUITest can neither uninstall
  /// the app nor reset its state between cases, so a pairing made by one test
  /// would send every later launch straight to Home. When the runner launches
  /// with `-native-e2e-fresh-state`, wipe every persisted host surface — the
  /// host registry document, the multi-host vault service, and the legacy
  /// single-host credentials — so the app lands on onboarding. Release builds
  /// contain none of this.
  enum NativeE2EStateReset {
    static let launchArgument = "-native-e2e-fresh-state"

    static func applyIfRequested() {
      guard ProcessInfo.processInfo.arguments.contains(launchArgument) else { return }
      if ProcessInfo.processInfo.arguments.contains("-native-e2e-custom-themes-fresh-state") {
        UserDefaults.standard.removeObject(forKey: CustomThemeStore.storageKey)
        if UserDefaults.standard.string(forKey: PoracodeThemePreset.storageKey)?.hasPrefix("custom:") == true {
          UserDefaults.standard.removeObject(forKey: PoracodeThemePreset.storageKey)
        }
      }
      if ProcessInfo.processInfo.arguments.contains("-native-e2e-news-fresh-state") {
        for key in [HomeNewsMemoryStore.storageKey, HomeNewsPreferences.enabledKey, HomeNewsPreferences.activityKey] {
          UserDefaults.standard.removeObject(forKey: key)
        }
        try? FileManager.default.removeItem(at: HomeNewsFeedCache.directory)
      }
      if ProcessInfo.processInfo.arguments.contains("-native-e2e-shortcuts-fresh-preferences") {
        UserDefaults.standard.removeObject(forKey: HomeShortcutPreferences.storageKey)
      }
      if ProcessInfo.processInfo.arguments.contains("-native-e2e-keybindings-fresh-preferences") {
        UserDefaults.standard.removeObject(forKey: NativeKeybindingStore.storageKey)
      }
      if ProcessInfo.processInfo.arguments.contains("-native-e2e-terminal-font-fresh-preferences") {
        UserDefaults.standard.removeObject(forKey: TerminalFontPreference.storageKey)
      }
      if ProcessInfo.processInfo.arguments.contains("-native-e2e-changelog-fresh-cache") {
        try? FileManager.default.removeItem(at: ChangelogDiskCache.defaultDirectory)
      }
      UserDefaults.standard.removeObject(forKey: ComposerPreferencesStore.key)
      try? HostRegistryStore(directory: HostRegistryStore.productionDirectory()).remove()
      try? SystemKeychainIO(service: HostVault.service).deleteAll()
      try? SystemKeychainIO(service: SystemKeychainIO.service).deleteAll()
    }
  }
#endif
