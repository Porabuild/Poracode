import Foundation

enum RichChatRemoteModelBridge {
  static func json(_ value: JSONValue) throws -> RichJSON {
    switch value {
    case .null:
      return .null
    case .bool(let value):
      return .bool(value)
    case .number(let value):
      guard value.isFinite else { throw RichDomainDecodeError.invalidRuntimeItem }
      return .number(Decimal(value))
    case .string(let value):
      return .string(value)
    case .array(let values):
      return .array(try values.map(json))
    case .object(let object):
      return .object(try object.mapValues(json))
    }
  }

  static func item(_ item: PersistedRuntimeItem) throws -> RichRuntimeItem {
    guard !item.id.isEmpty, !item.type.isEmpty,
      let state = RichItemState(rawValue: item.state)
    else { throw RichDomainDecodeError.invalidRuntimeItem }
    return RichRuntimeItem(
      id: item.id,
      type: item.type,
      state: state,
      payload: try item.payload.map(json),
      streams: item.streams,
      parentItemID: item.parentItemId
    )
  }

  static func items(_ items: [PersistedRuntimeItem]) throws -> [RichRuntimeItem] {
    try items.map(item)
  }

  static func completedTurns(_ values: [JSONValue]) throws -> [RichCompletedTurn] {
    try RichTimeline.decodeCompletedTurns(.array(try values.map(json)))
  }

  /// Strictly decodes `snapshot.contextUsage`; malformed authoritative context is
  /// dropped rather than installed, leaving the indicator hidden.
  static func contextUsage(_ value: JSONValue?) throws -> RichContextUsage? {
    guard let value else { return nil }
    return RichContextUsage.decode(try json(value))
  }
}
