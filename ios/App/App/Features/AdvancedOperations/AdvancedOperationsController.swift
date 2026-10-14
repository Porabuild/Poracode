import Foundation

@MainActor
final class AdvancedOperationsController {
  private let gateway: any AdvancedOperationsGateway
  private var task: Task<Void, Never>?
  private var generation: UInt64 = 0

  private(set) var state: AdvancedOperationControllerState = .idle

  init(gateway: any AdvancedOperationsGateway) {
    self.gateway = gateway
  }

  func perform(
    _ request: AdvancedOperationRequest,
    lease: AdvancedOperationLease
  ) async throws -> AdvancedOperationResult {
    state = .running(request.procedure)
    do {
      let result = try await gateway.call(request, lease: lease)
      try Task.checkCancellation()
      state = .succeeded(request.procedure, result)
      return result
    } catch is CancellationError {
      state = .idle
      throw CancellationError()
    } catch let failure as AdvancedOperationFailure {
      state = .failed(request.procedure, failure)
      throw failure
    } catch {
      state = .failed(request.procedure, .transport)
      throw AdvancedOperationFailure.transport
    }
  }

  func start(
    _ request: AdvancedOperationRequest,
    lease: AdvancedOperationLease
  ) {
    generation &+= 1
    let ownerGeneration = generation
    task?.cancel()
    state = .running(request.procedure)
    task = Task { [weak self] in
      guard let self else { return }
      do {
        let result = try await gateway.call(request, lease: lease)
        try Task.checkCancellation()
        guard ownerGeneration == generation else { return }
        state = .succeeded(request.procedure, result)
      } catch is CancellationError {
        guard ownerGeneration == generation else { return }
        state = .idle
      } catch let failure as AdvancedOperationFailure {
        guard ownerGeneration == generation else { return }
        state = .failed(request.procedure, failure)
      } catch {
        guard ownerGeneration == generation else { return }
        state = .failed(request.procedure, .transport)
      }
    }
  }

  func cancel() {
    generation &+= 1
    task?.cancel()
    task = nil
    state = .idle
  }
}
