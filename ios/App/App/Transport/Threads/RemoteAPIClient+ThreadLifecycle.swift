import Foundation

extension RemoteAPIClient: ThreadLifecycleRawHTTPExecuting {
  func executeThreadLifecycleRequest(_ request: ThreadLifecycleHTTPRequest) async throws -> Data {
    do {
      return try await requestData(
        path: request.path,
        method: request.method,
        jsonBody: request.body,
        extraHeaders: request.headers
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError {
      if RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .requestMayHaveCommitted {
        throw ThreadLifecycleRawHTTPError.transport
      }
      throw ThreadLifecycleRawHTTPError.http(statusCode: error.status, code: error.code)
    } catch {
      throw ThreadLifecycleRawHTTPError.transport
    }
  }
}
