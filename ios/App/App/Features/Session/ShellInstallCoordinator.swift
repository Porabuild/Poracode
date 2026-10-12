import Foundation

/// One transactional shell-snapshot install used by every authoritative shell
/// path (legacy assembled refresh and the B4 bounded first page).
///
/// The install shape was duplicated between `LiveConnectionController` and
/// `BoundedCatalogController`; the only real variation is how the additive Git
/// summaries are prepared (replace-all vs page-sliced merge) and whether the
/// caller opens a bounded walk generation after the commit. Both callers keep
/// their own entry points and ownership checks; this type owns the shared
/// decode → boundary replay → commit → publish sequence.
@MainActor
struct ShellInstallCoordinator {
  unowned let host: AppSession

  enum GitSummaryPolicy {
    /// Legacy full snapshot: the snapshot owns every Git summary.
    case replace
    /// Bounded page 1: summaries are sliced to the page, so merge them.
    case mergePage
  }

  /// Decodes the additive fields over the existing replay cache. Throws before
  /// any state mutation so a malformed field aborts the install.
  func prepare(
    shell: RemoteShellSnapshot,
    policy: GitSummaryPolicy
  ) throws -> PreparedReplayInstall {
    switch policy {
    case .replace:
      return try HostSnapshotInstall.prepare(shell: shell, existing: host.state.replay)
    case .mergePage:
      return try HostSnapshotInstall.prepareMergingGitSummaries(
        shell: shell, existing: host.state.replay
      )
    }
  }

  /// Commits one prepared install through the boundary buffer and per-host
  /// cursor policy. Returns nil when a newer install owns the session; the
  /// caller must not publish anything in that case.
  @discardableResult
  func commit(
    _ prepared: PreparedReplayInstall,
    shell: RemoteShellSnapshot,
    captured: ReplayInstallIdentity,
    currentAPIEndpoint: String?,
    advanceCursor: Bool,
    agentBase: SessionAgentStatuses?,
    afterCommit: ((HostSnapshotInstall.Commit) -> Void)? = nil
  ) -> HostSnapshotInstall.Commit? {
    var prepared = prepared
    if let agentBase {
      AgentStatusHydration.install(agentBase, into: &prepared.replay)
    }
    guard
      let commit = host.commitReplayInstall(
        prepared,
        shell: shell,
        captured: captured,
        currentAPIEndpoint: currentAPIEndpoint,
        advanceCursor: advanceCursor,
        isCancelled: Task.isCancelled
      )
    else { return nil }
    if let connectionID = host.state.selectedConnectionId {
      host.state.hostSnapshots[connectionID] = shell
    }
    afterCommit?(commit)
    return commit
  }

  /// Publishes a committed install: authoritative cursor note, resync demand
  /// on a replay gap, and the selected host's Git-state interests.
  func publish(_ commit: HostSnapshotInstall.Commit, advanceCursor: Bool) async {
    if advanceCursor {
      await host.state.webSocket?.noteAuthoritativeSnapshot(commit.cursor)
    }
    if commit.requiresResync {
      host.resync.trigger(reason: "replay boundary gap")
    }
    await host.live.flushGitStateInterests(generation: host.state.workGeneration)
  }
}
