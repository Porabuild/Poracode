import Foundation
import Observation

@MainActor
@Observable
final class SettingsIntegrationsSkillsController {
  private(set) var access: SettingsIntegrationsAccess?
  private(set) var scanState: SettingsIntegrationsLoadState = .idle
  private(set) var skills: [SettingsSkillEntry] = []
  private(set) var marketplaceState: SettingsIntegrationsLoadState = .idle
  private(set) var marketplace: SettingsSkillMarketplaceResult?
  private(set) var notice: SettingsIntegrationsMutationNotice?
  private(set) var mutationFailure: SettingsIntegrationsFailure?
  private(set) var isMutating = false

  @ObservationIgnored private let gateway: any SettingsIntegrationsGateway
  @ObservationIgnored private var ordinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?

  init(gateway: any SettingsIntegrationsGateway) { self.gateway = gateway }

  func activate(_ access: SettingsIntegrationsAccess?) {
    guard self.access != access else { return }
    replaceTask()
    self.access = access
    scanState = .idle
    marketplaceState = .idle
    skills = []
    marketplace = nil
    clearFeedback()
  }

  func cancelTransientWork() {
    replaceTask()
  }

  func loadSkills(agentKind: String? = nil) async {
    guard let access else { return }
    replaceTask()
    let captured = ordinal
    scanState = .loading
    let request = scanRequest(access: access, agentKind: agentKind)
    let gateway = self.gateway
    let pending = Task {
      do {
        let result = try await gateway.scanSkills(request, context: access.context)
        try Task.checkCancellation()
        guard self.owns(captured, access) else { return }
        self.skills = result.skills
        self.scanState = .loaded
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, access) else { return }
        self.scanState = .failed(SettingsIntegrationsFailure.map(error))
      }
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func searchMarketplace(
    marketplace: SettingsSkillMarketplaceID,
    query: String,
    sort: SettingsSkillMarketplaceSort
  ) async {
    guard let access else { return }
    replaceTask()
    let captured = ordinal
    marketplaceState = .loading
    let cleanQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let request = SettingsSkillMarketplaceRequest(
      marketplace: marketplace,
      query: cleanQuery.isEmpty ? nil : String(cleanQuery.prefix(200)),
      sort: sort
    )
    let gateway = self.gateway
    let pending = Task {
      do {
        let result = try await gateway.listMarketplace(request, context: access.context)
        try Task.checkCancellation()
        guard self.owns(captured, access) else { return }
        self.marketplace = result
        self.marketplaceState = .loaded
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, access) else { return }
        self.marketplaceState = .failed(SettingsIntegrationsFailure.map(error))
      }
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func setEnabled(_ enabled: Bool, for skill: SettingsSkillEntry) async {
    guard let access else { return }
    let location = skill.scope == .project ? access.context.projectLocation : nil
    let request = SettingsSetSkillEnabledRequest(
      absolutePath: skill.absolutePath,
      enabled: enabled,
      projectLocation: location,
      wslDistro: access.context.projectLocation?.distro
    )
    await mutate(access: access) { gateway in
      try await gateway.setSkillEnabled(request, context: access.context)
    }
  }

  func delete(_ skill: SettingsSkillEntry) async {
    guard let access else { return }
    let location = skill.scope == .project ? access.context.projectLocation : nil
    let request = SettingsDeleteSkillRequest(
      absolutePath: skill.absolutePath,
      projectLocation: location,
      wslDistro: access.context.projectLocation?.distro
    )
    await mutate(access: access) { gateway in
      try await gateway.deleteSkill(request, context: access.context)
    }
  }

  func importSkill(
    _ skill: SettingsSkillEntry,
    destination: SettingsSkillScope,
    mode: SettingsSkillImportMode
  ) async {
    guard let access else { return }
    let destinationLocation = destination == .project ? access.context.projectLocation : nil
    guard destination != .project || destinationLocation != nil else {
      mutationFailure = .unavailable
      return
    }
    let request = SettingsImportSkillsRequest(skills: [
      SettingsImportSkill(
        sourcePath: skill.sourcePath ?? skill.absolutePath,
        sourceProjectLocation: skill.scope == .project ? access.context.projectLocation : nil,
        sourceWslDistro: access.context.projectLocation?.distro,
        destinationScope: destination,
        availability: .poracode,
        mode: mode,
        replace: false,
        projectLocation: destinationLocation,
        wslDistro: access.context.projectLocation?.distro
      )
    ])
    await mutate(access: access) { gateway in
      _ = try await gateway.importSkills(request, context: access.context)
    }
  }

  func install(
    _ skill: SettingsMarketplaceSkill,
    destination: SettingsSkillScope
  ) async {
    guard let access else { return }
    let location = destination == .project ? access.context.projectLocation : nil
    guard destination != .project || location != nil else {
      mutationFailure = .unavailable
      return
    }
    let request = SettingsInstallMarketplaceSkillRequest(
      marketplace: skill.marketplace,
      marketplaceSkillID: skill.id,
      destinationScope: destination,
      availability: .poracode,
      replace: false,
      projectLocation: location,
      wslDistro: access.context.projectLocation?.distro
    )
    await mutate(access: access) { gateway in
      _ = try await gateway.installMarketplaceSkill(request, context: access.context)
    }
  }

  func clearFeedback() {
    notice = nil
    mutationFailure = nil
  }

  private func mutate(
    access: SettingsIntegrationsAccess,
    operation: @escaping @Sendable (any SettingsIntegrationsGateway) async throws -> Void
  ) async {
    replaceTask()
    let captured = ordinal
    isMutating = true
    clearFeedback()
    let gateway = self.gateway
    let pending = Task {
      do {
        try await operation(gateway)
        try Task.checkCancellation()
        guard self.owns(captured, access) else { return }
        try await self.reconcileOnce(captured: captured, access: access)
        guard self.owns(captured, access) else { return }
        self.notice = .saved
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, access) else { return }
        let failure = SettingsIntegrationsFailure.map(error)
        if failure == .ambiguousOutcome {
          await self.reconcileAmbiguous(captured: captured, access: access)
        } else {
          self.mutationFailure = failure
        }
      }
      guard self.owns(captured, access) else { return }
      self.isMutating = false
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  private func reconcileAmbiguous(
    captured: UInt64, access: SettingsIntegrationsAccess
  ) async {
    do {
      try await reconcileOnce(captured: captured, access: access)
      guard owns(captured, access) else { return }
      notice = .ambiguousReconciled
    } catch is CancellationError {
    } catch {
      guard owns(captured, access) else { return }
      notice = .ambiguousUnresolved
    }
  }

  private func reconcileOnce(
    captured: UInt64, access: SettingsIntegrationsAccess
  ) async throws {
    let result = try await gateway.scanSkills(
      scanRequest(access: access, agentKind: nil), context: access.context
    )
    try Task.checkCancellation()
    guard owns(captured, access) else { throw CancellationError() }
    skills = result.skills
    scanState = .loaded
  }

  private func scanRequest(
    access: SettingsIntegrationsAccess, agentKind: String?
  ) -> SettingsSkillScanRequest {
    .init(
      projectLocation: access.context.projectLocation,
      wslDistro: access.context.projectLocation?.distro,
      agentKind: agentKind,
      presentationMode: "gui"
    )
  }

  private func owns(_ captured: UInt64, _ access: SettingsIntegrationsAccess) -> Bool {
    ordinal == captured && self.access == access
  }

  private func finish(_ captured: UInt64) {
    if ordinal == captured { task = nil }
  }

  private func replaceTask() {
    ordinal &+= 1
    task?.cancel()
    task = nil
    isMutating = false
  }
}
