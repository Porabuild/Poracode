import Foundation

enum SettingsLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case failed(SettingsOperationFailure)
}

struct SettingsProfileInformation: Equatable, Sendable {
  let request: SettingsProfileStatsRequest
  let devices: SettingsProfileDevices
  let core: SettingsProfileCoreStats
  let tokens: SettingsProfileTokenStats
}
