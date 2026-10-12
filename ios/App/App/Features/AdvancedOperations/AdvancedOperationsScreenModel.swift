import Foundation
import Observation

enum AdvancedSubmission: Equatable, Sendable {
  case completed
  case awaitingConfirmation
  case rejected
}

/// Drives one Advanced Operations surface.
///
/// Reads are latest-wins and cancellable. Mutations are serialized, dispatched
/// once, and never retried automatically. Every dispatch carries the exact
/// lease captured when the user acted, and a completion that no longer matches
/// the current lease, generation, or foreground state is dropped instead of
/// installed.
@MainActor
@Observable
final class AdvancedOperationsScreenModel {
  private(set) var readOutcome: AdvancedOperationOutcome?
  private(set) var mutationOutcome: AdvancedOperationOutcome?
  private(set) var activeRead: AdvancedOperationProcedure?
  private(set) var activeMutation: AdvancedOperationProcedure?
  private(set) var failure: AdvancedOperationsInteractionFailure?
  private(set) var pendingMutation: AdvancedPendingMutation?
  /// Set after an ambiguous delivery; the surface must be re-read from the
  /// host before the user acts again.
  private(set) var requiresAuthoritativeRefresh = false

  private let composition: AdvancedOperationsComposition
  private var readTask: Task<Bool, Never>?
  private var mutationTask: Task<Bool, Never>?
  private var readGeneration: UInt64 = 0
  private var mutationGeneration: UInt64 = 0
  private var isBackgrounded = false

  init(composition: AdvancedOperationsComposition) {
    self.composition = composition
  }

  var isBusy: Bool { activeRead != nil || activeMutation != nil }

  func access(for procedure: AdvancedOperationProcedure) -> AdvancedOperationSessionAccess? {
    composition.access(procedure)
  }

  func permits(_ descriptor: AdvancedOperationDescriptor) -> Bool {
    !isBackgrounded
      && AdvancedOperationGating.permits(
        descriptor, access: composition.access(descriptor.procedure))
  }

  func submit(_ draft: AdvancedOperationDraft) async -> AdvancedSubmission {
    guard let capture = capture(draft) else { return .rejected }
    guard !AdvancedOperationsPresentation.confirmingProcedures.contains(capture.procedure) else {
      pendingMutation = AdvancedPendingMutation(request: capture.request, lease: capture.lease)
      return .awaitingConfirmation
    }
    return await dispatch(capture)
  }

  /// Executes the captured request unchanged, or drops it if the owner moved.
  func confirmPendingMutation() async -> AdvancedSubmission {
    guard let pending = pendingMutation else { return .rejected }
    pendingMutation = nil
    guard !isBackgrounded, let access = composition.access(pending.procedure),
      access.lease == pending.lease, access.isUsable
    else {
      failure = .ownerChanged
      return .rejected
    }
    let scope = pending.procedure.metadata.scope
    guard access.permits(scope) else {
      failure = .missingScope(scope)
      return .rejected
    }
    mutationGeneration &+= 1
    return await dispatch(
      AdvancedOperationCapture(
        request: pending.request,
        lease: pending.lease,
        generation: mutationGeneration
      )
    )
  }

  func cancelPendingMutation() {
    pendingMutation = nil
  }

  func cancelRead() {
    readGeneration &+= 1
    readTask?.cancel()
    readTask = nil
    activeRead = nil
  }

  func acknowledgeAuthoritativeRefresh() {
    requiresAuthoritativeRefresh = false
  }

  func clearFailure() {
    failure = nil
  }

  /// Called when the surface leaves the foreground.
  func enterBackground() {
    isBackgrounded = true
    cancelAll()
    pendingMutation = nil
  }

  func leaveBackground() {
    isBackgrounded = false
  }

  /// Called when the activation identity changes: nothing from the previous
  /// owner may survive.
  func invalidate() {
    isBackgrounded = false
    cancelAll()
    pendingMutation = nil
    readOutcome = nil
    mutationOutcome = nil
    failure = nil
    requiresAuthoritativeRefresh = false
  }

  private func cancelAll() {
    readGeneration &+= 1
    mutationGeneration &+= 1
    readTask?.cancel()
    mutationTask?.cancel()
    readTask = nil
    mutationTask = nil
    activeRead = nil
    activeMutation = nil
  }

  private func capture(_ draft: AdvancedOperationDraft) -> AdvancedOperationCapture? {
    failure = nil
    let procedure = draft.procedure
    guard !isBackgrounded else {
      failure = .unavailable(.background)
      return nil
    }
    guard let access = composition.access(procedure), access.lease.isValid else {
      failure = .missingSession
      return nil
    }
    if let unavailability = access.unavailability {
      failure = .unavailable(unavailability)
      return nil
    }
    let scope = procedure.metadata.scope
    guard access.permits(scope) else {
      failure = .missingScope(scope)
      return nil
    }
    let request: AdvancedOperationRequest
    do {
      request = try AdvancedOperationsRequestBuilder.request(draft, owner: access.lease.owner)
    } catch let error as AdvancedFormValidationError {
      failure = .validation(error)
      return nil
    } catch {
      failure = .validation(.ownerMismatch)
      return nil
    }
    let isRead = procedure.metadata.delivery == .readOnly
    if isRead {
      readGeneration &+= 1
    } else {
      guard activeMutation == nil else {
        failure = .busy
        return nil
      }
      mutationGeneration &+= 1
    }
    return AdvancedOperationCapture(
      request: request,
      lease: access.lease,
      generation: isRead ? readGeneration : mutationGeneration
    )
  }

  private func dispatch(_ capture: AdvancedOperationCapture) async -> AdvancedSubmission {
    let isRead = capture.procedure.metadata.delivery == .readOnly
    let task: Task<Bool, Never>
    if isRead {
      readTask?.cancel()
      activeRead = capture.procedure
      task = Task { [weak self] in await self?.run(capture) ?? false }
      readTask = task
    } else {
      activeMutation = capture.procedure
      task = Task { [weak self] in await self?.run(capture) ?? false }
      mutationTask = task
    }
    return await task.value ? .completed : .rejected
  }

  private func run(_ capture: AdvancedOperationCapture) async -> Bool {
    do {
      let result = try await composition.gateway.call(capture.request, lease: capture.lease)
      guard isCurrent(capture) else { return false }
      finish(capture)
      let outcome = AdvancedOperationOutcomeProjection.outcome(
        result,
        procedure: capture.procedure
      )
      if capture.procedure.metadata.delivery == .readOnly {
        readOutcome = outcome
      } else {
        mutationOutcome = outcome
      }
      return true
    } catch is CancellationError {
      if isCurrent(capture) { finish(capture) }
      return false
    } catch {
      let interaction =
        (error as? AdvancedOperationFailure).map(AdvancedOperationsInteractionFailure.init)
        ?? .operation(.transport)
      // The host may already have applied the mutation, so ask for an
      // authoritative refresh even when the surface has moved on.
      if interaction.isAmbiguous {
        composition.requestAuthoritativeRefresh(capture.procedure, capture.lease)
      }
      guard isCurrent(capture) else { return false }
      finish(capture)
      failure = interaction
      requiresAuthoritativeRefresh = requiresAuthoritativeRefresh || interaction.isAmbiguous
      return false
    }
  }

  private func finish(_ capture: AdvancedOperationCapture) {
    if capture.procedure.metadata.delivery == .readOnly {
      activeRead = nil
      readTask = nil
    } else {
      activeMutation = nil
      mutationTask = nil
    }
  }

  private func isCurrent(_ capture: AdvancedOperationCapture) -> Bool {
    guard !isBackgrounded else { return false }
    let isRead = capture.procedure.metadata.delivery == .readOnly
    guard capture.generation == (isRead ? readGeneration : mutationGeneration) else {
      return false
    }
    guard let access = composition.access(capture.procedure), access.isUsable,
      access.lease == capture.lease
    else { return false }
    return true
  }
}
