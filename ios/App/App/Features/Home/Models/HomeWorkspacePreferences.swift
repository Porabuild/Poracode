import Foundation
import SwiftUI

/// Client-owned groupings, matching the browser/PWA workspace model. Host
/// workspace ids never become local ids: names join equivalent groups across
/// hosts, while explicit local project filings take precedence.
struct HomeWorkspace: Codable, Equatable, Identifiable {
  let id: String
  var name: String
  var icon: String

  var systemImage: String {
    switch icon {
    case "rocket": "paperplane"
    case "palette": "paintpalette"
    case "code": "curlybraces"
    case "building": "building.2"
    case "graduation": "graduationcap"
    case "heart": "heart"
    case "sprout": "leaf"
    case "globe": "globe"
    case "lightbulb": "lightbulb"
    case "music": "music.note"
    case "gamepad": "gamecontroller"
    default: "briefcase"
    }
  }
}

struct HomeWorkspaceHostInput: Equatable {
  let connectionID: ClientConnectionID
  let workspaces: [RemoteHostWorkspace]?
  let projects: [RemoteProject]
  let homeThreadIDs: [String]
}

struct HomeWorkspacePreferences: Equatable {
  // New device-local boundary. No host settings, pairing or catalog bytes are
  // changed. Missing data preserves all projects; future versions remain intact.
  static let storageKey = "ios.workspaces.v1"
  static let selectionKey = "ios.workspaces.active.v1"
  private(set) var workspaces: [HomeWorkspace] = [
    .init(id: "work", name: "Work", icon: "briefcase"),
    .init(id: "side-hustle", name: "Side Hustle", icon: "rocket"),
  ] // Names are shared contract seed data, just as in the PWA.
  private var projectWorkspaceIDs: [String: String] = [:]
  private var explicitProjectIDs: Set<String> = []
  private var threadWorkspaceIDs: [String: String] = [:]
  // Additive v1 field. A pre-link profile still imports by name on first
  // refresh, then keeps the exact relationship even if either name changes.
  private var importedWorkspaceIDs: [String: String] = [:]
  private var futureData: String?
  var canEdit: Bool { futureData == nil }

  init(stored: String = "") {
    guard let data = stored.data(using: .utf8), !data.isEmpty else { return }
    if let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let version = raw["version"] as? Int, version > 1 {
      futureData = stored
      return
    }
    guard let payload = try? JSONDecoder().decode(Payload.self, from: data), payload.version == 1 else { return }
    var seen = Set<String>()
    let valid = payload.workspaces.filter { !$0.id.isEmpty && !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && seen.insert($0.id).inserted }
    if !valid.isEmpty { workspaces = valid }
    projectWorkspaceIDs = payload.projectWorkspaceIDs ?? [:]
    explicitProjectIDs = Set(payload.explicitProjectIDs ?? [])
    threadWorkspaceIDs = payload.threadWorkspaceIDs ?? [:]
    importedWorkspaceIDs = payload.importedWorkspaceIDs ?? [:]
  }

  var encoded: String {
    if let futureData { return futureData }
    let payload = Payload(version: 1, workspaces: workspaces,
      projectWorkspaceIDs: projectWorkspaceIDs, explicitProjectIDs: explicitProjectIDs.sorted(),
      threadWorkspaceIDs: threadWorkspaceIDs, importedWorkspaceIDs: importedWorkspaceIDs)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return (try? encoder.encode(payload)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
  }

  func activeID(stored: String) -> String? {
    workspaces.first { $0.id == stored }?.id ?? workspaces.first?.id
  }

  func workspace(forProject id: String) -> String? { validAssignment(projectWorkspaceIDs[id]) }
  func workspace(forThread id: String) -> String? { validAssignment(threadWorkspaceIDs[id]) }

  func includes(projectID: String, activeID: String?) -> Bool {
    guard let assigned = workspace(forProject: projectID) else { return true }
    return assigned == activeID
  }

  func includes(_ item: UnifiedThreadListItem, activeID: String?) -> Bool {
    if item.project.id == RemoteProject.homeScopeID {
      guard let assigned = workspace(forThread: item.id) else { return true }
      return assigned == activeID
    }
    return includes(projectID: item.project.identity(on: item.connectionID).id.rawValue, activeID: activeID)
  }

  mutating func importHosts(_ hosts: [HomeWorkspaceHostInput], activeID: String?) {
    guard canEdit else { return }
    for host in hosts {
      var localIDs: [String: String] = [:]
      for workspace in host.workspaces ?? [] {
        let key = CompositeRemoteID(connectionId: host.connectionID, remoteId: workspace.id).rawValue
        let localID = validAssignment(importedWorkspaceIDs[key]) ?? findOrCreate(name: workspace.name)
        importedWorkspaceIDs[key] = localID
        localIDs[workspace.id] = localID
      }
      for project in host.projects where project.id != RemoteProject.homeScopeID {
        let key = project.identity(on: host.connectionID).id.rawValue
        guard !explicitProjectIDs.contains(key) else { continue }
        if let hostWorkspace = project.workspaceId, let localID = localIDs[hostWorkspace] {
          projectWorkspaceIDs[key] = localID
        } else if projectWorkspaceIDs[key] == nil {
          projectWorkspaceIDs[key] = activeID ?? workspaces.first?.id
        }
      }
      for threadID in host.homeThreadIDs {
        let key = CompositeRemoteID(connectionId: host.connectionID, remoteId: threadID).rawValue
        if threadWorkspaceIDs[key] == nil { threadWorkspaceIDs[key] = activeID ?? workspaces.first?.id }
      }
    }
  }

  @discardableResult mutating func add(name: String) -> String? {
    guard canEdit else { return nil }
    return findOrCreate(name: name)
  }

  mutating func rename(_ id: String, to name: String) {
    guard canEdit, let index = workspaces.firstIndex(where: { $0.id == id }),
      let name = normalized(name), !workspaces.contains(where: { $0.id != id && nameKey($0.name) == nameKey(name) }) else { return }
    workspaces[index].name = name
  }

  mutating func remove(_ id: String) {
    guard canEdit, workspaces.count > 1, workspaces.contains(where: { $0.id == id }) else { return }
    workspaces.removeAll { $0.id == id }
    let replacement = workspaces[0].id
    projectWorkspaceIDs = projectWorkspaceIDs.mapValues { $0 == id ? replacement : $0 }
    threadWorkspaceIDs = threadWorkspaceIDs.mapValues { $0 == id ? replacement : $0 }
    importedWorkspaceIDs = importedWorkspaceIDs.mapValues { $0 == id ? replacement : $0 }
  }

  mutating func assignProject(_ id: String, to workspaceID: String?) {
    guard canEdit, workspaceID == nil || workspaces.contains(where: { $0.id == workspaceID }) else { return }
    projectWorkspaceIDs[id] = workspaceID ?? ""
    explicitProjectIDs.insert(id)
  }

  mutating func assignThread(_ id: String, to workspaceID: String?) {
    guard canEdit, workspaceID == nil || workspaces.contains(where: { $0.id == workspaceID }) else { return }
    threadWorkspaceIDs[id] = workspaceID ?? ""
  }

  private func validAssignment(_ id: String?) -> String? {
    guard let id, workspaces.contains(where: { $0.id == id }) else { return nil }
    return id
  }
  private func normalized(_ name: String) -> String? {
    let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
  private func nameKey(_ name: String) -> String { name.trimmingCharacters(in: .whitespacesAndNewlines).localizedLowercase }
  private mutating func findOrCreate(name: String) -> String? {
    guard let name = normalized(name) else { return nil }
    if let existing = workspaces.first(where: { nameKey($0.name) == nameKey(name) }) { return existing.id }
    let id = UUID().uuidString.lowercased()
    workspaces.append(.init(id: id, name: name, icon: workspaces.count.isMultiple(of: 2) ? "code" : "globe"))
    return id
  }

  private struct Payload: Codable {
    let version: Int
    let workspaces: [HomeWorkspace]
    let projectWorkspaceIDs: [String: String]?
    let explicitProjectIDs: [String]?
    let threadWorkspaceIDs: [String: String]?
    let importedWorkspaceIDs: [String: String]?
  }
}

struct HomeWorkspaceContext: Equatable {
  var preferences = HomeWorkspacePreferences()
  var activeID: String? = nil
  func includes(projectID: String?, connectionID: ClientConnectionID?) -> Bool {
    guard activeID != nil, let projectID, projectID != RemoteProject.homeScopeID, let connectionID else { return true }
    return preferences.includes(projectID: CompositeRemoteID(connectionId: connectionID, remoteId: projectID).rawValue, activeID: activeID)
  }
  func includes(_ option: HomeProjectFilterOption) -> Bool {
    includes(projectID: option.project.id, connectionID: option.connectionID)
  }
}

extension EnvironmentValues {
  @Entry var homeWorkspace = HomeWorkspaceContext()
  @Entry var homeWorkspaceSelection: Binding<String>? = nil
}
