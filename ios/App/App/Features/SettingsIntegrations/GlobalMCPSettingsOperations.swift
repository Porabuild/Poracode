import Foundation

extension GlobalMCPSettingsController {
  func refreshOAuthStatus() async {
    guard let selection, selection.gate(.projectsManage) == nil else { return }
    replaceOperationTask()
    let captured = operationRevision
    let lease = selection.lease
    oauthLifecycle = .checking
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await gateway.operateGlobalMCPSettings(
          .oauthStatus(scope: .global), lease: lease)
        try Task.checkCancellation()
        guard self.ownsOperation(captured, lease) else { return }
        guard case .oauthStatus(let serverIDs) = response else {
          throw SettingsGatewayError.transport
        }
        self.authenticatedServerIDs = Set(serverIDs)
        self.oauthLifecycle = .ready(authenticatedCount: serverIDs.count)
      } catch is CancellationError {
      } catch {
        guard self.ownsOperation(captured, lease) else { return }
        self.oauthLifecycle = .failed(SettingsIntegrationsFailure.map(error))
      }
      self.finishOperation(captured)
    }
    operationTask = pending
    await pending.value
  }

  func probe(_ server: ProjectMCPServer) async {
    guard let selection, selection.gate(.projectsManage) == nil else { return }
    replaceOperationTask()
    let captured = operationRevision
    let lease = selection.lease
    probingServerID = server.id
    probeFailures.remove(server.id)
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await gateway.operateGlobalMCPSettings(
          .probe(scope: .global, serverID: server.id), lease: lease)
        try Task.checkCancellation()
        guard self.ownsOperation(captured, lease) else { return }
        guard case .probe(let result) = response else { throw SettingsGatewayError.transport }
        self.probeResults[server.id] = result
      } catch is CancellationError {
      } catch {
        guard self.ownsOperation(captured, lease) else { return }
        self.probeFailures.insert(server.id)
      }
      guard self.ownsOperation(captured, lease) else { return }
      self.probingServerID = nil
      self.finishOperation(captured)
    }
    operationTask = pending
    await pending.value
  }

  func startOAuth(_ server: ProjectMCPServer) async {
    guard let selection, selection.gate(.projectsManage) == nil else { return }
    replaceOperationTask()
    let captured = operationRevision
    let lease = selection.lease
    oauthLifecycle = .starting
    oauthFlowID = nil
    let gateway = self.gateway
    let browser = self.browser
    let pending = Task {
      do {
        let response = try await gateway.operateGlobalMCPSettings(
          .oauthBegin(scope: .global, serverID: server.id), lease: lease)
        try Task.checkCancellation()
        guard self.ownsOperation(captured, lease) else { return }
        guard case .oauthBegin(let result) = response else {
          throw SettingsGatewayError.transport
        }
        switch result {
        case .authorized:
          self.oauthLifecycle = .authorized
          await self.reconcileOAuth(captured: captured, lease: lease)
        case .error:
          self.oauthLifecycle = .failed(.rejected)
        case .redirect(let flowID, let authorizationURL):
          self.oauthFlowID = flowID
          self.oauthLifecycle = .openingBrowser
          let url = try SettingsIntegrationsAuthorizationURLPolicy.validatedURL(authorizationURL)
          guard await browser.openAuthorizationURL(url) else {
            self.oauthLifecycle = .failed(.unavailable)
            return
          }
          try Task.checkCancellation()
          guard self.ownsOperation(captured, lease) else { return }
          try await self.waitForOAuth(flowID: flowID, captured: captured, lease: lease)
        }
      } catch is CancellationError {
      } catch {
        guard self.ownsOperation(captured, lease) else { return }
        let failure = SettingsIntegrationsFailure.map(error)
        if failure == .ambiguousOutcome {
          await self.reconcileOAuth(captured: captured, lease: lease)
        } else {
          self.oauthLifecycle = .failed(failure)
        }
      }
      self.finishOperation(captured)
    }
    operationTask = pending
    await pending.value
  }

  func clearOAuth(_ server: ProjectMCPServer) async {
    guard let selection, selection.gate(.projectsManage) == nil else { return }
    replaceOperationTask()
    let captured = operationRevision
    let lease = selection.lease
    oauthLifecycle = .starting
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await gateway.operateGlobalMCPSettings(
          .oauthClear(scope: .global, serverID: server.id), lease: lease)
        try Task.checkCancellation()
        guard self.ownsOperation(captured, lease), case .oauthClear = response else { return }
        await self.reconcileOAuth(captured: captured, lease: lease)
      } catch is CancellationError {
      } catch {
        guard self.ownsOperation(captured, lease) else { return }
        let failure = SettingsIntegrationsFailure.map(error)
        if failure == .ambiguousOutcome {
          await self.reconcileOAuth(captured: captured, lease: lease)
        } else {
          self.oauthLifecycle = .failed(failure)
        }
      }
      self.finishOperation(captured)
    }
    operationTask = pending
    await pending.value
  }

  func cancelOAuth() {
    replaceOperationTask()
    oauthFlowID = nil
    oauthLifecycle = .cancelled
  }

  func suspendOAuth() {
    guard
      oauthLifecycle == .waiting || oauthLifecycle == .starting
        || oauthLifecycle == .openingBrowser
    else { return }
    operationRevision &+= 1
    operationTask?.cancel()
    operationTask = nil
    oauthLifecycle = .paused
  }

  func resumeOAuth() async {
    guard oauthLifecycle == .paused, let selection, selection.gate(.projectsManage) == nil else {
      return
    }
    guard let flowID = oauthFlowID else {
      await refreshOAuthStatus()
      return
    }
    replaceOperationTask()
    let captured = operationRevision
    let lease = selection.lease
    let pending = Task {
      do {
        try await self.waitForOAuth(flowID: flowID, captured: captured, lease: lease)
      } catch is CancellationError {
      } catch {
        guard self.ownsOperation(captured, lease) else { return }
        self.oauthLifecycle = .failed(SettingsIntegrationsFailure.map(error))
      }
      self.finishOperation(captured)
    }
    operationTask = pending
    await pending.value
  }

  private func waitForOAuth(
    flowID: String,
    captured: UInt64,
    lease: SettingsHostLease
  ) async throws {
    oauthLifecycle = .waiting
    let response = try await gateway.operateGlobalMCPSettings(
      .oauthWait(scope: .global, flowID: flowID), lease: lease)
    try Task.checkCancellation()
    guard ownsOperation(captured, lease), oauthFlowID == flowID else {
      throw CancellationError()
    }
    guard case .oauthWait(let result) = response else { throw SettingsGatewayError.transport }
    switch result {
    case .authorized:
      oauthLifecycle = .authorized
      oauthFlowID = nil
      await reconcileOAuth(captured: captured, lease: lease)
    case .error:
      oauthLifecycle = .failed(.rejected)
    }
  }

  private func reconcileOAuth(captured: UInt64, lease: SettingsHostLease) async {
    do {
      let response = try await gateway.operateGlobalMCPSettings(
        .oauthStatus(scope: .global), lease: lease)
      try Task.checkCancellation()
      guard ownsOperation(captured, lease), case .oauthStatus(let serverIDs) = response else {
        return
      }
      authenticatedServerIDs = Set(serverIDs)
      oauthLifecycle = .ready(authenticatedCount: serverIDs.count)
    } catch is CancellationError {
    } catch {
      guard ownsOperation(captured, lease) else { return }
      oauthLifecycle = .failed(SettingsIntegrationsFailure.map(error))
    }
  }

  private func ownsOperation(_ captured: UInt64, _ lease: SettingsHostLease) -> Bool {
    operationRevision == captured && selection?.lease == lease
  }

  private func finishOperation(_ captured: UInt64) {
    if operationRevision == captured { operationTask = nil }
  }

  func replaceOperationTask() {
    operationRevision &+= 1
    operationTask?.cancel()
    operationTask = nil
    probingServerID = nil
  }
}
