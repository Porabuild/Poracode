import Foundation
import Observation

@MainActor
@Observable
final class RemoteIntegrationsComposition {
  private(set) var selection: RemoteIntegrationsHostSelection?
  private(set) var lifecycleGeneration: UInt64 = 0

  let update: RemoteIntegrationsUpdateController
  let schedules: RemoteIntegrationsSchedulesController
  let prWatch: RemoteIntegrationsPRWatchController

  init(gateway: any RemoteIntegrationsGateway) {
    update = RemoteIntegrationsUpdateController(gateway: gateway)
    schedules = RemoteIntegrationsSchedulesController(gateway: gateway)
    prWatch = RemoteIntegrationsPRWatchController(gateway: gateway)
  }

  func activate(_ selection: RemoteIntegrationsHostSelection?) {
    guard self.selection != selection else { return }
    self.selection = selection
    let lease = selection?.lease
    update.activate(lease)
    schedules.activate(lease)
    prWatch.activate(lease)
  }

  /// Invalidates all feature-owned work when its presentation is no longer active.
  /// A later activation starts from empty state and fresh exact-host reads.
  func deactivateTransientWork() {
    lifecycleGeneration &+= 1
    activate(nil)
  }

  func gate(_ capability: RemoteIntegrationsCapability) -> RemoteIntegrationsFailure? {
    guard let selection else { return .offline }
    return selection.access.gate(capability)
  }
}
