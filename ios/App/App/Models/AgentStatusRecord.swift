import Foundation

/// One installed-agent detection record.
///
/// Port of `agentStatusSchema` (`src/shared/contracts/agent.ts`) restricted to the
/// fields the client reasons about; the whole payload is retained in `raw` so
/// forward-compatible provider metadata survives. `capabilities` is required and
/// may legitimately be an empty object (every inner field has a default).
struct AgentStatusRecord: Sendable, Equatable {
  enum EnvironmentKind: String, Sendable, Equatable, CaseIterable {
    case windows
    case wsl
    case posix
  }

  enum AuthState: String, Sendable, Equatable, CaseIterable {
    case authenticated
    case missing
    case unknown
  }

  let raw: [String: JSONValue]
  let kind: String
  let label: String
  let installed: Bool
  let authState: AuthState
  let envKind: EnvironmentKind?
  let envDistro: String?

  var version: String? { raw["version"]?.stringValue }
  var capabilities: [String: JSONValue] { raw["capabilities"]?.objectValue ?? [:] }

  /// The exact merge identity used by the desktop agent-status slice:
  /// `kind`, `envKind`, `envDistro` joined with `|` (absent parts collapse to "").
  var identity: String {
    [kind, envKind?.rawValue ?? "", envDistro ?? ""].joined(separator: "|")
  }

  init(wire value: JSONValue) throws {
    guard let object = value.objectValue,
      let kind = object["kind"]?.stringValue, !kind.isEmpty,
      let label = object["label"]?.stringValue, !label.isEmpty,
      let installed = object["installed"]?.boolValue,
      let rawAuth = object["authState"]?.stringValue,
      let authState = AuthState(rawValue: rawAuth),
      object["capabilities"]?.objectValue != nil
    else { throw GitStateDecoding.invalid("AgentStatus") }
    if let envKindValue = object["envKind"] {
      guard let text = envKindValue.stringValue, let parsed = EnvironmentKind(rawValue: text) else {
        throw GitStateDecoding.invalid("AgentStatus.envKind")
      }
      self.envKind = parsed
    } else {
      self.envKind = nil
    }
    if let distro = object["envDistro"] {
      guard let text = distro.stringValue else {
        throw GitStateDecoding.invalid("AgentStatus.envDistro")
      }
      self.envDistro = text
    } else {
      self.envDistro = nil
    }
    self.kind = kind
    self.label = label
    self.installed = installed
    self.authState = authState
    self.raw = object
  }

  static func list(wire value: JSONValue?, field: String) throws -> [AgentStatusRecord] {
    guard let items = value?.arrayValue else { throw GitStateDecoding.invalid(field) }
    return try items.map { try AgentStatusRecord(wire: $0) }
  }
}
