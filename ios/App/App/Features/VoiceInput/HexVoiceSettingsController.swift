import Foundation
import Observation

@MainActor @Observable final class HexVoiceSettingsController {
  private(set) var setup: [String: JSONValue]?
  private(set) var models: [[String: JSONValue]] = []
  private(set) var busy = false
  private(set) var failure: VoiceInputFailure?
  private let gateway: any VoiceHexCalling
  private var revision: UInt64 = 0

  init(gateway: any VoiceHexCalling) { self.gateway = gateway }
  var engine: [String: JSONValue] { setup?["engine"]?.objectValue ?? [:] }
  var preparation: [String: JSONValue]? { setup?["preparation"]?.objectValue }
  var isInstalling: Bool { engine["state"]?.stringValue == "installing" }
  var isPreparing: Bool { preparation?["phase"]?.stringValue == "preparing" }

  func refresh(language: String) async {
    let epoch = revision
    do {
      let state = try await gateway.call(.object(["action": .string("setup")]))
      let catalog = try await gateway.call(.object(["action": .string("list"), "language": .string(language)]))
      guard epoch == revision, !Task.isCancelled else { return }
      failure = nil
      try install(state)
      guard catalog.objectValue?["kind"]?.stringValue == "catalog",
        let values = catalog.objectValue?["models"]?.arrayValue else { throw VoiceInputFailure.incompatible }
      models = values.compactMap(\.objectValue)
    } catch { if epoch == revision { failure = error as? VoiceInputFailure ?? .hostUnavailable } }
  }

  func perform(_ action: String, model: String, language: String) async {
    guard !busy || action == "cancel_install" || action == "cancel" else { return }
    revision &+= 1
    let epoch = revision
    busy = true; failure = nil
    defer { if epoch == revision { busy = false } }
    var request: [String: JSONValue] = ["action": .string(action)]
    if action == "prepare" {
      request["id"] = .string(UUID().uuidString.lowercased())
      request["model"] = .string(model); request["language"] = .string(language)
    } else if action == "cancel", let id = preparation?["id"]?.stringValue { request["id"] = .string(id) }
    do {
      let response = try await gateway.call(.object(request))
      guard epoch == revision else { return }
      switch action {
      case "prepare":
        guard response.objectValue?["kind"]?.stringValue == "job",
          response.objectValue?["job"]?.objectValue?["id"] == request["id"] else { throw VoiceInputFailure.incompatible }
      case "cancel":
        guard response.objectValue?["kind"]?.stringValue == "cancelled" else { throw VoiceInputFailure.incompatible }
      default: try install(response)
      }
      let deadline = ContinuousClock.now.advanced(by: .seconds(1_260))
      repeat {
        try Task.checkCancellation()
        let state = try await gateway.call(.object(["action": .string("setup")]))
        guard epoch == revision else { return }
        try install(state)
        if !isInstalling && !isPreparing { break }
        guard ContinuousClock.now < deadline else { throw VoiceInputFailure.hex("timeout") }
        try await Task.sleep(for: .milliseconds(500))
      } while true
      await refresh(language: language)
    } catch {
      guard epoch == revision, !Task.isCancelled else { return }
      failure = error as? VoiceInputFailure ?? .hostUnavailable
    }
  }

  private func install(_ value: JSONValue) throws {
    guard value.objectValue?["kind"]?.stringValue == "setup", let setup = value.objectValue?["setup"]?.objectValue else {
      throw VoiceInputFailure.incompatible
    }
    self.setup = setup
    if let code = setup["engine"]?.objectValue?["error"]?.stringValue
      ?? setup["preparation"]?.objectValue?["error"]?.stringValue { failure = .hex(code) }
  }
}
