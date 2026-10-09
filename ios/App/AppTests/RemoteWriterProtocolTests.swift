import XCTest
@testable import App

final class RemoteWriterProtocolTests: XCTestCase {
    override func tearDown() {
        CapturingURLProtocol.reset()
        super.tearDown()
    }

    func testDeclarationUsesCompiledVersionForAuthorizedNonGETRequests() {
        for method in ["POST", "DELETE", "PATCH", "PUT", "HEAD"] {
            var request = URLRequest(url: URL(string: "https://fixture.test/api/settings")!)
            request.httpMethod = method
            request.setValue("Bearer fixture-token", forHTTPHeaderField: "Authorization")
            request.setValue("12", forHTTPHeaderField: ProtocolConstants.protocolVersionHeader)
            request.declareCurrentRemoteWriterProtocol()
            XCTAssertEqual(
                request.value(forHTTPHeaderField: ProtocolConstants.protocolVersionHeader),
                String(ProtocolConstants.remoteProtocolVersion)
            )
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-token")
        }
    }

    func testGETDefaultGETAndUnauthenticatedPOSTDoNotAcquireADeclaration() {
        let methods: [String?] = ["GET", nil, "POST"]
        for method in methods {
            var request = URLRequest(url: URL(string: "https://fixture.test/api/snapshot")!)
            request.httpMethod = method
            if method != "POST" {
                request.setValue("Bearer fixture-token", forHTTPHeaderField: "Authorization")
            }
            request.declareCurrentRemoteWriterProtocol()
            XCTAssertNil(request.value(forHTTPHeaderField: ProtocolConstants.protocolVersionHeader))
        }
    }

    func testActualAPIProducerDeclaresWritesAndReadPOSTsButNotReadsOrAuthFreeRequests() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data("{}".utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CapturingURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let client = RemoteAPIClient(endpoint: "https://fixture.test", accessToken: "fixture-token", session: session)
        let requests = [
            ("/api/settings", "POST", true, true),
            ("/api/auth/websocket-ticket", "POST", true, true),
            ("/api/snapshot", "GET", true, false),
            ("/oauth/token", "POST", false, false),
        ]
        for (path, method, authorized, declared) in requests {
            _ = try await client.requestData(path: path, method: method, authorized: authorized)
            let request = try XCTUnwrap(CapturingURLProtocol.lastRequest)
            XCTAssertEqual(
                request.value(forHTTPHeaderField: ProtocolConstants.protocolVersionHeader),
                declared ? String(ProtocolConstants.remoteProtocolVersion) : nil
            )
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), authorized ? "Bearer fixture-token" : nil)
        }
    }
}
