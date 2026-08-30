import XCTest

@testable import App

@MainActor
final class ProjectControllerDataControllerTests: XCTestCase {
  func testDeactivateInvalidatesSettingsResponseEvenAfterSameLeaseReactivates() async {
    let gateway = ProjectControllerGatewayFake()
    let barrier = ProjectControllerTestBarrier()
    let identity = ProjectIdentity(
      connectionId: ProjectControllerTestValues.hostA,
      projectId: "project"
    )
    await gateway.enqueueSettings(.value(settings(serverID: "stale")))
    await gateway.setSettingsBarriers([barrier])
    let controller = ProjectControllerSettingsController(gateway: gateway)
    let session = ProjectControllerTestValues.session(ProjectControllerTestValues.hostA)
    controller.activate(session)

    let operation = Task { await controller.load(identity) }
    await barrier.waitUntilReached()
    controller.deactivate()
    controller.activate(session)
    await barrier.release()
    await operation.value

    XCTAssertNil(controller.cachedSettings(for: identity))
  }

  func testSettingsCacheUsesHostAndProjectIdentityAndInvalidatesCurrentHostOnly() async {
    let gateway = ProjectControllerGatewayFake()
    let controller = ProjectControllerSettingsController(gateway: gateway)
    let identityA = ProjectIdentity(
      connectionId: ProjectControllerTestValues.hostA,
      projectId: "same-project"
    )
    let identityB = ProjectIdentity(
      connectionId: ProjectControllerTestValues.hostB,
      projectId: "same-project"
    )
    await gateway.enqueueSettings(.value(settings(serverID: "server-a")))
    await gateway.enqueueSettings(.value(settings(serverID: "server-b")))

    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))
    await controller.load(identityA)
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostB))
    await controller.load(identityB)

    XCTAssertEqual(controller.cachedSettings(for: identityA)?.mcpServers?.first?.id, "server-a")
    XCTAssertEqual(controller.cachedSettings(for: identityB)?.mcpServers?.first?.id, "server-b")

    controller.projectsDidChange(
      for: ProjectControllerTestValues.lease(
        ProjectControllerTestValues.hostA))
    XCTAssertNotNil(controller.cachedSettings(for: identityA))
    XCTAssertNotNil(controller.cachedSettings(for: identityB))

    controller.projectsDidChange(
      for: ProjectControllerTestValues.lease(
        ProjectControllerTestValues.hostB))
    XCTAssertNotNil(controller.cachedSettings(for: identityA))
    XCTAssertNil(controller.cachedSettings(for: identityB))
  }

  func testStaleSettingsResponseCannotPopulateAnotherHost() async {
    let gateway = ProjectControllerGatewayFake()
    let barrier = ProjectControllerTestBarrier()
    let identityA = ProjectIdentity(
      connectionId: ProjectControllerTestValues.hostA,
      projectId: "project"
    )
    await gateway.enqueueSettings(.value(settings(serverID: "stale")))
    await gateway.setSettingsBarriers([barrier])
    let controller = ProjectControllerSettingsController(gateway: gateway)
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))

    let operation = Task { await controller.load(identityA) }
    await barrier.waitUntilReached()
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostB))
    // Returning to an identical host lease must not revive the older activation.
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))
    await barrier.release()
    await operation.value

    XCTAssertNil(controller.cachedSettings(for: identityA))
  }

  func testDirectoryPreservesDriveSentinelUnicodeAndReceivedOrder() async {
    let gateway = ProjectControllerGatewayFake()
    let result = BrowseHostDirectoryResult(
      path: BrowseHostDirectoryResult.driveListPath,
      parentPath: nil,
      homePath: "C:\\Users\\Åsa",
      entries: [
        .init(name: "資料", path: "D:\\資料", type: .directory),
        .init(name: "Ångström", path: "C:\\Ångström", type: .directory),
        .init(name: "z.txt", path: "C:\\z.txt", type: .file),
      ],
      truncated: false
    )
    await gateway.enqueueBrowse(.value(result))
    let controller = ProjectControllerDirectoryController(gateway: gateway)
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))

    await controller.navigate(to: BrowseHostDirectoryResult.driveListPath)

    XCTAssertEqual(controller.state.listing, result)
    XCTAssertTrue(controller.state.listing?.isDriveList == true)
    XCTAssertEqual(controller.state.listing?.entries.map(\.name), ["資料", "Ångström", "z.txt"])
  }

  func testDirectoryDeactivateClearsPreviousHostListingAndLease() async {
    let gateway = ProjectControllerGatewayFake()
    let result = BrowseHostDirectoryResult(
      path: "/old",
      parentPath: "/",
      homePath: "/home/user",
      entries: [],
      truncated: false
    )
    await gateway.enqueueBrowse(.value(result))
    let controller = ProjectControllerDirectoryController(gateway: gateway)
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))
    await controller.navigate(to: result.path)

    controller.deactivate()

    XCTAssertNil(controller.state.lease)
    XCTAssertNil(controller.state.listing)
    XCTAssertEqual(controller.state.requestedPath, "")
  }

  func testDirectoryClearsPreviousListingImmediatelyAndKeepsItClearOnFailure() async {
    let gateway = ProjectControllerGatewayFake()
    let prior = BrowseHostDirectoryResult(
      path: "/prior",
      parentPath: "/",
      homePath: "/home/user",
      entries: [.init(name: "old", path: "/prior/old", type: .directory)],
      truncated: false
    )
    await gateway.enqueueBrowse(.value(prior))
    let barrier = ProjectControllerTestBarrier()
    await gateway.enqueueBrowse(.failure(.transport("unavailable")))
    await gateway.setBrowseBarriers([ProjectControllerTestBarrier(), barrier])
    // The first barrier is pre-released so only the second navigation pauses.
    let barriers = await gateway.browseBarriers
    await barriers[0].release()
    let controller = ProjectControllerDirectoryController(gateway: gateway)
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))
    await controller.navigate(to: "/prior")
    XCTAssertEqual(controller.state.listing, prior)

    let operation = Task { await controller.navigate(to: "/next") }
    await barrier.waitUntilReached()
    XCTAssertNil(controller.state.listing)
    XCTAssertEqual(controller.state.requestedPath, "/next")
    await barrier.release()
    await operation.value

    XCTAssertNil(controller.state.listing)
    XCTAssertEqual(controller.state.failure, .transport("unavailable"))
  }

  private func settings(serverID: String) -> ProjectSettings {
    ProjectSettings(
      mcpServers: [
        ProjectMCPServer(
          id: serverID,
          name: serverID,
          transport: .stdio(command: "tool", args: [], env: .init(), cwd: nil)
        )
      ]
    )
  }
}
