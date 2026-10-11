import Foundation

/// Device-local preference for model-generated Git text.
///
/// The version is part of the key because this is a persisted compatibility
/// boundary. A future change to the value vocabulary gets a new key and an
/// explicit migration instead of reinterpreting installed values.
enum AIContentLanguagePreference: String, CaseIterable, Identifiable, Sendable {
  static let storageKey = "poracode.ai-content-language.v1"

  case matchApp = "match-app"
  case english = "en"
  case spanish = "es"
  case russian = "ru"
  case ukrainian = "uk"
  case simplifiedChinese = "zh-CN"
  case japanese = "ja"
  case brazilianPortuguese = "pt-BR"
  case german = "de"
  case french = "fr"
  case korean = "ko"
  case polish = "pl"
  case vietnamese = "vi"
  case turkish = "tr"

  var id: String { rawValue }

  static func resolved(_ rawValue: String) -> Self {
    Self(rawValue: rawValue) ?? .matchApp
  }

  static func stored() -> Self {
    resolved(UserDefaults.standard.string(forKey: storageKey) ?? matchApp.rawValue)
  }

  var displayName: String {
    guard self != .matchApp else { return SettingsUIStrings.appearanceSystem }
    return Locale.autoupdatingCurrent.localizedString(forIdentifier: localeIdentifier)
      ?? englishName
  }

  /// English names are intentional: they are inserted into an otherwise
  /// English model instruction by the host.
  func modelLanguageName(preferredLanguages: [String] = Locale.preferredLanguages) -> String? {
    let concrete =
      self == .matchApp
      ? Self.matching(preferredLanguages: preferredLanguages)
      : self
    return concrete == .english ? nil : concrete.englishName
  }

  private static func matching(preferredLanguages: [String]) -> Self {
    for language in preferredLanguages {
      let normalized = language.trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "_", with: "-")
        .lowercased()
      if let exact = allCases.first(where: {
        $0 != .matchApp && $0.rawValue.lowercased() == normalized
      }) {
        return exact
      }
      guard let base = normalized.split(separator: "-").first.map(String.init) else { continue }
      let matches = allCases.filter {
        $0 != .matchApp
          && $0.rawValue.lowercased().split(separator: "-").first.map(String.init) == base
      }
      if matches.count == 1, let match = matches.first { return match }
    }
    return .english
  }

  private var localeIdentifier: String {
    switch self {
    case .simplifiedChinese: "zh-Hans"
    case .brazilianPortuguese: "pt-BR"
    default: rawValue
    }
  }

  private var englishName: String {
    switch self {
    case .matchApp: "English"
    case .english: "English"
    case .spanish: "Spanish"
    case .russian: "Russian"
    case .ukrainian: "Ukrainian"
    case .simplifiedChinese: "Simplified Chinese"
    case .japanese: "Japanese"
    case .brazilianPortuguese: "Brazilian Portuguese"
    case .german: "German"
    case .french: "French"
    case .korean: "Korean"
    case .polish: "Polish"
    case .vietnamese: "Vietnamese"
    case .turkish: "Turkish"
    }
  }
}
