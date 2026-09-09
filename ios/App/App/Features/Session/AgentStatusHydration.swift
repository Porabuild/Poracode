import Foundation

/// Hydrates cached installed-agent state from the authoritative
/// `GET /api/agent-statuses` endpoint.
///
/// The shell snapshot carries no agent statuses, and a fresh client's replay
/// cursor (or the host's bounded replay window) can skip the per-agent
/// `agent-status-updated` history entirely — leaving `HostReplayState` without
/// detection records and the composer disabled until the host happens to
/// re-detect. Bootstrap and resync therefore install the endpoint's full lists
/// as the replay base, before the socket can deliver further events on top.
///
/// Hydration is best-effort and never fatal: a failed fetch leaves the cached
/// base untouched (live `windows-agent-statuses` / `wsl-agent-statuses` events
/// still repopulate it, and the next authoritative refresh retries).
@MainActor
enum AgentStatusHydration {
    /// Fetch + decode the authoritative lists.
    static func fetch(api: any SessionRemoteAPI) async throws -> SessionAgentStatuses {
        try await api.agentStatuses()
    }

    /// Install the lists as the replay base through the exact live-event
    /// reducers, so loaded flags and revision metadata are indistinguishable
    /// from a replayed detection stream: per-agent updates first, terminal
    /// full-list replacement last (windows, then WSL).
    static func install(_ statuses: SessionAgentStatuses, into replay: inout HostReplayState) {
        // Both endpoint lists are complete, including explicit empty lists.
        replay.agentStatuses = OrderedAgentStatusMap()
        replay.agentStatusRevisionByIdentity = [:]
        for record in statuses.windows {
            ReplayEventApplier.apply(.agentStatusUpdated(record), to: &replay)
        }
        ReplayEventApplier.apply(.windowsAgentStatuses(statuses.windows), to: &replay)
        for record in statuses.wsl {
            ReplayEventApplier.apply(.agentStatusUpdated(record), to: &replay)
        }
        ReplayEventApplier.apply(.wslAgentStatuses(statuses.wsl), to: &replay)
    }
}
