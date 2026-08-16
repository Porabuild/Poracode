import Foundation

/// Stable, hash-free access to generated rich-chat route roots.
///
/// No caller outside this file mentions generator-derived model names. Values cross the
/// generated codec before path projection, request dispatch, or response decoding.
extension GeneratedRemoteV3Contract {
  static func richSend(threadID: String, input: RichChatSendInput) throws
    -> RichChatPreparedJSONRoute
  {
    var body: [String: RichJSON] = [
      "prompt": .string(input.prompt),
      "config": .object(input.config),
    ]
    if let segments = input.segments {
      body["segments"] = .array(segments.map(\.richChatWireValue))
    }
    if let itemID = input.userMessageItemID { body["userMessageItemId"] = .string(itemID) }
    return try richThreadRoute(
      threadID: threadID,
      body: .object(body),
      pathCodec: RemoteRootCodecs.routeU2EThreadU2DSendU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2EThreadU2DSendU2ERequest,
      boundary: "thread send"
    )
  }

  static func richInterrupt(threadID: String) throws -> RichChatPreparedJSONRoute {
    try richThreadRoute(
      threadID: threadID,
      body: .object([:]),
      pathCodec: RemoteRootCodecs.routeU2EThreadU2DInterruptU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2EThreadU2DInterruptU2ERequest,
      boundary: "thread interrupt"
    )
  }

  static func richCloseThread(threadID: String) throws -> RichChatPreparedJSONRoute {
    try richThreadRoute(
      threadID: threadID,
      body: .object([:]),
      pathCodec: RemoteRootCodecs.routeU2EThreadU2DCloseU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2EThreadU2DCloseU2ERequest,
      boundary: "thread close"
    )
  }

  static func richTruncate(threadID: String, after itemID: String) throws
    -> RichChatPreparedJSONRoute
  {
    try richThreadRoute(
      threadID: threadID,
      body: .object(["itemId": .string(itemID)]),
      pathCodec: RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DTruncateU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DTruncateU2ERequest,
      boundary: "thread runtime truncate"
    )
  }

  static func richThreadCommand(threadID: String, command: RichChatThreadCommand) throws
    -> RichChatPreparedJSONRoute
  {
    try richThreadRoute(
      threadID: threadID,
      body: .object(command.payload),
      pathCodec: RemoteRootCodecs.routeU2EThreadU2DCommandU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2EThreadU2DCommandU2ERequest,
      boundary: "thread command"
    )
  }

  static func richGoal(threadID: String, update: RichChatGoalUpdate) throws
    -> RichChatPreparedJSONRoute
  {
    let body: RichJSON
    switch update {
    case .edit(let objective):
      body = .object([
        "action": .string("edit"),
        "objective": .string(objective.trimmingCharacters(in: .whitespacesAndNewlines)),
      ])
    case .pause: body = .object(["action": .string("pause")])
    case .resume: body = .object(["action": .string("resume")])
    case .clear: body = .object(["action": .string("clear")])
    }
    return try richThreadRoute(
      threadID: threadID,
      body: body,
      pathCodec: RemoteRootCodecs.routeU2EThreadU2DGoalU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2EThreadU2DGoalU2ERequest,
      boundary: "thread goal"
    )
  }

  static func richSetSteer(threadID: String, input: RichSetPendingSteerInput) throws
    -> RichChatPreparedJSONRoute
  {
    var body: [String: RichJSON] = [
      "prompt": .string(input.prompt),
      "config": .object(input.config),
    ]
    if let segments = input.segments {
      body["segments"] = .array(segments.map(\.richChatWireValue))
    }
    return try richThreadRoute(
      threadID: threadID,
      body: .object(body),
      pathCodec: RemoteRootCodecs.routeU2EThreadU2DSteerU2DSetU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2EThreadU2DSteerU2DSetU2ERequest,
      boundary: "thread steer set"
    )
  }

  static func richClearSteer(threadID: String) throws -> RichChatPreparedJSONRoute {
    try richThreadRoute(
      threadID: threadID,
      body: .object([:]),
      pathCodec: RemoteRootCodecs.routeU2EThreadU2DSteerU2DClearU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2EThreadU2DSteerU2DClearU2ERequest,
      boundary: "thread steer clear"
    )
  }

  static func richResolveRequest(
    threadID: String,
    resolution: RichChatRequestResolution
  ) throws -> RichChatPreparedJSONRoute {
    try richThreadRoute(
      threadID: threadID,
      body: .object([
        "requestId": resolution.requestID.jsonValue,
        "method": .string(resolution.method),
        "response": resolution.response,
      ]),
      pathCodec: RemoteRootCodecs.routeU2ERequestU2DResolveU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2ERequestU2DResolveU2ERequest,
      boundary: "request resolve"
    )
  }

  static func richTerminalStart(_ input: RichChatTerminalStartInput) throws
    -> RichChatPreparedJSONRoute
  {
    var body: [String: RichJSON] = [
      "shellId": .string(input.shellID),
      "projectLocation": try richJSON(input.projectLocation),
    ]
    if let worktreePath = input.worktreePath { body["worktreePath"] = .string(worktreePath) }
    if let startInHome = input.startInHome { body["startInHome"] = .bool(startInHome) }
    if let size = input.initialSize {
      body["initialSize"] = .object([
        "cols": .number(Decimal(size.columns)),
        "rows": .number(Decimal(size.rows)),
      ])
    }
    let canonical = try canonicalData(
      try richData(.object(body)),
      codec: RemoteRootCodecs.routeU2ETerminalU2DStartU2ERequest,
      boundary: "terminal start request"
    )
    return RichChatPreparedJSONRoute(pathValues: [:], body: canonical)
  }

  static func richTerminalWrite(threadID: String, data: String) throws
    -> RichChatPreparedJSONRoute
  {
    try richThreadRoute(
      threadID: threadID,
      body: .object(["data": .string(data)]),
      pathCodec: RemoteRootCodecs.routeU2ETerminalU2DWriteU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2ETerminalU2DWriteU2ERequest,
      boundary: "terminal write"
    )
  }

  static func richTerminalResize(threadID: String, size: RichChatTerminalSize) throws
    -> RichChatPreparedJSONRoute
  {
    try richThreadRoute(
      threadID: threadID,
      body: .object([
        "cols": .number(Decimal(size.columns)),
        "rows": .number(Decimal(size.rows)),
      ]),
      pathCodec: RemoteRootCodecs.routeU2ETerminalU2DResizeU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2ETerminalU2DResizeU2ERequest,
      boundary: "terminal resize"
    )
  }

  static func richTerminalClose(threadID: String) throws -> RichChatPreparedJSONRoute {
    try richThreadRoute(
      threadID: threadID,
      body: .object([:]),
      pathCodec: RemoteRootCodecs.routeU2ETerminalU2DCloseU2EPath,
      bodyCodec: RemoteRootCodecs.routeU2ETerminalU2DCloseU2ERequest,
      boundary: "terminal close"
    )
  }

  static func richAttachmentUpload(threadID: String, name: String) throws
    -> RichChatPreparedQueryRoute
  {
    let data = try canonicalData(
      try richData(.object(["threadId": .string(threadID), "name": .string(name)])),
      codec: RemoteRootCodecs.routeU2EAttachmentU2DUploadU2EQuery,
      boundary: "attachment upload query"
    )
    return RichChatPreparedQueryRoute(
      pathValues: [:],
      queryItems: try richQueryItems(data, order: ["threadId", "name"])
    )
  }

  static func richAttachmentUploadResponse(_ data: Data) throws -> String {
    let canonical = try canonicalData(
      data,
      codec: RemoteRootCodecs.routeU2EAttachmentU2DUploadU2EResponse,
      boundary: "attachment upload response"
    )
    guard case .object(let object) = try RichJSON.decode(canonical),
      let path = object["path"]?.stringValue
    else { throw RemoteClientError.invalidResponse("Invalid attachment upload response.") }
    return path
  }

  static func richLocalImage(path: String) throws -> RichChatPreparedQueryRoute {
    let data = try canonicalData(
      try richData(.object(["path": .string(path)])),
      codec: RemoteRootCodecs.routeU2ELocalU2DImageU2EQuery,
      boundary: "local image query"
    )
    return RichChatPreparedQueryRoute(
      pathValues: [:], queryItems: try richQueryItems(data, order: ["path"])
    )
  }

  static func richRuntimeImage(_ reference: RichRemoteImageReference) throws
    -> RichChatPreparedQueryRoute
  {
    let pathData = try canonicalData(
      try richData(
        .object([
          "threadId": .string(reference.threadID),
          "itemId": .string(reference.itemID),
        ])),
      codec: RemoteRootCodecs.routeU2ERuntimeU2DImageU2EPath,
      boundary: "runtime image path"
    )
    let pathValues = try richPathValues(pathData, keys: ["threadId", "itemId"])
    let path = reference.path.map { part -> RichJSON in
      switch part {
      case .key(let value): .string(value)
      case .index(let value): .number(Decimal(value))
      }
    }
    let queryData = try canonicalData(
      try richData(.object(["path": .array(path)])),
      codec: RemoteRootCodecs.routeU2ERuntimeU2DImageU2EQuery,
      boundary: "runtime image query"
    )
    return RichChatPreparedQueryRoute(
      pathValues: pathValues,
      queryItems: try richQueryItems(queryData, order: ["path"])
    )
  }

  static func validateRichMutationResponse(_ operation: RichChatMutationOperation, data: Data)
    throws
  {
    switch operation {
    case .send:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EThreadU2DSendU2EResponse,
        boundary: "thread send response")
    case .interrupt:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EThreadU2DInterruptU2EResponse,
        boundary: "thread interrupt response")
    case .closeThread:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EThreadU2DCloseU2EResponse,
        boundary: "thread close response")
    case .truncate:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DTruncateU2EResponse,
        boundary: "runtime truncate response")
    case .threadCommand:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EThreadU2DCommandU2EResponse,
        boundary: "thread command response")
    case .goal:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EThreadU2DGoalU2EResponse,
        boundary: "thread goal response")
    case .steerSet:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EThreadU2DSteerU2DSetU2EResponse,
        boundary: "steer set response")
    case .steerClear:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EThreadU2DSteerU2DClearU2EResponse,
        boundary: "steer clear response")
    case .requestResolve:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2ERequestU2DResolveU2EResponse,
        boundary: "request resolve response")
    case .terminalStart:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2ETerminalU2DStartU2EResponse,
        boundary: "terminal start response")
    case .terminalWrite:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2ETerminalU2DWriteU2EResponse,
        boundary: "terminal write response")
    case .terminalResize:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2ETerminalU2DResizeU2EResponse,
        boundary: "terminal resize response")
    case .terminalClose:
      _ = try canonicalData(
        data, codec: RemoteRootCodecs.routeU2ETerminalU2DCloseU2EResponse,
        boundary: "terminal close response")
    case .procedure, .attachmentUpload:
      preconditionFailure("This mutation has a dedicated response validator.")
    }
  }

  private static func richThreadRoute<Path: Codable & Sendable, Body: Codable & Sendable>(
    threadID: String,
    body: RichJSON,
    pathCodec: RemoteRootCodec<Path>,
    bodyCodec: RemoteRootCodec<Body>,
    boundary: String
  ) throws -> RichChatPreparedJSONRoute {
    let pathData = try canonicalData(
      try richData(.object(["threadId": .string(threadID)])),
      codec: pathCodec,
      boundary: "\(boundary) path"
    )
    let canonicalBody = try canonicalData(
      try richData(body), codec: bodyCodec, boundary: "\(boundary) request"
    )
    return RichChatPreparedJSONRoute(
      pathValues: try richPathValues(pathData, keys: ["threadId"]),
      body: canonicalBody
    )
  }

  static func richPathValues(_ data: Data, keys: [String]) throws -> [String: String] {
    guard case .object(let object) = try RichJSON.decode(data) else {
      throw RemoteClientError.invalidResponse("Invalid generated rich-chat path.")
    }
    return try Dictionary(
      uniqueKeysWithValues: keys.map { key in
        guard let value = object[key]?.stringValue else {
          throw RemoteClientError.invalidResponse("Invalid generated rich-chat path.")
        }
        return (key, value)
      })
  }

  static func richQueryItems(_ data: Data, order: [String]) throws -> [URLQueryItem] {
    guard case .object(let object) = try RichJSON.decode(data) else {
      throw RemoteClientError.invalidResponse("Invalid generated rich-chat query.")
    }
    return try order.compactMap { name in
      guard let value = object[name] else { return nil }
      let encoded: String
      switch value {
      case .string(let text): encoded = text
      case .number(let number): encoded = NSDecimalNumber(decimal: number).stringValue
      case .array, .object: encoded = String(decoding: try richData(value), as: UTF8.self)
      case .bool(let flag): encoded = flag ? "true" : "false"
      case .null: throw RemoteClientError.invalidResponse("Invalid generated rich-chat query.")
      }
      return URLQueryItem(name: name, value: encoded)
    }
  }

  static func richJSON<Value: Encodable>(_ value: Value) throws -> RichJSON {
    try RichJSON.decode(JSONDecoding.encoder.encode(value))
  }

  static func richData(_ value: RichJSON) throws -> Data {
    try JSONDecoding.encoder.encode(value)
  }
}

enum RichChatMutationOperation: Sendable {
  case send
  case interrupt
  case closeThread
  case truncate
  case threadCommand
  case goal
  case steerSet
  case steerClear
  case requestResolve
  case terminalStart
  case terminalWrite
  case terminalResize
  case terminalClose
  case procedure
  case attachmentUpload
}
