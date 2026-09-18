import Foundation

extension GeneratedRemoteV3Contract {
  static func clientWebSocketMessage(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.websocketU2EClient,
      boundary: "WebSocket client message"
    )
  }

  /// Unknown top-level types bypass the generated closed union and stay forward-compatible.
  /// Every generated known variant is validated through the authoritative server root codec.
  static func serverWebSocketMessage(_ data: Data) throws -> Data {
    let root: JSONValue
    do {
      root = try JSONDecoding.decode(JSONValue.self, from: data)
    } catch {
      throw RemoteClientError.invalidResponse("Invalid WebSocket server message.")
    }
    guard let type = root["type"]?.stringValue else {
      throw RemoteClientError.invalidResponse("WebSocket message missing type.")
    }
    let knownTypes = RemoteContractMetadata.webSocketVariants.lazy
      .filter { $0.direction == "server" }
      .map(\.type)
    guard knownTypes.contains(type) else { return data }
    return try canonicalData(
      data, codec: RemoteRootCodecs.websocketU2EServer,
      boundary: "WebSocket server message"
    )
  }
}
