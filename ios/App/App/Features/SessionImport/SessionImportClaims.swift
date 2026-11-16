import Foundation

/// App-lifetime, exact-host claims match the PWA's in-flight and uncertain
/// import maps. A retry reuses its thread id after a lost reply.
@MainActor
final class SessionImportClaims {
  struct Key: Hashable { let connectionID: ClientConnectionID; let path: String }
  private var running: [Key: Task<String, Error>] = [:]
  private var uncertain: [Key: String] = [:]

  func run(key: Key, operation: @escaping @MainActor (String) async throws -> Void) async throws -> String {
    if let task = running[key] { return try await task.value }
    let previous = uncertain[key]
    let id = previous ?? UUID().uuidString
    let task = Task { @MainActor in
      do { try await operation(id) }
      catch SessionImportFailure.threadAlreadyExists where previous != nil { return id }
      return id
    }
    running[key] = task
    defer { running[key] = nil }
    do {
      let result = try await task.value
      uncertain[key] = nil
      return result
    } catch {
      if error is CancellationError || (error as? SessionImportFailure) == .ambiguousOutcome
        || error is ProjectRemoteMutationError {
        uncertain[key] = id
      } else { uncertain[key] = nil }
      throw error
    }
  }
}
