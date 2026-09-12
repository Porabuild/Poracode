import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import PortForwarding
#endif

final class PortForwardingEntryURLTests: XCTestCase {
  func testRelayBasePathIsPreservedAndEndpointQueryIsRemoved() throws {
    let url = try PortForwardingEntryURL.build(
      endpoint: "https://relay.example/s/server-1?old=query#fragment",
      enterPath:
        "/forward/\(PortForwardingTestValues.forwardID)/enter?fwt=\(PortForwardingTestValues.token)",
      expectedForwardID: PortForwardingTestValues.forwardID)
    XCTAssertEqual(
      url.absoluteString,
      "https://relay.example/s/server-1/forward/\(PortForwardingTestValues.forwardID)/enter?fwt=\(PortForwardingTestValues.token)"
    )
  }

  func testDirectEndpointUsesRootWithoutDoubleSlash() throws {
    let url = try PortForwardingEntryURL.build(
      endpoint: "http://192.0.2.10:8787/",
      enterPath:
        "/forward/\(PortForwardingTestValues.forwardID)/enter?fwt=\(PortForwardingTestValues.token)",
      expectedForwardID: PortForwardingTestValues.forwardID)
    XCTAssertEqual(url.path, "/forward/\(PortForwardingTestValues.forwardID)/enter")
  }

  func testRejectsCrossOriginWrongForwardExtraQueryAndMalformedToken() {
    let valid = "/forward/\(PortForwardingTestValues.forwardID)/enter"
    let malicious = [
      "https://evil.example\(valid)?fwt=\(PortForwardingTestValues.token)",
      "//evil.example\(valid)?fwt=\(PortForwardingTestValues.token)",
      "/forward/33333333-3333-4333-8333-333333333333/enter?fwt=\(PortForwardingTestValues.token)",
      "\(valid)?fwt=short",
      "\(valid)?fwt=\(PortForwardingTestValues.token)&next=https://evil.example",
      "/forward/%2Fetc/enter?fwt=\(PortForwardingTestValues.token)",
      "\(valid)?fwt=\(PortForwardingTestValues.token)#secret",
    ]
    for path in malicious {
      XCTAssertThrowsError(
        try PortForwardingEntryURL.build(
          endpoint: "https://relay.example/s/host", enterPath: path,
          expectedForwardID: PortForwardingTestValues.forwardID),
        path)
    }
  }
}
