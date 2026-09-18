import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import PortForwarding
#endif

final class PortForwardingContractTests: XCTestCase {
  func testExactlyFiveRoutesMatchGeneratedMetadata() throws {
    XCTAssertEqual(PortForwardingRoute.allCases.count, 5)
    XCTAssertEqual(
      Set(PortForwardingRoute.allCases.map(\.rawValue)),
      ["ports-read", "port-forward", "port-enter", "port-unforward", "forward-enter"])
    for route in PortForwardingRoute.allCases {
      XCTAssertEqual(try PortForwardingRemoteV3Contract.metadata(for: route), route.expected)
    }
  }

  func testDeterministicFixturesCrossEveryGeneratedJSONBoundary() throws {
    let snapshot = try PortForwardingRemoteV3Contract.portsResponse(
      PortForwardingTestValues.fixture("ports-read"))
    XCTAssertEqual(snapshot, PortForwardingTestValues.snapshot)

    let forward = try PortForwardingRemoteV3Contract.forwardResponse(
      PortForwardingTestValues.fixture("port-forward"))
    XCTAssertEqual(forward.id, PortForwardingTestValues.forwardID)
    XCTAssertEqual(forward.targetPort, 3000)

    let enter = try PortForwardingRemoteV3Contract.enterResponse(
      PortForwardingTestValues.fixture("port-enter"))
    XCTAssertTrue(enter.hasSuffix("fwt=\(PortForwardingTestValues.token)"))
    try PortForwardingRemoteV3Contract.unforwardResponse(
      PortForwardingTestValues.fixture("port-unforward"))
  }

  func testRequestsAreCanonicalAndGeneratedConstraintsRejectInvalidValues() throws {
    XCTAssertEqual(
      try object(PortForwardingRemoteV3Contract.forwardRequest(port: 5173))["targetPort"] as? Int,
      5173)
    XCTAssertEqual(
      try object(
        PortForwardingRemoteV3Contract.enterRequest(
          forwardID: PortForwardingTestValues.forwardID))["id"] as? String,
      PortForwardingTestValues.forwardID)
    XCTAssertThrowsError(try PortForwardingRemoteV3Contract.forwardRequest(port: 0))
    XCTAssertThrowsError(try PortForwardingRemoteV3Contract.forwardRequest(port: 65_536))
    XCTAssertThrowsError(try PortForwardingRemoteV3Contract.enterRequest(forwardID: ""))
  }

  func testGeneratedResponseBoundaryRejectsMissingAndOutOfRangeFields() {
    XCTAssertThrowsError(
      try PortForwardingRemoteV3Contract.portsResponse(Data(#"{"detected":[]}"#.utf8)))
    XCTAssertThrowsError(
      try PortForwardingRemoteV3Contract.forwardResponse(
        Data(#"{"forward":{"id":"x","targetPort":0,"listenPort":1,"createdAt":0}}"#.utf8)))
    XCTAssertThrowsError(
      try PortForwardingRemoteV3Contract.unforwardResponse(Data(#"{"ok":false}"#.utf8)))
  }

  func testGeneratedCodecIDsRemainTheExpectedStableRoots() {
    XCTAssertEqual(RemoteRootCodecs.routeU2EPortsU2DReadU2EResponse.id, "route.ports-read.response")
    XCTAssertEqual(
      RemoteRootCodecs.routeU2EPortU2DForwardU2ERequest.id, "route.port-forward.request")
    XCTAssertEqual(RemoteRootCodecs.routeU2EPortU2DEnterU2EResponse.id, "route.port-enter.response")
    XCTAssertEqual(
      RemoteRootCodecs.routeU2EPortU2DUnforwardU2EResponse.id,
      "route.port-unforward.response")
    XCTAssertEqual(RemoteRootCodecs.routeU2EForwardU2DEnterU2EQuery.id, "route.forward-enter.query")
  }

  private func object(_ data: Data) throws -> [String: Any] {
    try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
  }
}
