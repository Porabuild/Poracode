import Foundation

/// The confirmation-gated deletion half of the walk engine: candidates from a
/// completed boundary inventory, <=200-id authoritative membership batches, and
/// attempt-fenced application.
extension BoundedCatalogEngine {
  // MARK: - Deletion gate

  func runDeletionGate(
    kind: BoundedCatalogKind,
    pass: BoundedCatalogPass,
    attempt: Int,
    apiIdentity: String
  ) async {
    guard let api = boundedAPI else { return }
    let currentPins = kind == .threads ? currentPinnedThreadIds() : []
    let loaded = kind == .threads ? store.threadRowIds() : store.projectRowIds()
    let candidates = BoundedCatalogDeletionGate.candidates(
      knownBefore: pass.knownBefore, seen: pass.seen, pinned: currentPins
    ).intersection(loaded)
    guard !candidates.isEmpty else { return }

    for batch in BoundedCatalogDeletionGate.batches(candidates) {
      guard isCurrent(attempt: attempt, apiIdentity: apiIdentity), !Task.isCancelled
      else { return }
      let membership: RemoteBoundedCatalogMembership
      do {
        membership = try await api.boundedCatalogMembership(
          threadIds: kind == .threads ? batch : [],
          projectIds: kind == .projects ? batch : []
        )
      } catch is CancellationError {
        return
      } catch let error as RemoteBoundedReadProtocolError {
        handleProtocolError(error)
        return
      } catch let error as RemoteClientError where error.isUnauthorized {
        await host.handleAuthenticatedFailure(
          error, message: "Session expired. Pair again.",
          generation: host.state.workGeneration
        )
        return
      } catch {
        // A failed confirmation never deletes; the next completed pass retries.
        return
      }
      // A stale reply must not act on a superseded catalog generation.
      guard isCurrent(attempt: attempt, apiIdentity: apiIdentity) else { return }
      let existing = kind == .threads
        ? membership.existingThreadIds : membership.existingProjectIds
      let stillLoaded = kind == .threads ? store.threadRowIds() : store.projectRowIds()
      let pinnedNow = kind == .threads ? currentPinnedThreadIds() : []
      let removable = BoundedCatalogDeletionGate.confirmedAbsent(
        candidates: batch, existing: existing, stillLoaded: stillLoaded, pinned: pinnedNow
      )
      guard !removable.isEmpty else { continue }
      switch kind {
      case .threads:
        store.removeThreads(removable)
      case .projects:
        store.removeProjects(removable)
      }
    }
  }
}
