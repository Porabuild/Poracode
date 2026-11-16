import Foundation

protocol VoiceHexCalling: Sendable { func call(_ payload: JSONValue) async throws -> JSONValue }
protocol VoiceHexAPI: Sendable { func voiceHex(_ payload: JSONValue) async throws -> JSONValue }

extension RemoteAPIClient: VoiceHexAPI {
  func voiceHex(_ payload: JSONValue) async throws -> JSONValue {
    guard RemoteContractMetadata.protocolVersion == ProtocolConstants.remoteProtocolVersion,
      let metadata = RemoteContractMetadata.procedures.first(where: { $0.name == "hexVoice" }),
      metadata.scope == "session:operate", metadata.owner == "desktop", metadata.resultKind == "json" else {
      throw VoiceInputFailure.incompatible
    }
    let encoded = try voiceCanonical(JSONEncoder().encode(payload), codec: RemoteRootCodecs.procedureU2EHexVoiceU2ERequest)
    let canonical = try JSONDecoder().decode(JSONValue.self, from: encoded)
    let envelope = JSONValue.object(["procedure": .string("hexVoice"), "payload": canonical])
    let body = try voiceCanonical(JSONEncoder().encode(envelope), codec: RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest)
    let data = try await requestData(path: "/api/git/call", method: "POST", jsonBody: body, timeout: 30)
    let root = try JSONDecoder().decode(JSONValue.self, from: data)
    guard let result = root.objectValue?["result"], root.objectValue?.count == 1 else { throw VoiceInputFailure.incompatible }
    let value = try voiceCanonical(JSONEncoder().encode(result), codec: RemoteRootCodecs.procedureU2EHexVoiceU2EResult)
    return try JSONDecoder().decode(JSONValue.self, from: value)
  }
}

private func voiceCanonical<Value: Codable & Sendable>(_ data: Data, codec: RemoteRootCodec<Value>) throws -> Data {
  try codec.encodeSnapshot(codec.decode(data))
}

struct VoiceHexSelection: Sendable {
  let lease: RichChatHostLease
  let canOperate: Bool
  let api: any VoiceHexAPI
}

/// One selected-host lease, one attempt per call. No fallback to another
/// connection, including cleanup and polling after a host switch.
actor SelectedVoiceHexGateway: VoiceHexCalling {
  typealias Selection = @MainActor @Sendable () -> VoiceHexSelection?
  private let lease: RichChatHostLease
  private let selection: Selection
  init(lease: RichChatHostLease, selection: @escaping Selection) {
    self.lease = lease; self.selection = selection
  }
  func call(_ payload: JSONValue) async throws -> JSONValue {
    try Task.checkCancellation()
    guard let captured = await selection(), captured.lease == lease, captured.canOperate else {
      throw VoiceInputFailure.hostUnavailable
    }
    let result: JSONValue
    do { result = try await captured.api.voiceHex(payload) }
    catch let error as RemoteClientError {
      if error.status == 404 || error.code == "procedure_not_found" { throw VoiceInputFailure.incompatible }
      throw VoiceInputFailure.hostUnavailable
    }
    try Task.checkCancellation()
    guard let current = await selection(), current.lease == lease, current.canOperate else {
      throw VoiceInputFailure.hostUnavailable
    }
    if let code = result.objectValue?["code"]?.stringValue, result.objectValue?["kind"]?.stringValue == "error" {
      throw VoiceInputFailure.hex(code)
    }
    return result
  }
}

extension AppSession {
  func makeVoiceHexGateway(lease: RichChatHostLease) -> any VoiceHexCalling {
    SelectedVoiceHexGateway(lease: lease) { @MainActor [weak self] in
      guard let self, let access = self.currentRichChatAccess,
        let box = self.state.api as? RemoteAPIClientBox else { return nil }
      return .init(lease: access.lease, canOperate: access.controllerGate(.sessionOperate) == nil, api: box.client)
    }
  }
}
