import Foundation

/// Read-only UI policy generated from the same provider manifests as the PWA.
/// v2 adds legacy surface identity without changing host protocol or user data.
/// v1 remains readable with absent identity fields. Missing/future formats are
/// refused rather than guessing a potentially paid provider preference.
struct ProviderUIRegistry: Decodable, Sendable {
  struct Entry: Decodable, Sendable {
    let order: Int
    let defaultFastEnabled: Bool
    let legacyTerminalRuntimeLabel: String?
    let legacyGuiRuntimeVariant: String?
  }
  let version: Int
  let defaultFastEnabled: Bool
  let providers: [String: Entry]

  static let bundled: Self? = {
    guard let url = Bundle.main.url(forResource: "ProviderUIRegistry", withExtension: "json"),
      let data = try? Data(contentsOf: url) else { return nil }
    return decode(data)
  }()

  static func decode(_ data: Data) -> Self? {
    guard let value = try? JSONDecoder().decode(Self.self, from: data), (1...2).contains(value.version),
      !value.providers.isEmpty, value.providers.values.allSatisfy({ $0.order >= 0 }),
      Set(value.providers.values.map(\.order)).count == value.providers.count else { return nil }
    return value
  }

  func fast(for kind: String) -> Bool { providers[base(kind)]?.defaultFastEnabled ?? defaultFastEnabled }
  func order(for kind: String) -> Int { providers[base(kind)]?.order ?? .max }
  func visibilityKey(for kind: String, mode: ThreadPresentationMode, runtime: String?) -> String {
    guard mode == .gui,
      let variant = runtime?.lowercased() ?? providers[base(kind)]?.legacyGuiRuntimeVariant else { return kind }
    return "\(kind)-\(variant)"
  }

  func terminalRuntimeLabel(for kind: String) -> String? { providers[base(kind)]?.legacyTerminalRuntimeLabel }
  func guiRuntimeVariant(for kind: String) -> String? { providers[base(kind)]?.legacyGuiRuntimeVariant }

  private func base(_ kind: String) -> String {
    guard let colon = kind.firstIndex(of: ":"), colon > kind.startIndex else { return kind }
    return String(kind[..<colon])
  }
}
