import Foundation

/// Canonical low→high reasoning-effort ordering, mirroring the host's
/// `src/shared/effortOrder.ts`: providers advertise ladders in whatever order
/// their CLI emits, so menus sort on this ladder. Provider spellings
/// (`extra-high`) canonicalize onto the ladder id — the same canonical id the
/// Desktop renderer and Android mirror write into `ThreadConfig.effort` — while
/// the retained raw JSON keeps every native wire id exact.
enum RichChatEffortOrder {
  static let canonical = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
  static let aliases = [
    "extra-high": "xhigh",
    "extra_high": "xhigh",
    "very-high": "xhigh",
  ]

  /// Map provider spellings onto the canonical ladder id.
  static func canonicalID(_ effort: String) -> String {
    let key = effort.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return aliases[key] ?? key
  }

  /// Weakest → strongest; values outside the canonical ladder keep their
  /// advertised relative order and land after the known tiers.
  static func sorted(_ ids: [String]) -> [String] {
    ids.enumerated()
      .sorted { left, right in
        let leftRank = rank(left.element)
        let rightRank = rank(right.element)
        return leftRank == rightRank ? left.offset < right.offset : leftRank < rightRank
      }
      .map(\.element)
  }

  private static func rank(_ id: String) -> Int {
    guard let index = canonical.firstIndex(of: canonicalID(id)) else { return canonical.count }
    return index
  }
}

/// One advertised select value exactly as the host descriptor carries it.
struct RichChatNegotiatedSelectValue: Equatable {
  let value: String
  let name: String?
  let group: String?
}

/// A declared group heading; the label is provider content, never an app string.
struct RichChatNegotiatedSelectGroup: Equatable {
  let id: String
  let name: String?
}

/// One recognized negotiated `select` control. Ids, labels, and group labels
/// stay exact — they are provider content and flow into the write path as-is.
struct RichChatNegotiatedSelect: Equatable {
  let id: String
  let currentValue: String?
  let values: [RichChatNegotiatedSelectValue]
  let groups: [RichChatNegotiatedSelectGroup]

  var isEmpty: Bool { values.isEmpty }
}

/// Negotiated-first projection of the host's per-thread `sessionConfigOptions`
/// inventory (shared contract `src/shared/contracts/sessionConfigOptions.ts`,
/// mirrored as raw JSON until the generated bindings land; same semantics as
/// `src/shared/sessionConfigCapabilities.ts`).
///
/// The host tags the controls it recognizes with an explicit `role`. A
/// recognized `model`/`effort`/`context` select is an observed control and is
/// retained exactly as advertised, **including an empty value list** — an
/// observed-empty ladder is authoritative (`[]`), never a reason to fall back
/// to the static projection. The `mode` role deliberately does not project:
/// native mode ids (`smart`, `bypass`, `ask`, …) are approval choices, not the
/// app's `ThreadConfig.mode` enum (`agent`/`plan`), so dispatching them as mode
/// options would write invalid controls; the static app mode/approval controls
/// stay until the host binds mode semantics. `fast`/`thinking` only gate the
/// existing first-class toggles through the *presence* of a nonempty select —
/// the toggle state itself stays the `ThreadConfig` boolean, never inferred
/// from native ids, and boolean/`unsupported` role shapes are ignored. Absence
/// (older host), `null` (retired), and non-array payloads all project to
/// `nil`; an active-but-empty inventory (`[]`) projects to an instance with no
/// controls.
struct RichChatNegotiatedControls: Equatable {
  let model: RichChatNegotiatedSelect?
  let effort: RichChatNegotiatedSelect?
  let context: RichChatNegotiatedSelect?
  /// A nonempty `fast`/`thinking`-role select exists on the negotiated
  /// session — the gate for the existing first-class toggles on the native
  /// current model. Boolean descriptors never set these.
  let hasFastSelect: Bool
  let hasThinkingSelect: Bool

  /// Fails only when there is no usable inventory at all: absent, `null`, or
  /// a payload that is not the declared array shape.
  init?(_ wire: JSONValue?) {
    guard case .array(let entries) = wire else { return nil }
    var model: RichChatNegotiatedSelect?
    var effort: RichChatNegotiatedSelect?
    var context: RichChatNegotiatedSelect?
    var hasFastSelect = false
    var hasThinkingSelect = false
    for entry in entries {
      guard case .object(let object) = entry else { continue }
      guard object["type"]?.stringValue == "select" else { continue }
      guard let id = object["id"]?.stringValue?.trimmedNonEmpty else { continue }
      guard let role = Self.role(object["role"]?.stringValue) else { continue }
      guard let select = Self.select(id: id, object: object) else { continue }
      switch role {
      case .model: model = model ?? select
      case .effort: effort = effort ?? select
      case .context: context = context ?? select
      case .mode: break
        // Inventory only: native mode ids are approval choices, not the
        // app's ThreadConfig.mode enum. No faithful control to dispatch.
      case .fast: hasFastSelect = hasFastSelect || !select.isEmpty
      case .thinking: hasThinkingSelect = hasThinkingSelect || !select.isEmpty
      }
    }
    self.model = model
    self.effort = effort
    self.context = context
    self.hasFastSelect = hasFastSelect
    self.hasThinkingSelect = hasThinkingSelect
  }

  /// The model the live session currently negotiated — the anchor every
  /// non-model live ladder is scoped to. Optimistic composer picks for other
  /// models stay on the static capability projection until the host's model
  /// descriptor reports the new model as negotiated.
  var nativeCurrentModel: String? { model?.currentValue?.trimmedNonEmpty }

  func isCurrentModel(_ modelID: String) -> Bool {
    guard let nativeCurrentModel else { return false }
    return modelID == nativeCurrentModel
  }

  enum Role: String {
    case model
    case effort
    case mode
    case thinking
    case fast
    case context
  }

  private static func role(_ raw: String?) -> Role? {
    guard let raw = raw?.trimmedNonEmpty else { return nil }
    return Role(rawValue: raw)
  }

  /// The descriptor's declared shape: flat `values` (`{value, name?, group?}`)
  /// and `groups` (`{id, name?}`). Structural only — entries that are not
  /// objects, or values without a string `value`, are skipped, never invented.
  private static func select(
    id: String,
    object: [String: JSONValue]
  ) -> RichChatNegotiatedSelect? {
    var values: [RichChatNegotiatedSelectValue] = []
    for entry in object["values"]?.arrayValue ?? [] {
      guard case .object(let record) = entry else { continue }
      guard let value = record["value"]?.stringValue else { continue }
      values.append(
        RichChatNegotiatedSelectValue(
          value: value,
          name: record["name"]?.stringValue?.trimmedNonEmpty,
          group: record["group"]?.stringValue?.trimmedNonEmpty
        )
      )
    }
    var groups: [RichChatNegotiatedSelectGroup] = []
    var seenGroups = Set<String>()
    for entry in object["groups"]?.arrayValue ?? [] {
      guard case .object(let record) = entry else { continue }
      guard let group = record["id"]?.stringValue?.trimmedNonEmpty else { continue }
      if seenGroups.insert(group).inserted {
        groups.append(
          RichChatNegotiatedSelectGroup(id: group, name: record["name"]?.stringValue?.trimmedNonEmpty)
        )
      }
    }
    return RichChatNegotiatedSelect(
      id: id,
      currentValue: object["currentValue"]?.stringValue,
      values: values,
      groups: groups
    )
  }
}

private extension String {
  var trimmedNonEmpty: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}
