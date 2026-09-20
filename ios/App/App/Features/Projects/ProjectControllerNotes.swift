import Foundation
import Observation

struct ProjectControllerNotesState: Equatable, Sendable {
  var draft: ProjectNotes?
  var lastConfirmed: ProjectNotes?
  var revision: UInt64 = 0
  var latestWriteRequest: UInt64 = 0
  var loadState: ProjectControllerLoadState = .idle
  var isSaving = false
  var failure: ProjectOperationFailure?
}

@MainActor
@Observable
final class ProjectControllerNotesController {
  static let debounceDelay = Duration.milliseconds(600)

  private(set) var session: ProjectControllerSession?
  private(set) var notesByProject: [ProjectIdentity: ProjectControllerNotesState] = [:]

  private let gateway: any ProjectSessionGateway
  private let scheduler: any ProjectControllerDebounceScheduling
  private var loadRevisionByProject: [ProjectIdentity: UInt64] = [:]
  private var scheduledWriteByProject: [ProjectIdentity: any ProjectControllerScheduledOperation] =
    [:]
  private var nextWriteRequest: UInt64 = 0
  private var activationRevision: UInt64 = 0

  init(
    gateway: any ProjectSessionGateway,
    scheduler: any ProjectControllerDebounceScheduling =
      ProjectControllerTaskDebounceScheduler()
  ) {
    self.gateway = gateway
    self.scheduler = scheduler
  }

  func activate(_ session: ProjectControllerSession) {
    if self.session?.lease != session.lease {
      activationRevision &+= 1
      for operation in scheduledWriteByProject.values {
        operation.cancel()
      }
      scheduledWriteByProject.removeAll(keepingCapacity: true)
      for identity in Array(notesByProject.keys) {
        loadRevisionByProject[identity, default: 0] &+= 1
        if notesByProject[identity]?.loadState == .loading {
          notesByProject[identity]?.loadState = .idle
        }
        notesByProject[identity]?.isSaving = false
      }
    }
    self.session = session
  }

  func deactivate() {
    guard session != nil else { return }
    activationRevision &+= 1
    for operation in scheduledWriteByProject.values {
      operation.cancel()
    }
    scheduledWriteByProject.removeAll(keepingCapacity: true)
    for identity in Array(notesByProject.keys) {
      loadRevisionByProject[identity, default: 0] &+= 1
      if notesByProject[identity]?.loadState == .loading {
        notesByProject[identity]?.loadState = .idle
      }
      notesByProject[identity]?.isSaving = false
    }
    session = nil
  }

  func state(for identity: ProjectIdentity) -> ProjectControllerNotesState {
    notesByProject[identity] ?? ProjectControllerNotesState()
  }

  func load(_ identity: ProjectIdentity) async {
    guard let session, session.lease.connectionId == identity.connectionId else { return }
    if let failure = session.gate(.sessionRead) {
      mutate(identity) { $0.loadState = .failed(failure) }
      return
    }

    let lease = session.lease
    let activation = activationRevision
    loadRevisionByProject[identity, default: 0] &+= 1
    let loadRevision = loadRevisionByProject[identity, default: 0]
    let draftRevision = state(for: identity).revision
    mutate(identity) { $0.loadState = .loading }

    do {
      let response = try await gateway.loadProjectNotes(for: identity, lease: lease)
      guard
        ownsLoad(
          identity,
          loadRevision: loadRevision,
          draftRevision: draftRevision,
          activation: activation,
          lease: lease
        )
      else { return }
      guard response.notes?.projectId == identity.projectId || response.notes == nil else {
        mutate(identity) { $0.loadState = .failed(.invalidResponse) }
        return
      }
      mutate(identity) { state in
        state.draft = response.notes
        state.lastConfirmed = response.notes
        state.loadState = response.notes == nil ? .empty : .loaded
        state.failure = nil
      }
    } catch is CancellationError {
      guard
        ownsLoad(
          identity,
          loadRevision: loadRevision,
          draftRevision: draftRevision,
          activation: activation,
          lease: lease
        )
      else { return }
      mutate(identity) { $0.loadState = .idle }
    } catch {
      guard
        ownsLoad(
          identity,
          loadRevision: loadRevision,
          draftRevision: draftRevision,
          activation: activation,
          lease: lease
        )
      else { return }
      mutate(identity) { $0.loadState = .failed(.map(error)) }
    }
  }

  func edit(
    _ identity: ProjectIdentity,
    doc: JSONValue?,
    todos: [ProjectNoteTodo],
    updatedAt: String
  ) {
    guard let session, session.lease.connectionId == identity.connectionId else { return }
    if let failure = session.gate(.sessionOperate) {
      mutate(identity) { $0.failure = failure }
      return
    }

    let lease = session.lease
    let activation = activationRevision
    var state = state(for: identity)
    state.revision &+= 1
    let revision = state.revision
    state.draft = ProjectNotes(
      projectId: identity.projectId,
      doc: doc,
      todos: todos,
      updatedAt: updatedAt
    )
    state.failure = nil
    notesByProject[identity] = state

    scheduledWriteByProject[identity]?.cancel()
    scheduledWriteByProject[identity] = scheduler.schedule(after: Self.debounceDelay) {
      [weak self] in
      await self?.flush(
        identity,
        revision: revision,
        activation: activation,
        lease: lease
      )
    }
  }

  private func flush(
    _ identity: ProjectIdentity,
    revision: UInt64,
    activation: UInt64,
    lease: ProjectControllerHostLease
  ) async {
    guard activation == activationRevision,
      session?.lease == lease,
      identity.connectionId == lease.connectionId,
      var state = notesByProject[identity],
      state.revision == revision,
      let draft = state.draft
    else { return }
    scheduledWriteByProject.removeValue(forKey: identity)

    if let failure = session?.gate(.sessionOperate) {
      state.draft = state.lastConfirmed
      state.failure = failure
      notesByProject[identity] = state
      return
    }

    nextWriteRequest &+= 1
    let request = nextWriteRequest
    state.latestWriteRequest = request
    state.isSaving = true
    notesByProject[identity] = state
    let body = ProjectNotesWriteBody(
      doc: draft.doc,
      todos: draft.todos,
      updatedAt: draft.updatedAt
    )

    do {
      try await gateway.writeProjectNotes(body, for: identity, lease: lease)
      guard
        var current = currentWriteState(
          identity,
          request: request,
          activation: activation,
          lease: lease
        )
      else {
        return
      }
      current.lastConfirmed = draft
      current.isSaving = false
      current.failure = nil
      notesByProject[identity] = current
    } catch is CancellationError {
      guard
        var current = currentWriteState(
          identity,
          request: request,
          activation: activation,
          lease: lease
        )
      else {
        return
      }
      current.isSaving = false
      notesByProject[identity] = current
    } catch {
      guard
        var current = currentWriteState(
          identity,
          request: request,
          activation: activation,
          lease: lease
        )
      else {
        return
      }
      current.isSaving = false
      if current.revision == revision {
        current.draft = current.lastConfirmed
        current.failure = .map(error)
      }
      notesByProject[identity] = current
    }
  }

  private func ownsLoad(
    _ identity: ProjectIdentity,
    loadRevision: UInt64,
    draftRevision: UInt64,
    activation: UInt64,
    lease: ProjectControllerHostLease
  ) -> Bool {
    activation == activationRevision
      && session?.lease == lease
      && identity.connectionId == lease.connectionId
      && loadRevisionByProject[identity] == loadRevision
      && state(for: identity).revision == draftRevision
  }

  private func currentWriteState(
    _ identity: ProjectIdentity,
    request: UInt64,
    activation: UInt64,
    lease: ProjectControllerHostLease
  ) -> ProjectControllerNotesState? {
    guard activation == activationRevision,
      session?.lease == lease,
      identity.connectionId == lease.connectionId,
      let state = notesByProject[identity],
      state.latestWriteRequest == request
    else { return nil }
    return state
  }

  private func mutate(
    _ identity: ProjectIdentity,
    _ mutation: (inout ProjectControllerNotesState) -> Void
  ) {
    var state = state(for: identity)
    mutation(&state)
    notesByProject[identity] = state
  }
}
