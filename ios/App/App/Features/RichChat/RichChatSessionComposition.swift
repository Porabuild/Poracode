import Foundation

struct SelectedRichChatRefreshRequester: RichChatAuthoritativeRefreshRequesting {
  typealias Refresh =
    @MainActor @Sendable (
      RichChatThreadTarget, RichChatAuthoritativeRefreshReason
    ) async -> Void

  private let refresh: Refresh

  init(refresh: @escaping Refresh) {
    self.refresh = refresh
  }

  func requestRichChatRefresh(
    target: RichChatThreadTarget,
    reason: RichChatAuthoritativeRefreshReason
  ) async {
    await refresh(target, reason)
  }
}

extension AppSession {
  var currentRichChatAccess: RichChatSessionAccess? {
    guard let connectionID = state.selectedConnectionId else { return nil }
    let capabilities = Set(
      (state.profile?.scopes ?? []).compactMap(RichChatCapability.init(rawValue:))
    )
    let ready = state.api != nil && state.phase == .ready
    let online =
      ready && state.socketState == .online && !state.liveLifecycle.isInBackground
    return RichChatSessionAccess(
      lease: RichChatHostLease(
        connectionID: connectionID,
        generation: UInt64(max(0, state.workGeneration))
      ),
      isOnline: online,
      isReady: ready,
      capabilities: capabilities
    )
  }

  func makeRichChatControllerSuite() -> RichChatControllerSuite {
    let terminalSocket = RichChatTerminalWebSocketTransport(
      connector: RichChatURLSessionTerminalConnector { @MainActor [weak self] in
        guard let self, let access = self.currentRichChatAccess,
          let box = self.state.api as? RemoteAPIClientBox
        else { return nil }
        return RichChatTerminalSocketEndpoint(lease: access.lease, api: box.client)
      }
    )
    let gateway = SelectedRichChatSessionGateway { @MainActor [weak self] in
      self?.currentRichChatTransportSelection(terminalSocket: terminalSocket)
    }
    let requester = SelectedRichChatRefreshRequester { @MainActor [weak self] target, _ in
      guard let self, self.currentRichChatAccess?.lease == target.lease,
        self.activeRichChatSuite?.scope.target == target
      else { return }
      await self.activeRichChatSuite?.refreshAuthoritativeHistory()
    }
    return RichChatControllerSuite(gateway: gateway, refreshRequester: requester)
  }

  func attachRichChatSuite(_ suite: RichChatControllerSuite) {
    guard let target = suite.scope.target, currentRichChatAccess?.lease == target.lease else {
      return
    }
    if activeRichChatSuite === suite {
      scheduleInterestFlush(threadIds: [target.threadID])
      return
    }
    activeRichChatSuite?.deselect()
    activeRichChatSuite = suite
    scheduleInterestFlush(threadIds: [target.threadID])
  }

  func detachRichChatSuite(_ suite: RichChatControllerSuite) {
    guard activeRichChatSuite === suite else { return }
    activeRichChatSuite = nil
    suite.deselect()
    scheduleInterestFlush(threadIds: [])
  }

  func richChatThread(id: String) -> RemoteThread? {
    state.snapshot?.threads.first { $0.id == id }
  }

  func richChatInputConfig(threadID: String) -> [String: RichJSON] {
    guard let config = richChatThread(id: threadID)?.config,
      let data = try? JSONEncoder().encode(config),
      let value = try? RichJSON.decode(data),
      let object = value.objectValue
    else { return [:] }
    return object
  }

  func richChatProjectLocation(threadID: String) -> ProjectLocation? {
    guard let thread = richChatThread(id: threadID),
      let project = state.snapshot?.projects.first(where: { $0.id == thread.projectId })
    else { return nil }
    guard let worktree = thread.worktreePath, !worktree.isEmpty else {
      return project.location
    }
    switch project.location {
    case .posix(_, let remoteServerID):
      return .posix(path: worktree, remoteServerId: remoteServerID)
    case .windows(_, let remoteServerID):
      return .windows(path: worktree, remoteServerId: remoteServerID)
    case .wsl(let distro, _, _, let remoteServerID):
      let relative = worktree.split(separator: "/").joined(separator: "\\")
      return .wsl(
        distro: distro,
        linuxPath: worktree,
        uncPath: "\\\\wsl.localhost\\\(distro)\\\(relative)",
        remoteServerId: remoteServerID
      )
    }
  }

  func receiveRichChatSupervisoryEvent(_ event: JSONValue, sequence: Int) {
    guard let suite = activeRichChatSuite, let target = suite.scope.target,
      currentRichChatAccess?.lease == target.lease,
      let richEvent = RichJSON(jsonValue: event)
    else { return }

    if richEvent.objectValue?["type"]?.stringValue == "thread-pending-steer" {
      try? suite.receivePendingSteerPayload(richEvent, target: target)
      return
    }

    let payloads = Self.richRuntimePayloads(in: richEvent, threadID: target.threadID)
    let decoded = payloads.compactMap { try? RichRuntimeEventDecoder.decode($0) }
    guard !decoded.isEmpty else { return }
    suite.transcript.receiveLiveEvents(
      decoded,
      sequence: sequence,
      receivedAtMilliseconds: Int64((Date().timeIntervalSince1970 * 1_000).rounded()),
      target: target
    )
  }

  private func currentRichChatTransportSelection(
    terminalSocket: any RichChatTerminalSocketSending
  ) -> RichChatTransportSelection? {
    guard let access = currentRichChatAccess else { return nil }
    let api: (any RichChatRemoteAPI)?
    if let box = state.api as? RemoteAPIClientBox {
      api = box.richChatAPI
    } else {
      api = state.api as? any RichChatRemoteAPI
    }
    guard let api else { return nil }
    return RichChatTransportSelection(
      access: access,
      api: api,
      terminalSocket: terminalSocket
    )
  }

  private static func richRuntimePayloads(
    in envelope: RichJSON,
    threadID: String
  ) -> [RichJSON] {
    guard let object = envelope.objectValue, let type = object["type"]?.stringValue else {
      return []
    }
    switch type {
    case "thread-runtime-event":
      guard object["threadId"]?.stringValue == threadID, let event = object["event"] else {
        return []
      }
      return [event]
    case "thread-runtime-events":
      guard object["threadId"]?.stringValue == threadID else { return [] }
      return object["events"]?.arrayValue ?? []
    case "thread-runtime-events-multi":
      return (object["batches"]?.arrayValue ?? []).flatMap { batch in
        guard batch.objectValue?["threadId"]?.stringValue == threadID else {
          return [RichJSON]()
        }
        return batch.objectValue?["events"]?.arrayValue ?? []
      }
    default:
      return object["threadId"]?.stringValue == threadID ? [envelope] : []
    }
  }
}

extension RichJSON {
  init?(jsonValue: JSONValue) {
    switch jsonValue {
    case .null:
      self = .null
    case .bool(let value):
      self = .bool(value)
    case .number(let value):
      guard value.isFinite else { return nil }
      self = .number(Decimal(value))
    case .string(let value):
      self = .string(value)
    case .array(let values):
      let converted = values.compactMap(RichJSON.init(jsonValue:))
      guard converted.count == values.count else { return nil }
      self = .array(converted)
    case .object(let values):
      var converted: [String: RichJSON] = [:]
      for (key, value) in values {
        guard let rich = RichJSON(jsonValue: value) else { return nil }
        converted[key] = rich
      }
      self = .object(converted)
    }
  }
}
