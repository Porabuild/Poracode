import Foundation

struct ThreadLifecycleHTTPRequest: Sendable {
  let method: String
  let path: String
  let body: Data
  let headers: [String: String]
}

enum ThreadLifecycleRawHTTPError: Error, Equatable, Sendable {
  case http(statusCode: Int, code: String)
  case transport
}

protocol ThreadLifecycleRawHTTPExecuting: Sendable {
  func executeThreadLifecycleRequest(_ request: ThreadLifecycleHTTPRequest) async throws -> Data
}

enum ThreadLifecycleTransportError: Error, Equatable, Sendable {
  case invalidRequest
  case http(statusCode: Int, code: String)
  case ambiguousOutcome
}

protocol ThreadLifecycleRemoteAPI: Sendable {
  func remoteStartExistingThread(
    _ request: ThreadStartExistingRequest,
    commandID: String
  ) async throws -> String

  func remoteRunThreadCommand(
    threadID: String,
    command: ThreadRemoteCommand,
    commandID: String?
  ) async throws
}

struct GeneratedThreadLifecycleRemoteAPI: ThreadLifecycleRemoteAPI, Sendable {
  private let http: any ThreadLifecycleRawHTTPExecuting

  init(http: any ThreadLifecycleRawHTTPExecuting) {
    self.http = http
  }

  func remoteStartExistingThread(
    _ request: ThreadStartExistingRequest,
    commandID: String
  ) async throws -> String {
    guard !commandID.isEmpty else {
      throw ThreadLifecycleTransportError.invalidRequest
    }
    let prepared = try prepare {
      try GeneratedRemoteV3Contract.threadStartExistingRequest(
        request, commandID: commandID)
    }
    let response = try await dispatch(prepared)
    do {
      return try GeneratedRemoteV3Contract.threadStartExistingResponse(response)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ThreadLifecycleTransportError.ambiguousOutcome
    }
  }

  func remoteRunThreadCommand(
    threadID: String,
    command: ThreadRemoteCommand,
    commandID: String?
  ) async throws {
    guard command.permitsCommandID == (commandID != nil), commandID?.isEmpty != true else {
      throw ThreadLifecycleTransportError.invalidRequest
    }
    let prepared = try prepare {
      try GeneratedRemoteV3Contract.threadCommandRequest(
        threadID: threadID,
        command: command,
        commandID: commandID
      )
    }
    let response = try await dispatch(prepared)
    do {
      try GeneratedRemoteV3Contract.validateThreadCommandResponse(response)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ThreadLifecycleTransportError.ambiguousOutcome
    }
  }

  private func prepare(
    _ operation: () throws -> ThreadLifecyclePreparedRequest
  ) throws -> ThreadLifecyclePreparedRequest {
    do {
      return try operation()
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ThreadLifecycleTransportError.invalidRequest
    }
  }

  private func dispatch(_ prepared: ThreadLifecyclePreparedRequest) async throws -> Data {
    try Task.checkCancellation()
    do {
      return try await http.executeThreadLifecycleRequest(
        ThreadLifecycleHTTPRequest(
          method: prepared.method,
          path: prepared.path,
          body: prepared.body,
          headers: prepared.headers
        ))
    } catch is CancellationError {
      throw CancellationError()
    } catch ThreadLifecycleRawHTTPError.transport {
      throw ThreadLifecycleTransportError.ambiguousOutcome
    } catch let ThreadLifecycleRawHTTPError.http(statusCode, code) {
      throw ThreadLifecycleTransportError.http(statusCode: statusCode, code: code)
    } catch {
      throw ThreadLifecycleTransportError.ambiguousOutcome
    }
  }
}
