import SwiftUI

private struct ComposerPreferencesKey: EnvironmentKey {
  static let defaultValue: ComposerPreferencesStore? = nil
}
extension EnvironmentValues {
  var composerPreferences: ComposerPreferencesStore? {
    get { self[ComposerPreferencesKey.self] }
    set { self[ComposerPreferencesKey.self] = newValue }
  }
}
