import Foundation

/// Stable, hash-free aliases for the generated project roots.
///
/// Domain and transport code must not mention generator-derived model names. Each request,
/// path, and response crosses its generated root codec here before becoming an app model.
extension GeneratedRemoteV3Contract {
  static func projectCommandRequest(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EProjectU2DCommandU2ERequest,
      boundary: "project command request"
    )
  }

  static func projectCommandResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EProjectU2DCommandU2EResponse,
      boundary: "project command response"
    )
  }

  static func projectSettingsPath(projectId: String) throws -> String {
    try projectPath(
      projectId, codec: RemoteRootCodecs.routeU2EProjectU2DSettingsU2EPath,
      boundary: "project settings path"
    )
  }

  static func projectSettingsResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EProjectU2DSettingsU2EResponse,
      boundary: "project settings response"
    )
  }

  static func projectNotesReadPath(projectId: String) throws -> String {
    try projectPath(
      projectId, codec: RemoteRootCodecs.routeU2EProjectU2DNotesU2DReadU2EPath,
      boundary: "project notes read path"
    )
  }

  static func projectNotesReadResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EProjectU2DNotesU2DReadU2EResponse,
      boundary: "project notes read response"
    )
  }

  static func projectNotesWritePath(projectId: String) throws -> String {
    try projectPath(
      projectId, codec: RemoteRootCodecs.routeU2EProjectU2DNotesU2DWriteU2EPath,
      boundary: "project notes write path"
    )
  }

  static func projectNotesWriteRequest(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EProjectU2DNotesU2DWriteU2ERequest,
      boundary: "project notes write request"
    )
  }

  static func projectNotesWriteResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EProjectU2DNotesU2DWriteU2EResponse,
      boundary: "project notes write response"
    )
  }

  static func browseHostDirectoryEnvelope(path: String) throws -> Data {
    let payload = try canonicalData(
      try jsonData(BrowseHostDirectoryRequest(path: path)),
      codec: RemoteRootCodecs.procedureU2EBrowseHostDirectoryU2ERequest,
      boundary: "browse host directory request"
    )
    return try procedureEnvelope(name: "browseHostDirectory", payload: payload)
  }

  static func browseHostDirectoryResult(_ envelope: Data) throws -> Data {
    try procedureResult(
      envelope, codec: RemoteRootCodecs.procedureU2EBrowseHostDirectoryU2EResult,
      boundary: "browse host directory result"
    )
  }

  static func detectSetupScriptEnvelope(location: ProjectLocation) throws -> Data {
    let payload = try canonicalData(
      try jsonData(DetectSetupScriptRequest(projectLocation: location)),
      codec: RemoteRootCodecs.procedureU2EDetectSetupScriptU2ERequest,
      boundary: "detect setup script request"
    )
    return try procedureEnvelope(name: "detectSetupScript", payload: payload)
  }

  static func detectSetupScriptResult(_ envelope: Data) throws -> Data {
    try procedureResult(
      envelope, codec: RemoteRootCodecs.procedureU2EDetectSetupScriptU2EResult,
      boundary: "detect setup script result"
    )
  }

  private static func projectPath<Value: Codable & Sendable>(
    _ projectId: String,
    codec: RemoteRootCodec<Value>,
    boundary: String
  ) throws -> String {
    let canonical = try canonicalData(
      try JSONSerialization.data(withJSONObject: ["projectId": projectId]),
      codec: codec,
      boundary: boundary
    )
    let value = try JSONDecoding.decode(JSONValue.self, from: canonical)
    guard case .object(let object) = value,
      case .string(let validated)? = object["projectId"]
    else {
      throw RemoteClientError.invalidResponse("Invalid project path.")
    }
    return validated
  }

  static func procedureEnvelope(name: String, payload: Data) throws -> Data {
    let payloadValue = try JSONSerialization.jsonObject(with: payload)
    let envelope = try JSONSerialization.data(withJSONObject: [
      "procedure": name,
      "payload": payloadValue,
    ])
    return try canonicalData(
      envelope, codec: RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
      boundary: "procedure call request"
    )
  }

  static func procedureResult<Value: Codable & Sendable>(
    _ envelope: Data,
    codec: RemoteRootCodec<Value>,
    boundary: String
  ) throws -> Data {
    let value = try JSONDecoding.decode(JSONValue.self, from: envelope)
    guard case .object(let object) = value, let result = object["result"] else {
      throw RemoteClientError.invalidResponse("Invalid procedure result envelope.")
    }
    return try canonicalData(
      try JSONDecoding.encoder.encode(result), codec: codec, boundary: boundary
    )
  }

  static func jsonData<Value: Encodable>(_ value: Value) throws -> Data {
    try JSONDecoding.encoder.encode(value)
  }
}
