import Foundation

protocol BrowserMirrorRemoteAPI: Sendable {
  func fetchState() async throws -> BrowserMirrorState
  func perform(_ command: BrowserMirrorCommand) async throws -> BrowserMirrorState
}

struct GeneratedBrowserMirrorRemoteAPI: BrowserMirrorRemoteAPI, Sendable {
  private let http: any BrowserMirrorHTTPExecuting

  init(http: any BrowserMirrorHTTPExecuting) {
    self.http = http
  }

  func fetchState() async throws -> BrowserMirrorState {
    do {
      let data = try await http.execute(
        BrowserMirrorHTTPRequest(route: .state, body: nil))
      return try BrowserMirrorRemoteV3Adapter.stateResponse(data)
    } catch is CancellationError {
      throw CancellationError()
    } catch let BrowserMirrorHTTPError.rejected(statusCode, code) {
      throw BrowserMirrorFailure.rejected(statusCode: statusCode, code: code)
    } catch BrowserMirrorContractError.invalidResponse,
      BrowserMirrorHTTPError.invalidResponse,
      BrowserMirrorHTTPError.responseTooLarge
    {
      throw BrowserMirrorFailure.invalidResponse
    } catch BrowserMirrorHTTPError.invalidConfiguration {
      throw BrowserMirrorFailure.invalidRequest
    } catch {
      throw BrowserMirrorFailure.transport
    }
  }

  func perform(_ command: BrowserMirrorCommand) async throws -> BrowserMirrorState {
    let body: Data
    do {
      body = try BrowserMirrorRemoteV3Adapter.commandRequest(command)
    } catch {
      throw BrowserMirrorFailure.invalidRequest
    }

    let data: Data
    do {
      data = try await http.execute(
        BrowserMirrorHTTPRequest(route: .command, body: body))
    } catch let BrowserMirrorHTTPError.rejected(statusCode, code) {
      if RemoteMutationClassification.classify(statusCode: statusCode)
        == .requestMayHaveCommitted
      {
        throw BrowserMirrorFailure.ambiguousMutation
      }
      throw BrowserMirrorFailure.rejected(statusCode: statusCode, code: code)
    } catch BrowserMirrorHTTPError.invalidConfiguration {
      throw BrowserMirrorFailure.invalidRequest
    } catch {
      throw BrowserMirrorFailure.ambiguousMutation
    }

    do {
      return try BrowserMirrorRemoteV3Adapter.commandResponse(data)
    } catch {
      throw BrowserMirrorFailure.ambiguousMutation
    }
  }
}
