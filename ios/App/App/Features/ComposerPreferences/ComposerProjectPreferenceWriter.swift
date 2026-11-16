import Foundation

/// Explicit edits only. Pending edits for one project coalesce, dispatched
/// writes stay ordered, and a host-generation change drops unsent old work.
/// A lost response is refreshed, never replayed as a replacement mutation.
@MainActor final class ComposerProjectPreferenceWriter {
  typealias Access = @MainActor () -> ProjectControllerSession?
  private struct Pending {
    let command: ProjectCommand
    let commandID: String
    let lease: ProjectControllerHostLease
  }
  private let gateway: any ProjectSessionGateway
  private let refresh: any ProjectControllerRefreshScheduling
  private let access: Access
  private var pending: [String: Pending] = [:]
  private var running = Set<String>()
  var isIdle: Bool { running.isEmpty && pending.isEmpty }

  init(gateway: any ProjectSessionGateway, refresh: any ProjectControllerRefreshScheduling,
    access: @escaping Access) {
    self.gateway = gateway; self.refresh = refresh; self.access = access
  }

  func remember(configuration: ThreadConfig, owner: ModelSelectionOwner, projectID: String, worktreeMode: Bool) {
    guard owner.isValid, owner.agentInstanceID == nil, !projectID.isEmpty,
      let session = access(), session.gate(.projectsManage) == nil,
      let data = try? JSONEncoder().encode(configuration),
      let value = try? JSONDecoder().decode(JSONValue.self, from: data),
      var fields = value.objectValue else { return }
    // The existing project schema has no independent agentInstanceId slot.
    // Keep such selections exact locally instead of publishing an ambiguous
    // provider default to the host.
    fields["agentKind"] = .string(owner.agentKind)
    fields["worktreeMode"] = .bool(worktreeMode)
    let key = session.lease.connectionId.rawValue + ":" + projectID
    pending[key] = Pending(command: .setDraftConfig(projectId: projectID, lastDraftConfig: .object(fields)),
      commandID: UUID().uuidString.lowercased(), lease: session.lease)
    guard running.insert(key).inserted else { return }
    Task { [weak self] in await self?.drain(key) }
  }

  private func drain(_ key: String) async {
    defer { running.remove(key) }
    while let item = pending.removeValue(forKey: key) {
      guard let current = access(), current.lease == item.lease,
        current.gate(.projectsManage) == nil else { continue }
      do {
        _ = try await gateway.runProjectCommand(item.command, operationId: item.commandID, lease: item.lease)
        if access()?.lease == item.lease { await refresh.scheduleProjectRefresh(for: item.lease) }
      } catch is CancellationError {
        continue
      } catch ProjectSessionGatewayError.ambiguousOutcome {
        if access()?.lease == item.lease { await refresh.scheduleProjectRefresh(for: item.lease) }
      } catch {
        // Unsupported/old hosts and missing scopes keep this client's saved
        // choice. No wide project patch, host-settings fallback or retry.
        continue
      }
    }
  }
}

extension AppSession {
  func rememberComposerProjectPreference(_ configuration: ThreadConfig, owner: ModelSelectionOwner,
    projectID: String, worktreeMode: Bool) {
    if composerProjectPreferenceWriter == nil {
      composerProjectPreferenceWriter = ComposerProjectPreferenceWriter(gateway: makeProjectSessionGateway(),
        refresh: makeProjectRefreshScheduler(), access: { [weak self] in self?.currentProjectControllerSession })
    }
    composerProjectPreferenceWriter?.remember(configuration: configuration, owner: owner,
      projectID: projectID, worktreeMode: worktreeMode)
  }
}
