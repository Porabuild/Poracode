import Foundation

enum RichRequestType: String, CaseIterable, Sendable, Equatable, Codable {
  case commandExecutionApproval = "command_execution_approval"
  case fileReadApproval = "file_read_approval"
  case fileChangeApproval = "file_change_approval"
  case applyPatchApproval = "apply_patch_approval"
  case toolCallApproval = "tool_call_approval"
  case toolUserInput = "tool_user_input"
  case authRefresh = "auth_refresh"
}

enum RichRequestOutcome: String, CaseIterable, Sendable, Equatable, Codable {
  case accepted
  case declined
  case answered
  case cancelled
}

/// Wire identity includes the JSON primitive type, so `"1"` never collides with `1`.
enum RichRequestID: Sendable, Equatable, Hashable {
  case text(String)
  case number(Decimal)

  init?(json: RichJSON?) {
    switch json {
    case .string(let value) where !value.isEmpty:
      self = .text(value)
    case .number(let value):
      self = .number(value)
    default:
      return nil
    }
  }

  var identityKey: String {
    switch self {
    case .text(let value): "s:\(value)"
    case .number(let value): "n:\(Self.canonical(value))"
    }
  }

  var displayValue: String {
    switch self {
    case .text(let value): value
    case .number(let value): Self.canonical(value)
    }
  }

  var jsonValue: RichJSON {
    switch self {
    case .text(let value): .string(value)
    case .number(let value): .number(value)
    }
  }

  private static func canonical(_ value: Decimal) -> String {
    let result = NSDecimalNumber(decimal: value).stringValue
    return result == "-0" ? "0" : result
  }
}

struct RichRequestOption: Sendable, Equatable {
  let optionID: String
  let label: String
  let description: String?
}

struct RichRequestPayload: Sendable, Equatable {
  let summary: String
  let details: RichJSON?
  let options: [RichRequestOption]?
  let multiSelect: Bool?
}

struct RichOpenRequest: Sendable, Equatable, Identifiable {
  var id: RichRequestID { requestID }
  let requestID: RichRequestID
  let threadID: String
  let type: RichRequestType
  let payload: RichRequestPayload
  let receivedAtMilliseconds: Int64
}

enum RichRequestDecoder {
  static func decodePayload(_ value: RichJSON?) throws -> RichRequestPayload {
    guard let object = value?.objectValue,
      let summary = RichDecoding.requiredString(object, "summary")
    else { throw RichDomainDecodeError.invalidRuntimeEvent }

    let optionsField = RichDecoding.optionalArray(object, "options")
    let multiSelectField = RichDecoding.optionalBool(object, "multiSelect")
    guard optionsField != .invalid, multiSelectField != .invalid else {
      throw RichDomainDecodeError.invalidRuntimeEvent
    }
    let options = try optionsField.value?.map { raw -> RichRequestOption in
      guard let option = raw.objectValue,
        let optionID = RichDecoding.requiredString(option, "optionId"),
        let label = RichDecoding.requiredString(option, "label")
      else { throw RichDomainDecodeError.invalidRuntimeEvent }
      let description = RichDecoding.optionalString(option, "description")
      guard description != .invalid else { throw RichDomainDecodeError.invalidRuntimeEvent }
      return RichRequestOption(
        optionID: optionID,
        label: label,
        description: description.value
      )
    }
    return RichRequestPayload(
      summary: summary,
      details: object["details"],
      options: options,
      multiSelect: multiSelectField.value
    )
  }

  /// Recovers persisted request rows. Latest data wins without changing the first FIFO slot.
  static func recoverOpenRequests(
    threadID: String,
    items: [RichRuntimeItem],
    receivedAtMilliseconds: Int64 = 0
  ) -> [RichOpenRequest] {
    var order: [String] = []
    var byIdentity: [String: RichOpenRequest] = [:]
    for item in items where item.type.contains("request") && item.state != .completed {
      guard let outer = item.payload?.objectValue,
        let requestID = RichRequestID(json: outer["requestId"]),
        let payload = try? decodePayload(outer["payload"])
      else { continue }
      let type =
        outer["requestType"]?.stringValue.flatMap(RichRequestType.init(rawValue:))
        ?? .toolCallApproval
      let key = requestID.identityKey
      if byIdentity[key] == nil { order.append(key) }
      byIdentity[key] = RichOpenRequest(
        requestID: requestID,
        threadID: threadID,
        type: type,
        payload: payload,
        receivedAtMilliseconds: byIdentity[key]?.receivedAtMilliseconds
          ?? receivedAtMilliseconds
      )
    }
    return order.compactMap { byIdentity[$0] }
  }
}

enum RichRequestQueue {
  static func open(_ queue: [RichOpenRequest], request: RichOpenRequest) -> [RichOpenRequest] {
    queue.filter { $0.requestID.identityKey != request.requestID.identityKey } + [request]
  }

  static func resolve(_ queue: [RichOpenRequest], id: RichRequestID) -> [RichOpenRequest] {
    queue.filter { $0.requestID.identityKey != id.identityKey }
  }
}
