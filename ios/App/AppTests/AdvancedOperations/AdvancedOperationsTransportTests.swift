import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

final class AdvancedOperationsTransportTests: XCTestCase {
  func testLongTimeoutMetadataReachesExecutorAndCallOccursOnce() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.generateTitle)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let http = AdvancedOperationsHTTPSpy(
      .response(try AdvancedOperationFixtures.responseData(for: fixture))
    )
    let transport = AdvancedOperationsRemoteTransport(http: http)

    _ = try await transport.remoteCall(request)

    let callCount = await http.callCount()
    let timeout = await http.lastTimeout()
    XCTAssertEqual(callCount, 1)
    XCTAssertEqual(timeout, .long)
  }

  func testMutationTransportFailureIsAmbiguousWithoutRetry() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.writeExternalFile)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let http = AdvancedOperationsHTTPSpy(.failure(.transport))
    let transport = AdvancedOperationsRemoteTransport(http: http)

    do {
      _ = try await transport.remoteCall(request)
      XCTFail("Expected ambiguous delivery")
    } catch let error as AdvancedOperationsTransportError {
      XCTAssertEqual(error, .ambiguousDelivery)
    }
    let callCount = await http.callCount()
    XCTAssertEqual(callCount, 1)
  }

  func testReadTransportFailureIsNotClassifiedAsAmbiguous() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.readExternalFile)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let http = AdvancedOperationsHTTPSpy(.failure(.transport))
    let transport = AdvancedOperationsRemoteTransport(http: http)

    do {
      _ = try await transport.remoteCall(request)
      XCTFail("Expected transport failure")
    } catch let error as AdvancedOperationsTransportError {
      XCTAssertEqual(error, .transport)
    }
    let callCount = await http.callCount()
    XCTAssertEqual(callCount, 1)
  }

  func testMalformedDeliveredMutationResponseIsAmbiguous() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.generateCommitMessage)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let http = AdvancedOperationsHTTPSpy(
      .response(Data(#"{"result":{"message":42}}"#.utf8))
    )
    let transport = AdvancedOperationsRemoteTransport(http: http)

    do {
      _ = try await transport.remoteCall(request)
      XCTFail("Expected ambiguous delivery")
    } catch let error as AdvancedOperationsTransportError {
      XCTAssertEqual(error, .ambiguousDelivery)
    }
    let callCount = await http.callCount()
    XCTAssertEqual(callCount, 1)
  }

  func testMalformedReadResponseIsInvalidResponse() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.workflowGetRun)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let http = AdvancedOperationsHTTPSpy(.response(Data(#"{"result":{}}"#.utf8)))
    let transport = AdvancedOperationsRemoteTransport(http: http)

    do {
      _ = try await transport.remoteCall(request)
      XCTFail("Expected invalid response")
    } catch let error as AdvancedOperationsTransportError {
      XCTAssertEqual(error, .invalidResponse)
    }
  }

  func testCancellationPropagatesUnchanged() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.stageThreadInput)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let http = AdvancedOperationsHTTPSpy(.cancelled)
    let transport = AdvancedOperationsRemoteTransport(http: http)

    do {
      _ = try await transport.remoteCall(request)
      XCTFail("Expected cancellation")
    } catch is CancellationError {
      let callCount = await http.callCount()
      XCTAssertEqual(callCount, 1)
    }
  }

  func testRejectedResponsePreservesOnlyStructuredStatusAndCode() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.createProjectEntry)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let http = AdvancedOperationsHTTPSpy(
      .failure(.rejected(statusCode: 409, code: "conflict"))
    )
    let transport = AdvancedOperationsRemoteTransport(http: http)

    do {
      _ = try await transport.remoteCall(request)
      XCTFail("Expected rejection")
    } catch let error as AdvancedOperationsTransportError {
      XCTAssertEqual(error, .rejected(statusCode: 409, code: "conflict"))
    }
  }
}
