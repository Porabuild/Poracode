import Foundation

struct ThreadLifecyclePreparedRequest: Sendable {
  let method: String
  let path: String
  let body: Data
  let headers: [String: String]
}

struct ThreadLifecycleRouteContract: Sendable {
  let id: String
  let method: String
  let path: String
  let requiredScope: String
  let successStatus: Int
}

extension GeneratedRemoteV3Contract {
  static func threadStartExistingRequest(
    _ request: ThreadStartExistingRequest,
    commandID: String
  ) throws -> ThreadLifecyclePreparedRequest {
    let route = try threadLifecycleRoute(
      id: "thread-start-existing", expectedPath: "/api/threads/start")
    let body = try canonicalData(
      try threadLifecycleData(request),
      codec: RemoteRootCodecs.routeU2EThreadU2DStartU2DExistingU2ERequest,
      boundary: "thread start-existing request"
    )
    return ThreadLifecyclePreparedRequest(
      method: route.method,
      path: route.path,
      body: body,
      headers: [ProtocolConstants.commandIdHeader: commandID]
    )
  }

  static func threadStartExistingResponse(_ data: Data) throws -> String {
    let canonical = try canonicalData(
      data,
      codec: RemoteRootCodecs.routeU2EThreadU2DStartU2DExistingU2EResponse,
      boundary: "thread start-existing response"
    )
    let object = try JSONSerialization.jsonObject(with: canonical) as? [String: Any]
    guard let threadID = object?["threadId"] as? String, !threadID.isEmpty else {
      throw RemoteClientError.invalidResponse("Invalid thread start-existing response.")
    }
    return threadID
  }

  static func threadCommandRequest(
    threadID: String,
    command: ThreadRemoteCommand,
    commandID: String?
  ) throws -> ThreadLifecyclePreparedRequest {
    let route = try threadLifecycleRoute(
      id: "thread-command", expectedPath: "/api/threads/{threadId}/command")
    let pathID = try threadLifecyclePathThreadID(threadID)
    let body = try canonicalData(
      try threadLifecycleData(command),
      codec: RemoteRootCodecs.routeU2EThreadU2DCommandU2ERequest,
      boundary: "thread command request"
    )
    let headers: [String: String]
    if command.permitsCommandID, let commandID {
      headers = [ProtocolConstants.commandIdHeader: commandID]
    } else {
      headers = [:]
    }
    return ThreadLifecyclePreparedRequest(
      method: route.method,
      path: route.path.replacingOccurrences(
        of: "{threadId}", with: threadLifecycleEncodePathSegment(pathID)),
      body: body,
      headers: headers
    )
  }

  static func validateThreadCommandResponse(_ data: Data) throws {
    _ = try canonicalData(
      data,
      codec: RemoteRootCodecs.routeU2EThreadU2DCommandU2EResponse,
      boundary: "thread command response"
    )
  }

  static func threadLifecycleRouteContract(id: String) throws -> ThreadLifecycleRouteContract {
    switch id {
    case "thread-start-existing":
      return try threadLifecycleRoute(id: id, expectedPath: "/api/threads/start")
    case "thread-command":
      return try threadLifecycleRoute(
        id: id, expectedPath: "/api/threads/{threadId}/command")
    default:
      throw RemoteClientError.invalidResponse("Unknown thread lifecycle route.")
    }
  }

  private static func threadLifecycleRoute(
    id: String,
    expectedPath: String
  ) throws -> ThreadLifecycleRouteContract {
    guard let route = RemoteContractMetadata.routes.first(where: { $0.id == id }),
      route.method == "POST",
      route.path == expectedPath,
      route.auth == "bearer",
      route.scopes == ["session:operate"],
      route.bodyKind == "json",
      route.responseKind == "json",
      route.status == 200
    else {
      throw RemoteClientError.invalidResponse("Invalid generated thread lifecycle metadata.")
    }
    return ThreadLifecycleRouteContract(
      id: route.id,
      method: route.method,
      path: route.path,
      requiredScope: route.scopes[0],
      successStatus: route.status
    )
  }

  private static func threadLifecyclePathThreadID(_ threadID: String) throws -> String {
    let canonical = try canonicalData(
      try JSONSerialization.data(withJSONObject: ["threadId": threadID]),
      codec: RemoteRootCodecs.routeU2EThreadU2DCommandU2EPath,
      boundary: "thread command path"
    )
    let object = try JSONSerialization.jsonObject(with: canonical) as? [String: Any]
    guard let value = object?["threadId"] as? String, !value.isEmpty else {
      throw RemoteClientError.invalidResponse("Invalid thread command path.")
    }
    return value
  }

  private static func threadLifecycleData<Value: Encodable>(_ value: Value) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return try encoder.encode(value)
  }

  private static func threadLifecycleEncodePathSegment(_ value: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-_.!~*'()")
    return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
  }
}
