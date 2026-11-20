import Foundation
import Observation

struct HomeNewsHostSnapshot: Equatable, Sendable {
  var stats: SettingsProfileCoreStats?
  var usage: [SettingsUsageSnapshot] = []
  var settings: SettingsDocument?
  var mcpServers = 0
  var schedules: Int?
}

struct HomeNewsHostRequest: Equatable, Sendable {
  let lease: SettingsHostLease
  let utcOffsetMinutes: Double
}

protocol HomeNewsHostLoading: Sendable {
  func load(_ request: HomeNewsHostRequest) async throws -> HomeNewsHostSnapshot
}

/// Uses the existing exact-host adapters; every read retains its captured lease.
struct HomeNewsHostReader: HomeNewsHostLoading {
  let settings: any SettingsSessionGateway
  let integrations: any RemoteIntegrationsGateway

  func load(_ request: HomeNewsHostRequest) async throws -> HomeNewsHostSnapshot {
    async let stats = try? settings.profileCoreStats(.init(utcOffsetMinutes: request.utcOffsetMinutes, scope: .device, window: .all), lease: request.lease)
    async let usage = try? settings.providerUsage(lease: request.lease)
    async let document = try? settings.readSettings(lease: request.lease)
    async let servers = try? settings.readGlobalMCPSettings(lease: request.lease)
    let integrationLease = RemoteIntegrationsHostLease(connectionID: request.lease.connectionID, generation: request.lease.generation)
    async let schedules = try? integrations.schedules(lease: integrationLease)
    let values = await (stats, usage, document, servers, schedules)
    try Task.checkCancellation()
    return HomeNewsHostSnapshot(stats: values.0, usage: values.1?.snapshots ?? [], settings: values.2?.settings,
      mcpServers: values.3?.servers.count ?? 0, schedules: values.4?.schedules.count)
  }
}

@MainActor @Observable final class HomeNewsHostData {
  private(set) var lease: SettingsHostLease?
  private(set) var snapshot: HomeNewsHostSnapshot?
  @ObservationIgnored private let source: any HomeNewsHostLoading
  @ObservationIgnored private var ordinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var pendingRequest: HomeNewsHostRequest?
  @ObservationIgnored private var snapshotRequest: HomeNewsHostRequest?
  @ObservationIgnored private var cache: [CacheKey: Cached] = [:]
  private struct CacheKey: Hashable { let connectionID: ClientConnectionID; let offset: Double }
  private struct Cached { let snapshot: HomeNewsHostSnapshot; let at: Double }

  init(source: any HomeNewsHostLoading) { self.source = source }

  convenience init(session: AppSession) {
    self.init(source: HomeNewsHostReader(settings: session.makeSettingsSessionGateway(), integrations: session.makeRemoteIntegrationsGateway()))
  }

  func activate(_ selection: SettingsHostSelection?) {
    let next = selection.flatMap { $0.gate(.sessionRead) == nil ? $0.lease : nil }
    guard lease != next else { return }
    ordinal &+= 1
    task?.cancel()
    task = nil
    pendingRequest = nil
    snapshot = nil
    snapshotRequest = nil
    lease = next
  }

  func refresh(selection: SettingsHostSelection?, utcOffsetMinutes: Double,
    force: Bool = false, now: Double = Date().timeIntervalSince1970 * 1_000) async {
    activate(selection)
    guard let lease else { return }
    let request = HomeNewsHostRequest(lease: lease, utcOffsetMinutes: utcOffsetMinutes)
    if pendingRequest == request, let task { await task.value; return }
    if pendingRequest != nil {
      ordinal &+= 1
      task?.cancel()
      task = nil
      pendingRequest = nil
    }
    let key = CacheKey(connectionID: lease.connectionID, offset: utcOffsetMinutes)
    if !force, let cached = cache[key], cached.snapshot.stats != nil, now >= cached.at, now - cached.at < 10 * 60_000 {
      snapshot = cached.snapshot
      snapshotRequest = request
      return
    }
    if snapshotRequest != request {
      snapshot = nil
      snapshotRequest = nil
    }
    ordinal &+= 1
    let captured = ordinal
    task?.cancel()
    pendingRequest = request
    let source = source
    let pending = Task {
      defer {
        if ordinal == captured { task = nil; pendingRequest = nil }
      }
      do {
        let value = try await source.load(request)
        try Task.checkCancellation()
        guard self.lease == lease, ordinal == captured else { return }
        snapshot = value
        snapshotRequest = request
        cache[key] = Cached(snapshot: value, at: now)
        if cache.count > 8, let oldest = cache.min(by: { $0.value.at < $1.value.at })?.key { cache.removeValue(forKey: oldest) }
      } catch { }
    }
    task = pending
    await pending.value
  }
}
