import Foundation
import Observation

enum SavedCrewsFailure: Equatable {
  case settings(SettingsOperationFailure)
  case mutation(CrewMutationFailure)
}

/// Host-owned crews use the existing sparse Settings service. Every mutation
/// reads the current projection first, keeps unrelated entries/metadata, and
/// checks its returned state. An old host silently dropping the optional key
/// is not reported as a successful save.
@MainActor @Observable final class SavedCrewsController {
  private(set) var selection: SettingsHostSelection?
  private(set) var document: SettingsDocument?
  private(set) var state: SettingsLoadState = .idle
  private(set) var failure: SavedCrewsFailure?
  private(set) var isMutating = false
  private(set) var ambiguousResultRefreshed = false

  @ObservationIgnored private let gateway: any SettingsSessionGateway
  @ObservationIgnored private let now: @Sendable () -> Double
  private var ordinal: UInt64 = 0

  init(gateway: any SettingsSessionGateway, now: @escaping @Sendable () -> Double = {
    (Date().timeIntervalSince1970 * 1_000).rounded(.down)
  }) {
    self.gateway = gateway
    self.now = now
  }

  var crews: [SavedCrew] { document?.savedCrews ?? [] }
  var canWrite: Bool { selection?.gate(.sessionOperate) == nil && selection != nil && !isMutating }

  func activate(_ selection: SettingsHostSelection?) {
    guard self.selection?.lease != selection?.lease else {
      self.selection = selection
      return
    }
    ordinal &+= 1
    self.selection = selection
    document = nil; state = .idle; failure = nil
    isMutating = false; ambiguousResultRefreshed = false
  }

  func load() async {
    guard !isMutating, let selection, selection.gate(.sessionRead) == nil else { return }
    ordinal &+= 1
    let revision = ordinal
    state = .loading; failure = nil
    do {
      let response = try await gateway.readSettings(lease: selection.lease)
      try Task.checkCancellation()
      guard owns(selection.lease, revision) else { return }
      document = response.settings; state = .loaded
    } catch is CancellationError {
    } catch {
      guard owns(selection.lease, revision) else { return }
      let mapped = SettingsOperationFailure.map(error)
      state = .failed(mapped); failure = .settings(mapped)
    }
  }

  @discardableResult
  func apply(_ mutation: CrewMutation, lease owner: SettingsHostLease) async -> Bool {
    guard canWrite, selection?.lease == owner else { return false }
    ordinal &+= 1
    let revision = ordinal
    isMutating = true; failure = nil; ambiguousResultRefreshed = false
    defer { if owns(owner, revision) { isMutating = false } }
    do {
      let latest = try await gateway.readSettings(lease: owner).settings
      try Task.checkCancellation()
      guard owns(owner, revision) else { return false }
      document = latest
      let records = latest.crews ?? []
      let next = try mutation.applying(to: records, now: now())
      if records == next { state = .loaded; return mutation.isSatisfied(by: records) }
      let encoded = try JSONDecoding.encoder.encode(JSONValue.array(next))
      let value = try JSONDecoding.decode(SettingsJSON.self, from: encoded)
      var patch = SettingsPatch()
      patch[.crews] = value
      let response: SettingsReadResponse
      do {
        response = try await gateway.writeSettings(patch, lease: owner)
      } catch {
        guard SettingsOperationFailure.map(error) == .ambiguousOutcome else { throw error }
        // Read once; never replay an uncertain write.
        response = try await gateway.readSettings(lease: owner)
        guard owns(owner, revision) else { return false }
        ambiguousResultRefreshed = true
      }
      try Task.checkCancellation()
      guard owns(owner, revision) else { return false }
      document = response.settings; state = .loaded
      guard mutation.isSatisfied(by: response.settings.crews ?? []) else {
        failure = ambiguousResultRefreshed ? .settings(.ambiguousOutcome) : .mutation(.notApplied)
        return false
      }
      return true
    } catch is CancellationError {
      return false
    } catch let problem as CrewMutationFailure {
      guard owns(owner, revision) else { return false }
      failure = .mutation(problem)
      return false
    } catch {
      guard owns(owner, revision) else { return false }
      failure = .settings(.map(error))
      return false
    }
  }

  func clearFailure() { failure = nil; ambiguousResultRefreshed = false }

  private func owns(_ lease: SettingsHostLease, _ revision: UInt64) -> Bool {
    selection?.lease == lease && ordinal == revision
  }
}
