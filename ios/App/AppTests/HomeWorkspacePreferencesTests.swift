import XCTest
@testable import App

final class HomeWorkspacePreferencesTests: XCTestCase {
  func testOlderHostWithoutWorkspaceNamesKeepsItsProjectsVisible() throws {
    let snapshot = try JSONDecoder().decode(RemoteShellSnapshot.self, from: Data(#"{"snapshotSeq":1,"projects":[],"threads":[],"runtimeSummariesByThread":{},"updatedAt":"2026-11-14"}"#.utf8))
    XCTAssertNil(snapshot.workspaces)
    let connection = ClientConnectionID()
    let project = try project(id: "project", workspace: "unknown-host-id")
    var preferences = HomeWorkspacePreferences()
    preferences.importHosts([.init(connectionID: connection, workspaces: nil, projects: [project], homeThreadIDs: [])], activeID: "work")
    let key = project.identity(on: connection).id.rawValue
    XCTAssertTrue(preferences.includes(projectID: key, activeID: "work"))
    XCTAssertEqual(preferences.workspace(forProject: key), "work")
  }

  func testHostWorkspaceNamesJoinAcrossHostsWithoutProjectIDCollisions() throws {
    let a = ClientConnectionID(), b = ClientConnectionID(), c = ClientConnectionID()
    let project = try project(id: "same-id", workspace: "host-work")
    var preferences = HomeWorkspacePreferences()
    preferences.importHosts([
      .init(connectionID: a, workspaces: [.init(id: "host-work", name: "Work")], projects: [project], homeThreadIDs: []),
      .init(connectionID: b, workspaces: [.init(id: "host-work", name: " work ")], projects: [project], homeThreadIDs: []),
      .init(connectionID: c, workspaces: [.init(id: "host-work", name: "Side Hustle")], projects: [project], homeThreadIDs: []),
    ], activeID: "work")
    XCTAssertEqual(preferences.workspaces.count, 2)
    XCTAssertEqual(preferences.workspace(forProject: project.identity(on: a).id.rawValue), "work")
    XCTAssertEqual(preferences.workspace(forProject: project.identity(on: b).id.rawValue), "work")
    XCTAssertEqual(preferences.workspace(forProject: project.identity(on: c).id.rawValue), "side-hustle")
  }

  func testExplicitClientFilingSurvivesHostRefreshAndRestart() throws {
    let connection = ClientConnectionID(), project = try project(id: "p", workspace: "remote")
    let key = project.identity(on: connection).id.rawValue
    var preferences = HomeWorkspacePreferences()
    preferences.assignProject(key, to: "side-hustle")
    preferences = HomeWorkspacePreferences(stored: preferences.encoded)
    preferences.importHosts([.init(connectionID: connection, workspaces: [.init(id: "remote", name: "Work")], projects: [project], homeThreadIDs: [])], activeID: "work")
    XCTAssertEqual(preferences.workspace(forProject: key), "side-hustle")
    XCTAssertFalse(preferences.includes(projectID: key, activeID: "work"))
    preferences.assignProject(key, to: nil)
    preferences = HomeWorkspacePreferences(stored: preferences.encoded)
    preferences.importHosts([.init(connectionID: connection, workspaces: [.init(id: "remote", name: "Work")], projects: [project], homeThreadIDs: [])], activeID: "work")
    XCTAssertNil(preferences.workspace(forProject: key))
    XCTAssertTrue(preferences.includes(projectID: key, activeID: "work"))
    XCTAssertTrue(preferences.includes(projectID: key, activeID: "side-hustle"))
  }

  func testNewHostWorkspaceIsImportedByNameAndReused() throws {
    let connection = ClientConnectionID(), project = try project(id: "p", workspace: "r")
    var preferences = HomeWorkspacePreferences()
    let input = HomeWorkspaceHostInput(connectionID: connection, workspaces: [.init(id: "r", name: "Research")], projects: [project], homeThreadIDs: [])
    preferences.importHosts([input], activeID: "work")
    let research = try XCTUnwrap(preferences.workspaces.first { $0.name == "Research" })
    preferences.importHosts([input], activeID: "work")
    XCTAssertEqual(preferences.workspaces.count, 3)
    XCTAssertEqual(preferences.workspace(forProject: project.identity(on: connection).id.rawValue), research.id)
  }

  func testProjectPickerFilingUsesTheSameIdentityAsImportedCatalogsAndThreadFiltering() throws {
    let connection = ClientConnectionID(), otherConnection = ClientConnectionID()
    let project = try project(id: "project:with/slashes", workspace: "remote")
    let option = HomeProjectFilterOption(id: "\(connection.rawValue):\(project.id)", connectionID: connection,
      project: project, host: "Build Mac", online: true, threadCount: 0)
    var preferences = HomeWorkspacePreferences()
    let inputs = [connection, otherConnection].map {
      HomeWorkspaceHostInput(connectionID: $0, workspaces: [.init(id: "remote", name: "Work")], projects: [project], homeThreadIDs: [])
    }
    preferences.importHosts(inputs, activeID: "work")
    XCTAssertEqual(preferences.workspace(forProject: option.identity.id.rawValue), "work")
    preferences.assignProject(option.identity.id.rawValue, to: "side-hustle")
    preferences = HomeWorkspacePreferences(stored: preferences.encoded)
    preferences.importHosts(inputs, activeID: "work")
    XCTAssertFalse(HomeWorkspaceContext(preferences: preferences, activeID: "work").includes(option))
    XCTAssertTrue(HomeWorkspaceContext(preferences: preferences, activeID: "side-hustle").includes(option))
    XCTAssertFalse(HomeWorkspaceContext(preferences: preferences, activeID: "work").includes(projectID: project.id, connectionID: connection))
    XCTAssertTrue(HomeWorkspaceContext(preferences: preferences, activeID: "work").includes(projectID: project.id, connectionID: otherConnection))
  }

  func testHomeThreadFilingsAreHostScopedAndRemovedWorkspaceHasSafeFallback() throws {
    let a = ClientConnectionID(), b = ClientConnectionID()
    var preferences = HomeWorkspacePreferences()
    preferences.importHosts([a,b].map { .init(connectionID: $0, workspaces: nil, projects: [], homeThreadIDs: ["thread"]) }, activeID: "work")
    let aKey = CompositeRemoteID(connectionId: a, remoteId: "thread").rawValue
    let bKey = CompositeRemoteID(connectionId: b, remoteId: "thread").rawValue
    preferences.assignThread(aKey, to: "side-hustle")
    XCTAssertEqual(preferences.workspace(forThread: aKey), "side-hustle")
    XCTAssertEqual(preferences.workspace(forThread: bKey), "work")
    preferences.remove("side-hustle")
    XCTAssertEqual(preferences.workspace(forThread: aKey), "work")
    XCTAssertEqual(preferences.activeID(stored: "side-hustle"), "work")
    preferences.remove("work")
    XCTAssertEqual(preferences.workspaces.count, 1)
  }

  func testVersionOneWithoutFilingFieldsAndFutureDataArePreserved() {
    let old = #"{"version":1,"workspaces":[{"id":"old","name":"Existing","icon":"briefcase"}]}"#
    var restored = HomeWorkspacePreferences(stored: old)
    XCTAssertEqual(restored.activeID(stored: "deleted"), "old")
    XCTAssertTrue(restored.includes(projectID: "unfiled", activeID: "old"))
    restored.rename("old", to: "Renamed")
    XCTAssertEqual(HomeWorkspacePreferences(stored: restored.encoded).workspaces.first?.name, "Renamed")
    let future = #"{"version":99,"unknown":{"keep":true}}"#
    var newer = HomeWorkspacePreferences(stored: future)
    newer.rename("work", to: "No overwrite")
    newer.assignProject("p", to: "work")
    XCTAssertFalse(newer.canEdit)
    XCTAssertEqual(newer.encoded, future)
  }

  private func project(id: String, workspace: String) throws -> RemoteProject {
    let object: [String:Any] = ["id":id,"name":"Project","location":["kind":"posix","path":"/repo"],"workspaceId":workspace,"createdAt":"2026-11-14T00:00:00Z"]
    return try JSONDecoder().decode(RemoteProject.self, from: JSONSerialization.data(withJSONObject: object))
  }
}
