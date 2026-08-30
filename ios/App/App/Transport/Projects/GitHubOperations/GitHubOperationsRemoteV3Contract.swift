import Foundation

/// The only boundary that exposes generated remote-v3 symbols to GitHubOperations.
enum GitHubOperationsRemoteV3Contract {
  static let protocolVersion = 8
  static let procedurePath = "/api/git/call"

  static func metadata(for procedure: GitHubProcedure) -> GitHubProcedureMetadata {
    let expected = procedure.metadata
    guard RemoteContractMetadata.protocolVersion == protocolVersion,
      let generated = RemoteContractMetadata.procedures.first(where: {
        $0.name == procedure.rawValue
      }),
      generated.scope == expected.scope.rawValue,
      generated.owner == expected.owner.rawValue,
      generated.resultKind == expected.resultKind.rawValue
    else {
      preconditionFailure("Generated GitHub operation metadata is incompatible")
    }
    return expected
  }

  static func request(_ request: GitHubOperationRequest) throws -> Data {
    let payload = try canonicalRequest(request)
    let payloadObject = try JSONSerialization.jsonObject(with: payload)
    let envelope = try JSONSerialization.data(withJSONObject: [
      "procedure": request.procedure.rawValue,
      "payload": payloadObject,
    ])
    return try canonical(
      envelope,
      codec: RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
      boundary: "GitHub procedure envelope"
    )
  }

  static func result(
    for procedure: GitHubProcedure,
    response: Data
  ) throws -> GitHubOperationResult {
    let metadata = metadata(for: procedure)
    if metadata.resultKind == .omitted {
      return try omittedResult(procedure, response: response)
    }
    let canonical = try canonicalResult(procedure, response: response)
    let value = try JSONDecoder().decode(GitHubJSONValue.self, from: canonical)
    return .json(procedure: procedure, document: GitHubDocument(value: value))
  }

  private static func omittedResult(
    _ procedure: GitHubProcedure,
    response: Data
  ) throws -> GitHubOperationResult {
    let schema = RemoteSchema(
      type: "object",
      required: [],
      properties: [:],
      additionalAllowed: false,
      unknownPolicy: .reject
    )
    let codec = RemoteRootCodec<RemoteUnit>(
      id: "procedure.\(procedure.rawValue).result",
      schema: schema
    )
    _ = try canonical(response, codec: codec, boundary: "omitted GitHub result")
    return .omitted(procedure: procedure)
  }

  static func canonical<Value: Codable & Sendable>(
    _ data: Data,
    codec: RemoteRootCodec<Value>,
    boundary: String
  ) throws -> Data {
    do {
      let result = try codec.decode(data)
      return try codec.encodeSnapshot(result)
    } catch {
      throw GitHubOperationsFailure.invalidResponse
    }
  }
}
