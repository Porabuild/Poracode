import Foundation
import Observation

private struct ProjectSyncPreferencesDocument: Codable, Equatable {
  static let currentVersion = 1

  var version: Int
  var excludedProjectIDs: [String: [String]]
}

/// Local project-mirroring choices for this iOS installation.
///
/// This is intentionally separate from the host registry: stopping sync is a
/// client-only preference and must never mutate the desktop's project record.
/// The stable container key carries a versioned document so future preference
/// changes can migrate without reviving projects the user excluded.
@MainActor
@Observable
final class ProjectSyncPreferences {
  static let shared = ProjectSyncPreferences()
  static let storageKey = "poracode.project-sync"
  static let documentVersion = ProjectSyncPreferencesDocument.currentVersion

  private let defaults: UserDefaults
  private var excludedProjectIDs: [String: Set<String>] = [:]
  private var preservesFutureDocument = false

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    load()
  }

  func isSynced(connectionID: ClientConnectionID, projectID: String) -> Bool {
    !(excludedProjectIDs[connectionID.rawValue]?.contains(projectID) ?? false)
  }

  func setSynced(_ synced: Bool, connectionID: ClientConnectionID, projectID: String) {
    guard !preservesFutureDocument else { return }
    var excluded = excludedProjectIDs[connectionID.rawValue] ?? []
    if synced {
      excluded.remove(projectID)
    } else {
      excluded.insert(projectID)
    }

    if excluded.isEmpty {
      excludedProjectIDs.removeValue(forKey: connectionID.rawValue)
    } else {
      excludedProjectIDs[connectionID.rawValue] = excluded
    }
    persist()
  }

  private func load() {
    guard let data = defaults.data(forKey: Self.storageKey) else { return }
    guard
      let document = try? JSONDecoder().decode(ProjectSyncPreferencesDocument.self, from: data)
    else {
      return
    }
    guard document.version == Self.documentVersion else {
      // Do not overwrite preferences written by a newer app version.
      preservesFutureDocument = document.version > Self.documentVersion
      return
    }
    excludedProjectIDs = document.excludedProjectIDs.mapValues(Set.init)
  }

  private func persist() {
    let document = ProjectSyncPreferencesDocument(
      version: Self.documentVersion,
      excludedProjectIDs: excludedProjectIDs.mapValues { $0.sorted() }
    )
    guard let data = try? JSONEncoder().encode(document) else { return }
    defaults.set(data, forKey: Self.storageKey)
  }
}
