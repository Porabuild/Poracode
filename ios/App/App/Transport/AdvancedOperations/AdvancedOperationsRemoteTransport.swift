import Foundation

enum AdvancedOperationsHTTPError: Error, Equatable, Sendable {
  case transport
  case rejected(statusCode: Int, code: String?)
}

/// Integration seam must perform one POST and honor the supplied timeout class.
protocol AdvancedOperationsHTTPExecuting: Sendable {
  func postAdvancedProcedure(
    path: String,
    body: Data,
    timeout: AdvancedOperationTimeout
  ) async throws -> Data
}

enum AdvancedOperationsTransportError: Error, Equatable, Sendable {
  case invalidRequest
  case rejected(statusCode: Int, code: String?)
  case invalidResponse
  case ambiguousDelivery
  case transport
}

protocol AdvancedOperationsRemoteAPI: Sendable {
  func remoteCall(_ request: AdvancedOperationRequest) async throws -> AdvancedOperationResult
}

struct AdvancedOperationsRemoteTransport: AdvancedOperationsRemoteAPI, Sendable {
  private let http: any AdvancedOperationsHTTPExecuting

  init(http: any AdvancedOperationsHTTPExecuting) {
    self.http = http
  }

  func remoteCall(_ request: AdvancedOperationRequest) async throws -> AdvancedOperationResult {
    try Task.checkCancellation()
    let metadata: AdvancedOperationMetadata
    let body: Data
    do {
      metadata = try AdvancedOperationsRemoteV3Contract.metadata(for: request.procedure)
      body = try AdvancedOperationsRemoteV3Contract.requestEnvelope(request)
    } catch {
      throw AdvancedOperationsTransportError.invalidRequest
    }

    let response: Data
    do {
      response = try await http.postAdvancedProcedure(
        path: AdvancedOperationsRemoteV3Contract.procedurePath,
        body: body,
        timeout: metadata.timeout
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch AdvancedOperationsHTTPError.transport {
      if metadata.delivery == .singleAttempt {
        throw AdvancedOperationsTransportError.ambiguousDelivery
      }
      throw AdvancedOperationsTransportError.transport
    } catch AdvancedOperationsHTTPError.rejected(let statusCode, let code) {
      if metadata.delivery == .singleAttempt,
        RemoteMutationClassification.classify(statusCode: statusCode)
          == .requestMayHaveCommitted
      {
        throw AdvancedOperationsTransportError.ambiguousDelivery
      }
      throw AdvancedOperationsTransportError.rejected(statusCode: statusCode, code: code)
    } catch {
      if metadata.delivery == .singleAttempt {
        throw AdvancedOperationsTransportError.ambiguousDelivery
      }
      throw AdvancedOperationsTransportError.transport
    }

    try Task.checkCancellation()
    do {
      return try AdvancedOperationsRemoteV3Contract.result(
        for: request.procedure,
        envelope: response
      )
    } catch {
      if metadata.delivery == .singleAttempt {
        throw AdvancedOperationsTransportError.ambiguousDelivery
      }
      throw AdvancedOperationsTransportError.invalidResponse
    }
  }
}
