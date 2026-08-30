import Foundation

/// The sole bridge between stable GitOperations models and generated remote-v3 symbols.
enum GitOperationsRemoteV3Contract {
  static let protocolVersion = 8
  static let procedurePath = "/api/git/call"

  static func metadata(for procedure: GitOperationProcedure) -> GitOperationMetadata {
    let expected = procedure.metadata
    guard RemoteContractMetadata.protocolVersion == protocolVersion,
      let generated = RemoteContractMetadata.procedures.first(where: {
        $0.name == procedure.rawValue
      }),
      generated.scope == expected.scope.rawValue,
      generated.owner == expected.owner.rawValue,
      generated.resultKind == expected.resultKind.rawValue
    else {
      preconditionFailure("Generated Git operation metadata is incompatible")
    }
    return expected
  }

  static func request(_ request: GitOperationRequest) throws -> Data {
    let payload = try canonicalRequest(request)
    return try GeneratedRemoteV3Contract.procedureEnvelope(
      name: request.procedure.rawValue,
      payload: payload
    )
  }

  static func result(
    for procedure: GitOperationProcedure,
    response: Data
  ) throws -> GitOperationResult {
    let metadata = metadata(for: procedure)
    if metadata.resultKind == .omitted {
      return try omittedResult(response)
    }
    return try canonicalResult(procedure, response: response)
  }

  private static func omittedResult(_ response: Data) throws -> GitOperationResult {
    guard let object = try JSONSerialization.jsonObject(with: response) as? [String: Any],
      object.isEmpty
    else {
      throw RemoteClientError.invalidResponse("Invalid Git operation response.")
    }
    return .omitted
  }

  static func canonical<Value: Codable & Sendable>(
    _ data: Data,
    codec: RemoteRootCodec<Value>,
    boundary: String
  ) throws -> Data {
    try GeneratedRemoteV3Contract.canonicalData(data, codec: codec, boundary: boundary)
  }
}
