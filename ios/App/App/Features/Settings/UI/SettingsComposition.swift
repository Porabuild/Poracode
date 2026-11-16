import Foundation
import Observation

@MainActor
@Observable
final class SettingsComposition {
  private(set) var selection: SettingsHostSelection?
  private(set) var mutationNotice: SettingsMutationNotice?
  private(set) var mutationFailure: SettingsOperationFailure?
  private(set) var isMutating = false

  let hostInformation: SettingsHostInformationController
  let profile: SettingsProfileController
  let document: SettingsDocumentController

  init(gateway: any SettingsSessionGateway) {
    hostInformation = SettingsHostInformationController(gateway: gateway)
    profile = SettingsProfileController(gateway: gateway)
    document = SettingsDocumentController(gateway: gateway)
  }

  func activate(_ selection: SettingsHostSelection?) {
    guard self.selection != selection else { return }
    self.selection = selection
    mutationNotice = nil
    mutationFailure = nil
    isMutating = false
    let lease = selection?.lease
    hostInformation.activate(lease)
    profile.activate(lease)
    document.activate(lease)
  }

  func gate(_ capability: SettingsCapability) -> SettingsOperationFailure? {
    guard let selection else { return .offline }
    return selection.gate(capability)
  }

  func refresh(
    route: SettingsScreenRoute,
    query: SettingsProfileQuery,
    timeZone: TimeZone = .current,
    date: Date = Date()
  ) async {
    guard gate(route.requiredCapability) == nil, let lease = selection?.lease else { return }
    switch route {
    case .agents:
      await hostInformation.refresh(.agents)
      await refreshDocumentIfSafe(lease: lease)
    case .usage:
      await hostInformation.refresh(.usage)
      await refreshDocumentIfSafe(lease: lease)
    case .devices:
      await hostInformation.refresh(.devices)
    case .activity, .tokens, .profile:
      await profile.load(query.request(timeZone: timeZone, date: date))
    case .generation:
      await hostInformation.refresh(.agents)
      await refreshDocumentIfSafe(lease: lease)
    case .workspace:
      await refreshDocumentIfSafe(lease: lease)
    }
  }

  func writeSettings(_ patch: SettingsPatch) async {
    guard !patch.values.isEmpty, gate(.sessionOperate) == nil, let lease = selection?.lease else {
      return
    }
    beginMutation()
    await document.write(patch)
    guard selection?.lease == lease else { return endMutation() }
    if document.state == .failed(.ambiguousOutcome) {
      await document.load()
      guard selection?.lease == lease else { return endMutation() }
      mutationNotice = document.state == .loaded ? .ambiguousRefreshed : .ambiguousRefreshFailed
    } else if document.state == .loaded {
      mutationNotice = .saved
    } else if case .failed(let failure) = document.state {
      mutationFailure = failure
    }
    endMutation()
  }

  func discoverAgents(_ request: SettingsAgentDiscoveryRequest, lease: SettingsHostLease) async {
    guard selection?.lease == lease, gate(.sessionOperate) == nil else { return }
    await hostInformation.discoverAgents(request, lease: lease)
  }

  func refreshAgentSettings(_ request: SettingsAgentDiscoveryRequest, lease: SettingsHostLease) async {
    guard selection?.lease == lease, gate(.sessionRead) == nil else { return }
    if gate(.sessionOperate) == nil { await discoverAgents(request, lease: lease) }
    else { await hostInformation.refresh(.agents) }
    await refreshDocumentIfSafe(lease: lease)
  }

  private func refreshDocumentIfSafe(lease: SettingsHostLease) async {
    // isMutating spans both the write acknowledgement and its uncertain-outcome
    // reconciliation read, beyond the document controller's transport flag.
    guard selection?.lease == lease, !isMutating else { return }
    await document.loadIfNotWriting(lease: lease)
  }

  func setIdentity(
    _ draft: SettingsProfileIdentityDraft,
    query: SettingsProfileQuery,
    timeZone: TimeZone = .current,
    date: Date = Date()
  ) async {
    guard draft.isValid, gate(.sessionOperate) == nil, let lease = selection?.lease else {
      return
    }
    beginMutation()
    await profile.setIdentity(draft.value)
    guard selection?.lease == lease else { return endMutation() }
    if profile.state == .failed(.ambiguousOutcome) {
      await profile.load(query.request(timeZone: timeZone, date: date))
      guard selection?.lease == lease else { return endMutation() }
      mutationNotice = profile.state == .loaded ? .ambiguousRefreshed : .ambiguousRefreshFailed
    } else if profile.state == .loaded {
      mutationNotice = .saved
    } else if case .failed(let failure) = profile.state {
      mutationFailure = failure
    }
    endMutation()
  }

  func clearMutationFeedback() {
    mutationNotice = nil
    mutationFailure = nil
  }

  private func beginMutation() {
    isMutating = true
    mutationNotice = nil
    mutationFailure = nil
  }

  private func endMutation() {
    isMutating = false
  }
}
