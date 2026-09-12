import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import GitHubOperations
#endif

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

final class GitHubOperationsTransportTests: XCTestCase {
  func testExactAuthenticatedPostAndWSLBody() async throws {
    let probe = GitHubHTTPProbe(plans: [.http(200, Data("{}".utf8))])
    let transport = makeTransport(probe)
    let result = try await transport.remoteGitHubOperation(
      .ghClosePr(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 42))
    )
    XCTAssertEqual(result, .omitted(procedure: .ghClosePr))

    let requests = await probe.requests
    XCTAssertEqual(requests.count, 1)
    let request = try XCTUnwrap(requests.first)
    XCTAssertEqual(request.url?.path, "/prefix/api/git/call")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
    let body = try XCTUnwrap(request.httpBody)
    let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    XCTAssertEqual(envelope["procedure"] as? String, "ghClosePr")
    let payload = try XCTUnwrap(envelope["payload"] as? [String: Any])
    let location = try XCTUnwrap(payload["projectLocation"] as? [String: Any])
    XCTAssertEqual(location["linuxPath"] as? String, "/home/dev/repo")
    XCTAssertEqual(
      location["uncPath"] as? String,
      #"\\wsl.localhost\Ubuntu-24.04\home\dev\repo"#
    )
  }

  func testMutationTransport5xxAndMalformedSuccessAreAmbiguousWithoutRetry() async {
    for plan in [
      GitHubHTTPProbe.Plan.failure(.networkConnectionLost),
      .http(503, Data(#"{"error":{"code":"unavailable","message":"private"}}"#.utf8)),
      .http(200, Data(#"{"unexpected":true}"#.utf8)),
    ] {
      let probe = GitHubHTTPProbe(plans: [plan])
      do {
        _ = try await makeTransport(probe).remoteGitHubOperation(
          .ghClosePr(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 42))
        )
        XCTFail("Expected ambiguity")
      } catch let failure as GitHubOperationsFailure {
        XCTAssertEqual(failure, .ambiguousOutcome)
      } catch {
        XCTFail("Unexpected error type")
      }
      let requestCount = await probe.requestCount
      XCTAssertEqual(requestCount, 1)
    }
  }

  func testReadMalformedSuccessNeverRetries() async {
    let probe = GitHubHTTPProbe(plans: [.http(200, Data("{}".utf8))])
    do {
      _ = try await makeTransport(probe).remoteGitHubOperation(
        .ghCheckAvailable(
          .init(projectLocation: GitHubOperationsSamples.wsl, detail: .summary)
        )
      )
      XCTFail("Expected invalid response")
    } catch let failure as GitHubOperationsFailure {
      XCTAssertEqual(failure, .invalidResponse)
    } catch {
      XCTFail("Unexpected error type")
    }
    let requestCount = await probe.requestCount
    XCTAssertEqual(requestCount, 1)
  }

  func testAuthoritativeErrorIsSanitizedAndDoesNotExposeBody() async {
    let data = Data(
      #"{"error":{"code":"conflict","message":"Bearer private-secret"}}"#.utf8
    )
    let probe = GitHubHTTPProbe(plans: [.http(409, data)])
    do {
      _ = try await makeTransport(probe).remoteGitHubOperation(
        .ghClosePr(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 42))
      )
      XCTFail("Expected rejection")
    } catch let failure as GitHubOperationsFailure {
      XCTAssertEqual(failure, .rejected(statusCode: 409, code: "conflict"))
      XCTAssertFalse(String(describing: failure).contains("private-secret"))
    } catch {
      XCTFail("Unexpected error type")
    }
    let requestCount = await probe.requestCount
    XCTAssertEqual(requestCount, 1)
  }

  private func makeTransport(_ probe: GitHubHTTPProbe) -> GitHubOperationsHTTPTransport {
    GitHubOperationsHTTPTransport(
      endpoint: URL(string: "https://relay.test/prefix")!,
      accessToken: "test-token",
      loader: { request in try await probe.load(request) }
    )
  }
}

private actor GitHubHTTPProbe {
  enum Plan: Sendable {
    case http(Int, Data)
    case failure(URLError.Code)
  }

  private(set) var requests: [URLRequest] = []
  private var plans: [Plan]

  init(plans: [Plan]) {
    self.plans = plans
  }

  var requestCount: Int { requests.count }

  func load(_ request: URLRequest) throws -> (Data, URLResponse) {
    requests.append(request)
    guard !plans.isEmpty else { throw URLError(.badServerResponse) }
    switch plans.removeFirst() {
    case .http(let status, let data):
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: status,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
      )!
      return (data, response)
    case .failure(let code):
      throw URLError(code)
    }
  }
}
