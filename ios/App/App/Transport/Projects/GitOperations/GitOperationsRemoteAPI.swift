import Foundation

protocol GitOperationsRemoteAPI: Sendable {
  func remoteGitOperation(_ request: GitOperationRequest) async throws -> GitOperationResult
}

enum GitOperationsRemoteMutationError: Error, Sendable {
  case ambiguousOutcome
}

extension RemoteAPIClient: GitOperationsRemoteAPI {
  func remoteGitOperation(_ request: GitOperationRequest) async throws -> GitOperationResult {
    let metadata = GitOperationsRemoteV3Contract.metadata(for: request.procedure)
    let body = try GitOperationsRemoteV3Contract.request(request)
    let response: Data
    do {
      response = try await requestData(
        path: GitOperationsRemoteV3Contract.procedurePath,
        method: "POST",
        jsonBody: body,
        // Include time waiting behind other repository mutations and the host's RPC deadline.
        timeout: request.procedure == .gitAddWorktree ? 660 : nil
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError
      where metadata.isMutation
        && RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .requestMayHaveCommitted
    {
      throw GitOperationsRemoteMutationError.ambiguousOutcome
    } catch {
      throw error
    }

    do {
      try Task.checkCancellation()
      return try GitOperationsRemoteV3Contract.result(
        for: request.procedure,
        response: response
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch  where metadata.isMutation {
      throw GitOperationsRemoteMutationError.ambiguousOutcome
    } catch {
      throw error
    }
  }
}
