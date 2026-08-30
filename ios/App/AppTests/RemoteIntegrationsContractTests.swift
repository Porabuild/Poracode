import XCTest

@testable import App

final class RemoteIntegrationsContractTests: XCTestCase {
  func testElevenRoutesMatchGeneratedMetadataExactly() {
    let routes = RemoteIntegrationsRemoteV3Contract.routes
    XCTAssertEqual(routes.count, 11)
    XCTAssertEqual(Set(routes.map(\.id)).count, 11)
    XCTAssertEqual(routes.filter { $0.scope == .projectsManage }.count, 3)
    XCTAssertEqual(routes.filter { $0.scope == .sessionRead }.count, 3)
    XCTAssertEqual(routes.filter { $0.scope == .sessionOperate }.count, 5)
    XCTAssertEqual(
      routes.first { $0.id == "host-update-install" }?.status,
      202
    )
  }

  func testFixturesDecodeThroughGeneratedCodecsAndDiscardDiagnostics() throws {
    let hostData = try RemoteIntegrationsFixtures.data(RemoteIntegrationsFixtures.hostUpdateError)
    let canonicalHost = try RemoteIntegrationsRemoteV3Contract.hostUpdateResponse(hostData)
    let host = try JSONDecoder().decode(
      RemoteIntegrationsHostUpdateState.self,
      from: canonicalHost
    )
    XCTAssertEqual(host.status, .failed)
    XCTAssertFalse(String(describing: host).contains(RemoteIntegrationsFixtures.secret))

    let schedulesData = try RemoteIntegrationsFixtures.data(
      RemoteIntegrationsFixtures.schedulesRead
    )
    let canonicalSchedules = try RemoteIntegrationsRemoteV3Contract.schedulesReadResponse(
      schedulesData
    )
    let schedules = try JSONDecoder().decode(
      RemoteIntegrationsSchedulesResponse.self,
      from: canonicalSchedules
    )
    XCTAssertEqual(schedules.schedules.count, 1)
    XCTAssertFalse(String(describing: schedules).contains(RemoteIntegrationsFixtures.secret))

    let runsData = try RemoteIntegrationsFixtures.data(RemoteIntegrationsFixtures.scheduleRuns)
    let canonicalRuns = try RemoteIntegrationsRemoteV3Contract.scheduleRunsResponse(runsData)
    let runs = try JSONDecoder().decode(
      RemoteIntegrationsScheduleRunsResponse.self,
      from: canonicalRuns
    )
    XCTAssertEqual(runs.runs.first?.status, .interrupted)
    XCTAssertEqual(runs.runs.first?.hasError, true)
    XCTAssertFalse(String(describing: runs).contains(RemoteIntegrationsFixtures.secret))
    XCTAssertEqual(
      try RemoteIntegrationsRemoteV3Contract.scheduleRunsQuery(
        id: RemoteIntegrationsFixtures.scheduleID
      ).first?.value,
      RemoteIntegrationsFixtures.scheduleID
    )

    let watchData = try RemoteIntegrationsFixtures.data(RemoteIntegrationsFixtures.prWatchRead)
    let canonicalWatch = try RemoteIntegrationsRemoteV3Contract.prWatchReadResponse(watchData)
    let watch = try JSONDecoder().decode(
      RemoteIntegrationsPRWatchResponse.self,
      from: canonicalWatch
    ).watch
    XCTAssertEqual(watch?.hasLastError, true)
    XCTAssertFalse(String(describing: watch).contains(RemoteIntegrationsFixtures.secret))
  }

  func testDraftsEnforceProducerLimitsAndSemanticWatchRule() throws {
    var schedule = RemoteIntegrationsScheduleDraft()
    schedule.name = String(repeating: "a", count: 120)
    schedule.prompt = "Do the work"
    schedule.model = "gpt-5"
    XCTAssertNoThrow(try schedule.value())
    schedule.name.append("b")
    XCTAssertThrowsError(try schedule.value())

    var watch = RemoteIntegrationsPRWatchDraft(projectId: "project")
    watch.prNumber = 42
    watch.headBranch = "feature"
    watch.agentKind = ""
    watch.model = ""
    XCTAssertThrowsError(try watch.value())
    watch.watchEnabled = false
    XCTAssertNoThrow(try watch.value())
    watch.prNumber = RemoteIntegrationsPRWatchDraft.maximumPRNumber + 1
    XCTAssertThrowsError(try watch.key())
  }
}
