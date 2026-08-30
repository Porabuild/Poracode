import Foundation

/// Stable app-owned access to the generated remote-v3 root codecs.
///
/// Hash-derived generated model names must remain behind this boundary. App code exchanges
/// canonical JSON data and continues to project it into the stable domain models it owns.
enum GeneratedRemoteV3Contract {
  static let expectedProtocolVersion = 8
  static let expectedBindingFormatVersion = 2
  static let expectedGeneratorVersion = 3
  static let expectedNativeBundleManifestFormatVersion = 1

  static var isCompatible: Bool {
    RemoteContractMetadata.protocolVersion == expectedProtocolVersion
      && RemoteContractMetadata.bindingFormatVersion == expectedBindingFormatVersion
      && RemoteContractMetadata.generatorVersion == expectedGeneratorVersion
  }

  static func assertCompatibility() {
    guard let url = Bundle.main.url(forResource: "native-bindings", withExtension: "json"),
      let data = try? Data(contentsOf: url)
    else {
      preconditionFailure("The generated remote-v3 binding manifest is missing.")
    }
    precondition(
      isCompatible(withNativeBundleManifest: data),
      "Generated remote-v3 bindings are incompatible with this app."
    )
  }

  static func isCompatible(withNativeBundleManifest data: Data) -> Bool {
    guard let manifest = try? JSONDecoder().decode(CompatibilityManifest.self, from: data)
    else { return false }
    return isCompatible
      && manifest.protocolVersion == RemoteContractMetadata.protocolVersion
      && manifest.bindingFormatVersion == RemoteContractMetadata.bindingFormatVersion
      && manifest.generatorVersion == RemoteContractMetadata.generatorVersion
      && manifest.formatVersion == expectedNativeBundleManifestFormatVersion
  }

  static func environmentResponse(_ data: Data, legacy: Bool) throws -> Data {
    if legacy {
      return try canonicalData(
        data, codec: RemoteRootCodecs.routeU2EEnvironmentU2DLegacyU2EResponse,
        boundary: "legacy environment response"
      )
    }
    return try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EEnvironmentU2EResponse,
      boundary: "environment response"
    )
  }

  static func tokenExchangeRequest(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2ETokenU2DExchangeU2ERequest,
      boundary: "token exchange request"
    )
  }

  static func tokenExchangeResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2ETokenU2DExchangeU2EResponse,
      boundary: "token exchange response"
    )
  }

  static func shellSnapshotResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EShellU2DSnapshotU2EResponse,
      boundary: "shell snapshot response"
    )
  }

  static func threadHistoryPath(threadId: String) throws -> String {
    try canonicalThreadId(
      threadId, codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2EPath,
      boundary: "thread history path"
    )
  }

  static func threadHistoryQuery(
    targetTimelineEntryCount: Int?
  ) throws -> [URLQueryItem] {
    var object: [String: Any] = ["runtimePage": "1"]
    if let targetTimelineEntryCount {
      object["targetTimelineEntryCount"] = targetTimelineEntryCount
    }
    let snapshot = try canonicalSnapshot(
      jsonData(object), codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2EQuery,
      boundary: "thread history query"
    )
    return try queryItems(snapshot, order: ["runtimePage", "targetTimelineEntryCount"])
  }

  static func threadHistoryResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2EResponse,
      boundary: "thread history response"
    )
  }

  static func historyItemsPath(threadId: String) throws -> String {
    try canonicalThreadId(
      threadId, codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EPath,
      boundary: "history items path"
    )
  }

  static func historyItemsQuery(
    beforePosition: Int?, limit: Int, targetTimelineEntryCount: Int?
  ) throws -> [URLQueryItem] {
    var object: [String: Any] = ["limit": limit]
    if let beforePosition { object["beforePosition"] = beforePosition }
    if let targetTimelineEntryCount {
      object["targetTimelineEntryCount"] = targetTimelineEntryCount
    }
    let snapshot = try canonicalSnapshot(
      jsonData(object), codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EQuery,
      boundary: "history items query"
    )
    return try queryItems(
      snapshot, order: ["limit", "beforePosition", "targetTimelineEntryCount"]
    )
  }

  static func historyItemsResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EResponse,
      boundary: "history items response"
    )
  }

  static func threadSendPath(threadId: String) throws -> String {
    try canonicalThreadId(
      threadId, codec: RemoteRootCodecs.routeU2EThreadU2DSendU2EPath,
      boundary: "thread send path"
    )
  }

  static func threadSendRequest(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DSendU2ERequest,
      boundary: "thread send request"
    )
  }

  static func threadSendResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DSendU2EResponse,
      boundary: "thread send response"
    )
  }

  static func interruptPath(threadId: String) throws -> String {
    try canonicalThreadId(
      threadId, codec: RemoteRootCodecs.routeU2EThreadU2DInterruptU2EPath,
      boundary: "thread interrupt path"
    )
  }

  static func interruptRequest() throws -> Data {
    try canonicalData(
      Data("{}".utf8), codec: RemoteRootCodecs.routeU2EThreadU2DInterruptU2ERequest,
      boundary: "thread interrupt request"
    )
  }

  static func interruptResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DInterruptU2EResponse,
      boundary: "thread interrupt response"
    )
  }

  static func websocketTicketResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EWebsocketU2DTicketU2EResponse,
      boundary: "WebSocket ticket response"
    )
  }

  static func pushRegisterRequest(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EPushU2DRegisterU2ERequest,
      boundary: "push register request"
    )
  }

  static func pushRegisterResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EPushU2DRegisterU2EResponse,
      boundary: "push register response"
    )
  }

  static func pushUnregisterRequest(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EPushU2DUnregisterU2ERequest,
      boundary: "push unregister request"
    )
  }

  static func pushUnregisterResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EPushU2DUnregisterU2EResponse,
      boundary: "push unregister response"
    )
  }

  private static func canonicalThreadId<Value: Codable & Sendable>(
    _ threadId: String, codec: RemoteRootCodec<Value>, boundary: String
  ) throws -> String {
    let snapshot = try canonicalSnapshot(
      jsonData(["threadId": threadId]), codec: codec, boundary: boundary
    )
    guard case .object(let object) = snapshot, case .string(let value)? = object["threadId"] else {
      throw RemoteClientError.invalidResponse("The generated codec returned an invalid path.")
    }
    return value
  }

  private static func queryItems(
    _ snapshot: RemoteJSONValue, order: [String]
  ) throws -> [URLQueryItem] {
    guard case .object(let object) = snapshot else {
      throw RemoteClientError.invalidResponse("The generated codec returned an invalid query.")
    }
    return try order.compactMap { name in
      guard let value = object[name] else { return nil }
      switch value {
      case .string(let text): return URLQueryItem(name: name, value: text)
      case .int(let number):
        return URLQueryItem(name: name, value: try RemoteQueryCodec.encodeInt(number))
      default:
        throw RemoteClientError.invalidResponse("The generated codec returned an invalid query.")
      }
    }
  }

  private static func jsonData(_ object: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: object)
  }

  static func canonicalData<Value: Codable & Sendable>(
    _ data: Data, codec: RemoteRootCodec<Value>, boundary: String
  ) throws -> Data {
    do {
      let result = try codec.decode(data, decoder: JSONDecoding.decoder)
      return try codec.encodeSnapshot(result)
    } catch {
      throw RemoteClientError.invalidResponse("Invalid \(boundary).")
    }
  }

  private static func canonicalSnapshot<Value: Codable & Sendable>(
    _ data: Data, codec: RemoteRootCodec<Value>, boundary: String
  ) throws -> RemoteJSONValue {
    try canonicalResult(data, codec: codec, boundary: boundary).validatedSnapshot
  }

  private static func canonicalResult<Value: Codable & Sendable>(
    _ data: Data, codec: RemoteRootCodec<Value>, boundary: String
  ) throws -> RemoteRootValue<Value> {
    do {
      return try codec.decode(data, decoder: JSONDecoding.decoder)
    } catch {
      throw RemoteClientError.invalidResponse("Invalid \(boundary).")
    }
  }
}

private struct CompatibilityManifest: Decodable {
  let protocolVersion: Int
  let bindingFormatVersion: Int
  let generatorVersion: Int
  let formatVersion: Int
}
