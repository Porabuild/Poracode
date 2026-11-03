import Foundation

extension GeneratedRemoteV3Contract {
  static func mcpAppRequest(_ payload: [String: RichJSON]) throws -> Data {
    let canonical = try canonicalData(
      richData(.object(payload)),
      codec: RemoteRootCodecs.procedureU2EControlMcpAppU2ERequest,
      boundary: "MCP App request"
    )
    return try canonicalData(
      richData(.object(["procedure": .string("controlMcpApp"), "payload": try RichJSON.decode(canonical)])),
      codec: RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
      boundary: "MCP App procedure"
    )
  }

  static func mcpAppResult(_ data: Data) throws -> RichJSON {
    guard let envelope = try RichJSON.decode(data).objectValue,
      envelope.count == 1, let result = envelope["result"]
    else { throw RichChatTransportFailure.invalidResponse }
    let canonical = try canonicalData(
      richData(result), codec: RemoteRootCodecs.procedureU2EControlMcpAppU2EResult,
      boundary: "MCP App result"
    )
    return try RichJSON.decode(canonical)
  }
}
