import XCTest

@testable import App

final class ActivityKitRoutingTests: XCTestCase {
  private let connection = "11111111-1111-4111-8111-111111111111"

  func testOldAttributesDecodeWithoutRouting() throws {
    let data = Data(#"{"desktopId":"desk","desktopName":"Desktop"}"#.utf8)
    let attributes = try JSONDecoder().decode(DesktopSessionAttributes.self, from: data)
    XCTAssertNil(attributes.routing)
  }

  func testRoutedAttributesDecodeAndResolveHost() throws {
    let data = Data(
      #"{"desktopId":"desk","desktopName":"Desktop","routing":{"version":1,"clientConnectionId":"11111111-1111-4111-8111-111111111111","desktopId":"desk"}}"#
        .utf8)
    let attributes = try JSONDecoder().decode(DesktopSessionAttributes.self, from: data)
    let route = LiveActivityRouting.route(for: attributes)
    XCTAssertEqual(route?.clientConnectionId.rawValue, connection)
    XCTAssertEqual(route?.desktopId, "desk")
  }

  func testLiveActivityRoutingRejectsOldFutureUppercaseAndDesktopMismatch() {
    XCTAssertNil(
      LiveActivityRouting.route(for: DesktopSessionAttributes(desktopId: "desk", desktopName: "D")))
    XCTAssertNil(
      LiveActivityRouting.route(
        for: attributes(version: 2, connection: connection, desktop: "desk")))
    XCTAssertNil(
      LiveActivityRouting.route(
        for: attributes(
          version: 1,
          connection: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".uppercased(),
          desktop: "desk"
        )))
    let mismatch = DesktopSessionAttributes(
      desktopId: "actual",
      desktopName: "D",
      routing: .init(version: 1, clientConnectionId: connection, desktopId: "other")
    )
    XCTAssertNil(LiveActivityRouting.route(for: mismatch))
  }

  private func attributes(version: Int, connection: String, desktop: String)
    -> DesktopSessionAttributes
  {
    DesktopSessionAttributes(
      desktopId: desktop,
      desktopName: "Desktop",
      routing: .init(version: version, clientConnectionId: connection, desktopId: desktop)
    )
  }
}
