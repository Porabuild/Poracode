import Foundation
import Observation

@MainActor
@Observable
final class RemoteIntegrationsAutomationsController {
  private(set) var lease: RemoteIntegrationsHostLease?
  private(set) var state: RemoteIntegrationsLoadState = .idle
  private(set) var schedules: [RemoteIntegrationsScheduledTask] = []
  private(set) var runs: [RemoteIntegrationsScheduleRun] = []
  private(set) var unreadCount = 0
  private(set) var hasMore = false
  private(set) var busy = false
  private(set) var mutationFailure: RemoteIntegrationsFailure?
  private(set) var latestRunStates: [String: RemoteIntegrationsScheduleRun] = [:]
  var filter = "unread"
  var search = ""

  @ObservationIgnored private let gateway: any RemoteIntegrationsGateway
  @ObservationIgnored private var ordinal: UInt64 = 0
  @ObservationIgnored private var pageCount = 1
  @ObservationIgnored private var readingQuery: [String]?
  @ObservationIgnored private var retainedRunId: String?
  @ObservationIgnored private var detailOrdinal: UInt64 = 0

  init(gateway: any RemoteIntegrationsGateway) { self.gateway = gateway }

  func activate(_ lease: RemoteIntegrationsHostLease?) {
    guard self.lease != lease else { return }
    ordinal &+= 1
    detailOrdinal &+= 1
    self.lease = lease
    state = .idle
    schedules = []; runs = []; unreadCount = 0; hasMore = false; busy = false
    mutationFailure = nil; latestRunStates = [:]; pageCount = 1; filter = "unread"; search = ""
    readingQuery = nil; retainedRunId = nil
  }

  func load(reset: Bool = false, more: Bool = false) async {
    guard let lease, !busy else { return }
    let requestedQuery = [filter, search]
    if readingQuery == requestedQuery, !more, !reset { return }
    ordinal &+= 1
    let request = ordinal
    let pages = reset ? 1 : pageCount + (more ? 1 : 0)
    readingQuery = requestedQuery
    pageCount = pages
    defer { if ordinal == request { readingQuery = nil } }
    let requestedFilter = filter
    let requestedSearch = search
    if runs.isEmpty { state = .loading }
    do {
      let response = try await gateway.automations(query(cursor: nil, filter: requestedFilter, search: requestedSearch), lease: lease)
      var collected = response.runs
      var page = response.runs
      if pages > 1 {
        for _ in 1..<pages {
          guard page.count == 50, let last = page.last else { break }
          let next = try await gateway.scheduleInbox(query(cursor: "\(last.startedAt)|\(last.id)", filter: requestedFilter, search: requestedSearch), lease: lease)
          page = next.runs
          collected += page
        }
      }
      try Task.checkCancellation()
      guard owns(lease, request), filter == requestedFilter, search == requestedSearch else { return }
      schedules = response.schedules; runs = collected; unreadCount = response.unreadCount
      let retained = retainedRunId.flatMap { latestRunStates[$0] }
      latestRunStates = Dictionary(uniqueKeysWithValues: collected.map { ($0.id, $0) })
      if let retained, latestRunStates[retained.id] == nil { latestRunStates[retained.id] = retained }
      hasMore = page.count == 50; pageCount = pages; state = .loaded
    } catch is CancellationError {
    } catch {
      guard owns(lease, request) else { return }
      state = .failed(RemoteIntegrationsFailure.map(error))
    }
  }

  func perform(_ command: JSONValue) async {
    guard let lease, !busy else { return }
    ordinal &+= 1
    detailOrdinal &+= 1
    readingQuery = nil
    let request = ordinal
    busy = true; mutationFailure = nil
    do {
      let response = try await gateway.scheduleRunCommand(command, lease: lease)
      if owns(lease, request), let run = response.run {
        retainedRunId = run.id; latestRunStates[run.id] = run
      }
    }
    catch is CancellationError { if owns(lease, request) { busy = false }; return }
    catch { if owns(lease, request) { mutationFailure = RemoteIntegrationsFailure.map(error) } }
    guard owns(lease, request) else { return }
    busy = false
    // An ambiguous mutation is reconciled by a read, never retried.
    await load()
  }

  func refreshRun(_ run: RemoteIntegrationsScheduleRun) async {
    guard let lease, !busy else { return }
    retainedRunId = run.id
    detailOrdinal &+= 1
    let request = detailOrdinal
    do {
      let response = try await gateway.scheduleRuns(id: run.scheduleId, lease: lease)
      guard self.lease == lease, detailOrdinal == request, retainedRunId == run.id,
        let latest = response.runs.first(where: { $0.id == run.id }) else { return }
      latestRunStates[run.id] = latest
    } catch { /* The inbox's refresh owns read-error presentation. */ }
  }

  func runAgain(_ id: String) async {
    guard let lease, !busy else { return }
    ordinal &+= 1
    detailOrdinal &+= 1
    readingQuery = nil
    let request = ordinal
    busy = true; mutationFailure = nil
    do { _ = try await gateway.scheduleCommand(.run(id: id), lease: lease) }
    catch is CancellationError { if owns(lease, request) { busy = false }; return }
    catch { if owns(lease, request) { mutationFailure = RemoteIntegrationsFailure.map(error) } }
    guard owns(lease, request) else { return }
    busy = false
    await load()
  }

  func mark(_ run: RemoteIntegrationsScheduleRun, unread: Bool? = nil, archived: Bool? = nil) async {
    var payload: [String: JSONValue] = ["id": .string(run.id)]
    if let unread { payload["unread"] = .bool(unread) }
    if let archived { payload["archived"] = .bool(archived) }
    await perform(.object(["kind": .string("update-state"), "payload": .object(payload)]))
  }

  func cancel(_ run: RemoteIntegrationsScheduleRun) async {
    await perform(.object(["kind": .string("cancel"), "id": .string(run.id)]))
  }

  private func query(cursor: String?, filter: String? = nil, search: String? = nil) -> JSONValue {
    var query: [String: JSONValue] = ["filter": .string(filter ?? self.filter), "limit": .number(50)]
    if let cursor { query["cursor"] = .string(cursor) }
    let clean = (search ?? self.search).trimmingCharacters(in: .whitespacesAndNewlines)
    if !clean.isEmpty { query["search"] = .string(clean) }
    return .object(query)
  }

  private func owns(_ lease: RemoteIntegrationsHostLease, _ request: UInt64) -> Bool {
    self.lease == lease && ordinal == request
  }
}
