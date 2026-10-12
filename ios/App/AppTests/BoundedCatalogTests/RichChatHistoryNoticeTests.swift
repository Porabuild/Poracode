import Foundation
import XCTest

@testable import App

/// B1 durable history-notice coverage through the real production paths:
/// `GeneratedRichChatRemoteAPI` → `RemoteAPIClient` → URLProtocol fixture,
/// the `SelectedRichChatSessionGateway` authority fence, the notice
/// controller, and the real `AppSession` declaration/reconciliation graph.
@MainActor
final class RichChatHistoryNoticeTests: XCTestCase {
  private var fixture: BoundedCatalogHostFixture!

  override func setUp() {
    super.setUp()
    fixture = BoundedCatalogHostFixture()
    fixture.setThreads([.make(id: "t1")])
    fixture.setProjects([.make(id: "p1")])
    fixture.runtimeHistoryNoticesVersions = [1]
    fixture.boundedCatalogChangesVersions = [1]
    BoundedCatalogURLProtocol.install(fixture)
  }

  override func tearDown() {
    BoundedCatalogURLProtocol.reset()
    super.tearDown()
  }

  // MARK: - Helpers

  private func iso(_ seconds: Int64) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date(timeIntervalSince1970: Double(seconds)))
  }

  private func seedTurns(count: Int) {
    fixture.setTurns(
      (0 ..< count).map { index in
        .init(
          startedAt: iso(Int64(index) * 2 + 1),
          endedAt: iso(Int64(index) * 2 + 2),
          anchorItemId: index.isMultiple(of: 3) ? nil : "item-\(index)"
        )
      },
      forThread: "t1"
    )
  }

  private func notice(
    reason: String = "thread-events",
    events: Int = 12,
    bytes: Int = 4096,
    source: String = "exact",
    acknowledged: Int = 1
  ) -> RemoteHistoryNotice {
    RemoteHistoryNotice(
      kind: "history-incomplete",
      source: source,
      reason: reason,
      refusedEvents: events,
      refusedBytes: bytes,
      acknowledgedCount: acknowledged,
      firstAcknowledgedAt: 1_700_000_000,
      lastAcknowledgedAt: 1_700_000_001
    )
  }

  private func gap(
    token: String = "gap2:e00000000-0000-4000-8000-000000000001",
    reason: String = "thread-events",
    events: Int = 7,
    bytes: Int = 2048,
    source: String = "exact"
  ) -> RemoteHistoryGapDescriptor {
    RemoteHistoryGapDescriptor(
      token: token,
      source: source,
      reason: reason,
      refusedEvents: events,
      refusedBytes: bytes,
      createdAt: 1_700_000_000
    )
  }

  private struct Harness {
    var client: RemoteAPIClient
    var box: RemoteAPIClientBox
    var api: GeneratedRichChatRemoteAPI
    var gateway: SelectedRichChatSessionGateway
    var controller: RichChatTranscriptController
    var access: RichChatSessionAccess
    var target: RichChatThreadTarget
  }

  private func makeHarness(declared: Bool = true) async -> Harness {
    let client = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    if declared {
      await client.observeEnvironmentCapabilities(makeEnvironment())
      await client.declareRuntimeHistoryNotices(true)
      await client.declareBoundedCatalogChanges(true)
    }
    let api = GeneratedRichChatRemoteAPI(json: client)
    let access = RichChatSessionAccess(
      lease: RichChatHostLease(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true,
      isReady: true,
      capabilities: [.sessionRead, .sessionOperate],
      runtimeHistoryNotices: declared
    )
    let gateway = SelectedRichChatSessionGateway(selectionProvider: {
      RichChatTransportSelection(access: access, api: api, terminalSocket: nil)
    })
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatThreadTarget(lease: access.lease, threadID: "t1")
    controller.activate(access: access, threadID: "t1")
    return Harness(
      client: client, box: RemoteAPIClientBox(client), api: api, gateway: gateway,
      controller: controller, access: access, target: target
    )
  }

  /// The descriptor shape a capable B1/B4 host advertises.
  private func makeEnvironment() -> RemoteEnvironmentDescriptor {
    RemoteEnvironmentDescriptor(
      protocolVersion: ProtocolConstants.remoteProtocolVersion,
      hostMode: nil,
      desktopId: "desk-a",
      label: "Desktop A",
      appVersion: "1.0.0",
      platform: "macOS",
      auth: .init(
        policy: ProtocolConstants.authPolicy,
        bootstrapMethods: [ProtocolConstants.bootstrapMethod],
        sessionMethods: [ProtocolConstants.sessionMethod],
        scopes: ProtocolConstants.standardScopes
      ),
      endpoints: .init(httpBaseUrl: "https://a.test", wsBaseUrl: "wss://a.test"),
      capabilities: .init(
        pushRouting: nil,
        browserForward: nil,
        terminalCursorSync: nil,
        sshEnvironments: nil,
        runtimeHistoryNotices: .init(versions: [1]),
        boundedCatalogChanges: .init(versions: [1])
      )
    )
  }

  func testBoxObservationForwardsToTheClient() async throws {
    let raw = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    let box = RemoteAPIClientBox(raw)
    let descriptor = try await raw.environment()
    XCTAssertTrue(descriptor.advertisesRuntimeHistoryNotices)
    await box.observeEnvironmentCapabilities(descriptor)
    let throughBox = await box.advertisedCapabilities()
    let direct = await raw.advertisedCapabilities
    XCTAssertTrue(throughBox.runtimeHistoryNotices, "throughBox=\(throughBox) direct=\(direct)")
    XCTAssertTrue(direct.runtimeHistoryNotices)
    await box.declareRuntimeHistoryNotices(true)
    let effective = await raw.effectiveNoticesDeclaration
    XCTAssertTrue(effective)
  }

  func testEnvironmentAdvertisementDecodesThroughTheGeneratedCodec() async throws {
    let client = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    let descriptor = try await client.environment()
    XCTAssertTrue(
      descriptor.advertisesRuntimeHistoryNotices,
      "caps=\(String(describing: descriptor.capabilities))"
    )
    XCTAssertTrue(descriptor.advertisesBoundedCatalogChanges)
    await client.observeEnvironmentCapabilities(descriptor)
    await client.declareRuntimeHistoryNotices(true)
    let advertised = await client.advertisedCapabilities
    XCTAssertTrue(advertised.runtimeHistoryNotices)
    let effective = await client.effectiveNoticesDeclaration
    XCTAssertTrue(effective)
  }

  // MARK: - Request-faithful reads

  func testDeclaredReadCarriesNoticeAndOmissionNeverClearsIt() async throws {
    let harness = await makeHarness()
    fixture.setNotice(notice(), forThread: "t1")
    seedTurns(count: 3)

    let snapshot = try await harness.api.richHistory(threadID: "t1", targetEntryCount: 40)
    XCTAssertEqual(snapshot.runtimeNotice, notice())
    let request = try XCTUnwrap(fixture.requests(matching: "/api/threads/t1/history").first)
    XCTAssertEqual(request.query["notices"], "v1")

    // An item page may carry the notice too.
    fixture.setHistoryItems(
      [
        PersistedRuntimeItem(
          id: "i1", type: "assistant_message", state: "completed", payload: nil, streams: [:]
        )
      ],
      forThread: "t1"
    )
    let page = try await harness.api.richHistoryPage(
      threadID: "t1", beforePosition: nil, limit: 10, targetEntryCount: 40
    )
    XCTAssertEqual(page.runtimeNotice, notice())
    let itemsRequest = try XCTUnwrap(
      fixture.requests(matching: "/api/threads/t1/history/items").first
    )
    XCTAssertEqual(itemsRequest.query["notices"], "v1")

    // The projection retains the notice when a later authoritative read omits
    // the field; only an authoritative value may replace it.
    let noticeController = RichChatNoticeController(gateway: harness.gateway)
    noticeController.activate(access: harness.access, threadID: "t1")
    noticeController.receiveAuthoritativeSnapshot(notice: snapshot.runtimeNotice)
    noticeController.receiveAuthoritativeSnapshot(notice: nil)
    XCTAssertEqual(noticeController.state.notice, notice())
  }

  func testTranscriptProjectionForwardsSnapshotAndItemPageNotices() async throws {
    let harness = await makeHarness()
    let noticeController = RichChatNoticeController(gateway: harness.gateway)
    noticeController.activate(access: harness.access, threadID: "t1")
    let controller = RichChatTranscriptController(
      gateway: harness.gateway, noticeProjection: noticeController
    )
    controller.activate(access: harness.access, threadID: "t1")
    fixture.setNotice(notice(), forThread: "t1")
    fixture.setHistoryItems(
      [
        PersistedRuntimeItem(
          id: "i1", type: "assistant_message", state: "completed", payload: nil, streams: [:]
        )
      ],
      forThread: "t1"
    )
    fixture.historyRuntimeNextCursor = 1

    await controller.loadHistory(targetEntryCount: 40)
    XCTAssertEqual(noticeController.state.notice, notice())

    // The older item page also carries the notice (continuation projection).
    await controller.loadOlder()
    let itemRequest = try XCTUnwrap(
      fixture.requests(matching: "/api/threads/t1/history/items").first
    )
    XCTAssertEqual(itemRequest.query["notices"], "v1")
    XCTAssertEqual(noticeController.state.notice, notice())
  }

  func testUndeclaredReadOnANoticeThreadIsRefusedTyped() async throws {
    let harness = await makeHarness()
    fixture.setNotice(notice(), forThread: "t1")
    seedTurns(count: 3)

    // A client that never observed the advertisement stays undeclared: the
    // host refuses the transcript read (409) instead of serving a transcript
    // the reader cannot reconcile. No silent downgrade.
    let client = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    let api = GeneratedRichChatRemoteAPI(json: client)
    do {
      _ = try await api.richHistory(threadID: "t1", targetEntryCount: 40)
      XCTFail("Expected the declared-read refusal")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.status, 409)
      XCTAssertEqual(error.code, "runtime_history_notice_unsupported")
    }
    // Through the selected gateway the same refusal is the typed `.rejected`
    // failure the transcript surface renders.
    let access = RichChatSessionAccess(
      lease: RichChatHostLease(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true,
      isReady: true,
      capabilities: [.sessionRead, .sessionOperate],
      runtimeHistoryNotices: false
    )
    let gateway = SelectedRichChatSessionGateway(selectionProvider: {
      RichChatTransportSelection(access: access, api: api, terminalSocket: nil)
    })
    do {
      _ = try await gateway.loadRichHistory(
        target: RichChatThreadTarget(lease: access.lease, threadID: "t1"),
        targetEntryCount: 40
      )
      XCTFail("Expected the gateway-mapped refusal")
    } catch let error as RichChatGatewayError {
      guard case .http(let statusCode, let code, _) = error else {
        return XCTFail("expected a typed http failure, got \(error)")
      }
      XCTAssertEqual(statusCode, 409)
      XCTAssertEqual(code, "runtime_history_notice_unsupported")
    }
    // The gap route is also declared-only and fails closed client-side before
    // any dispatch.
    do {
      _ = try await client.runtimeHistoryGap(threadId: "t1")
      XCTFail("Expected the declared-only refusal")
    } catch let error as RichChatGatewayError {
      XCTAssertEqual(error, .unavailable)
    }
    XCTAssertEqual(fixture.requestCount("/api/threads/t1/runtime/gap"), 0)
  }

  // MARK: - Gap descriptor + acknowledgement

  func testGapDescriptorReadAndExplicitAcknowledgementOutcomes() async throws {
    let harness = await makeHarness()
    let current = gap()
    fixture.setGap(current, forThread: "t1")
    seedTurns(count: 3)

    let read = try await harness.gateway.loadRichRuntimeGap(target: harness.target)
    XCTAssertEqual(read.gap, current)
    XCTAssertNil(read.notice)
    let request = try XCTUnwrap(fixture.requests(matching: "/api/threads/t1/runtime/gap").first)
    XCTAssertEqual(request.query["notices"], "v1")

    // Explicit acknowledgement with the caller's command id.
    let applied = try await harness.gateway.acknowledgeRichRuntimeGap(
      target: harness.target,
      episodeToken: current.token,
      commandID: "notice-ack:test-1"
    )
    guard case .applied(let appliedNotice, _) = applied else {
      return XCTFail("expected applied, got \(applied)")
    }
    XCTAssertEqual(appliedNotice.refusedEvents, current.refusedEvents)
    let ackRequest = try XCTUnwrap(
      fixture.requests(matching: "/api/threads/t1/runtime/gap/acknowledge").first
    )
    XCTAssertEqual(
      ackRequest.headers?[ProtocolConstants.commandIdHeader],
      "notice-ack:test-1"
    )

    // The applied acknowledgement is durable: the next descriptor read returns
    // the notice and no gap.
    let after = try await harness.gateway.loadRichRuntimeGap(target: harness.target)
    XCTAssertNil(after.gap)
    XCTAssertEqual(after.notice, appliedNotice)

    // Same token/command retry is `already` (idempotent receipt), zero writes.
    let already = try await harness.gateway.acknowledgeRichRuntimeGap(
      target: harness.target,
      episodeToken: current.token,
      commandID: "notice-ack:test-1"
    )
    guard case .already(let sameNotice) = already else {
      return XCTFail("expected already, got \(already)")
    }
    XCTAssertEqual(sameNotice, appliedNotice)

    // A token that matches neither the stored acknowledgement nor the current
    // episode is `stale` and returns the truthful current descriptor (the host
    // checks the idempotent stored token first, so a replay of the acked token
    // stays `already` even after a replacement episode opens).
    let replacement = gap(
      token: "gap2:e00000000-0000-4000-8000-000000000002", events: 3, bytes: 512
    )
    fixture.setGap(replacement, forThread: "t1")
    let neverAcknowledged = "gap2:e00000000-0000-4000-8000-000000000099"
    let stale = try await harness.gateway.acknowledgeRichRuntimeGap(
      target: harness.target,
      episodeToken: neverAcknowledged,
      commandID: "notice-ack:test-2"
    )
    guard case .stale(let currentDescriptor) = stale else {
      return XCTFail("expected stale, got \(stale)")
    }
    XCTAssertEqual(currentDescriptor, replacement)
  }

  // MARK: - Notice controller

  private func makeNoticeController(
    gateway: RichChatControllerGatewayFake,
    access: RichChatSessionAccess
  ) -> RichChatNoticeController {
    let controller = RichChatNoticeController(gateway: gateway)
    controller.activate(access: access, threadID: "t1")
    return controller
  }

  private func noticeAccess(capable: Bool = true) -> RichChatSessionAccess {
    RichChatSessionAccess(
      lease: RichChatHostLease(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true,
      isReady: true,
      capabilities: [.sessionRead, .sessionOperate],
      runtimeHistoryNotices: capable
    )
  }

  func testControllerReadsDescriptorOnRetryableFailureAndAcknowledges() async throws {
    let gateway = RichChatControllerGatewayFake()
    let access = noticeAccess()
    let controller = makeNoticeController(gateway: gateway, access: access)
    let current = gap()
    await gateway.configureGapRead(
      .value(RemoteHistoryGapRead(gap: current, notice: nil))
    )
    await gateway.configureAck([
      .value(
        .applied(notice: notice(events: current.refusedEvents), supersededAcceptedEvents: 0)
      )
    ])

    // Ordinary provider errors do not open the recovery read.
    controller.authoritativeReadFailed(.rejected(statusCode: 500, code: "provider_error"))
    try await Task.sleep(for: .milliseconds(30))
    var gapReads = await gateway.gapReadCount
    XCTAssertEqual(gapReads, 0, "a plain provider error is not a durable gap")
    // A persistence identity refusal is a host gap signal and does open it.
    controller.authoritativeReadFailed(.rejected(
      statusCode: 500, code: "persistence_identity_invalid"
    ))
    try await waitUntil("identity refusal opens the read") { await gateway.gapReadCount == 1 }
    gapReads = await gateway.gapReadCount

    // A persistence-fence refusal does, through the capability-gated route.
    controller.authoritativeReadFailed(.rejected(statusCode: 503, code: "persistence_degraded"))
    try await waitUntil("descriptor read") { await gateway.gapReadCount == 1 }
    XCTAssertEqual(controller.state.episode, current)
    gapReads = await gateway.gapReadCount

    // Explicit acknowledgement; the controller never auto-acks.
    var ackCount = await gateway.ackTokens.count
    XCTAssertEqual(ackCount, 0)
    await controller.acknowledgeCurrentEpisode()
    XCTAssertNil(controller.state.episode)
    XCTAssertEqual(controller.state.notice?.refusedEvents, current.refusedEvents)
    ackCount = await gateway.ackTokens.count
    XCTAssertEqual(ackCount, 1)
    XCTAssertEqual(gapReads, 1)
  }

  func testStaleAcknowledgementShowsCurrentDescriptorAndNeverAutoAcks() async throws {
    let gateway = RichChatControllerGatewayFake()
    let controller = makeNoticeController(gateway: gateway, access: noticeAccess())
    let first = gap()
    let replacement = gap(
      token: "gap2:e00000000-0000-4000-8000-000000000003", events: 1, bytes: 64
    )
    await gateway.configureGapRead(.value(RemoteHistoryGapRead(gap: first, notice: nil)))
    await gateway.configureAck([.value(.stale(current: replacement))])
    await controller.refreshDescriptor()
    await controller.acknowledgeCurrentEpisode()

    XCTAssertEqual(controller.state.episode, replacement)
    XCTAssertFalse(controller.state.ackUncertain)
    let tokens = await gateway.ackTokens
    let commandIDs = await gateway.ackCommandIDs
    XCTAssertEqual(tokens, [first.token])
    XCTAssertEqual(commandIDs.count, 1)

    // A second explicit action for the replacement token mints a new command id.
    await gateway.configureAck([.value(.stale(current: nil))])
    await controller.acknowledgeCurrentEpisode()
    let replacementTokens = await gateway.ackTokens
    XCTAssertEqual(replacementTokens.last, replacement.token)
    let replacementIDs = await gateway.ackCommandIDs
    XCTAssertNotEqual(replacementIDs.last, commandIDs.first)
  }

  func testUncertainAcknowledgementRetainsExactCommandIDForRetry() async throws {
    let gateway = RichChatControllerGatewayFake()
    let controller = makeNoticeController(gateway: gateway, access: noticeAccess())
    let current = gap()
    await gateway.configureGapRead(.value(RemoteHistoryGapRead(gap: current, notice: nil)))
    await gateway.configureAck([
      .failure(.ambiguousOutcome),
      .value(
        .applied(notice: notice(events: current.refusedEvents), supersededAcceptedEvents: 0)
      ),
    ])
    await controller.refreshDescriptor()
    await controller.acknowledgeCurrentEpisode()

    XCTAssertTrue(controller.state.ackUncertain)
    XCTAssertEqual(controller.state.episode, current, "the episode is retained for retry")
    var commandIDs = await gateway.ackCommandIDs
    XCTAssertEqual(commandIDs.count, 1)

    // The retry is the SAME idempotent operation: exact command id and token.
    controller.retryAfterUncertainAcknowledgement()
    await controller.acknowledgeCurrentEpisode()
    commandIDs = await gateway.ackCommandIDs
    XCTAssertEqual(commandIDs.count, 2)
    XCTAssertEqual(commandIDs[0], commandIDs[1])
    let tokens = await gateway.ackTokens
    XCTAssertEqual(tokens, [current.token, current.token])
    XCTAssertFalse(controller.state.ackUncertain)
    XCTAssertNil(controller.state.episode)
    XCTAssertNotNil(controller.state.notice)
  }

  func testIncapableAuthorityNeverReadsOrAcknowledges() async throws {
    let gateway = RichChatControllerGatewayFake()
    let controller = makeNoticeController(gateway: gateway, access: noticeAccess(capable: false))
    controller.authoritativeReadFailed(.rejected(statusCode: 503, code: "persistence_degraded"))
    controller.receiveAuthoritativeSnapshot(notice: notice())
    await controller.refreshDescriptor()
    await controller.acknowledgeCurrentEpisode()
    let reads = await gateway.gapReadCount
    let acks = await gateway.ackTokens.count
    XCTAssertEqual(reads, 0)
    XCTAssertEqual(acks, 0)
    XCTAssertNil(controller.state.episode)
    // A notice already rendered stays rendered; the recovery surface is gated.
    XCTAssertNotNil(controller.state.notice)
  }

  // MARK: - Presentation + localization

  func testPresentationBranchesFollowTheRetainedState() async throws {
    let gateway = RichChatControllerGatewayFake()
    let controller = makeNoticeController(gateway: gateway, access: noticeAccess())
    XCTAssertNil(controller.presentation, "a clean thread shows nothing")

    // Durable notice: rendered, never acknowledged again.
    controller.receiveAuthoritativeSnapshot(notice: notice())
    let durable = try XCTUnwrap(controller.presentation)
    XCTAssertEqual(durable.action, .none)
    XCTAssertTrue(durable.message.contains("at least"), "a truthful lower bound, not exact loss")
    XCTAssertFalse(durable.message.contains("12") && durable.message.contains("exactly"))

    // Current episode: explicit acknowledgement, busy while in flight.
    await gateway.configureGapRead(.value(RemoteHistoryGapRead(gap: gap(), notice: nil)))
    await controller.refreshDescriptor()
    XCTAssertEqual(controller.presentation?.action, .acknowledge)
    XCTAssertEqual(controller.presentation?.isBusy, false)

    // Uncertain acknowledgement: retry with the retained identity.
    await gateway.configureAck([.failure(.ambiguousOutcome)])
    await controller.acknowledgeCurrentEpisode()
    XCTAssertEqual(controller.presentation?.action, .retryAcknowledgement)
    XCTAssertEqual(controller.presentation?.failureText, RichChatNoticeStrings.uncertain)
  }

  func testPresentationRequiresTheAdvertisedCapabilityForDescriptorRecovery() async throws {
    let gateway = RichChatControllerGatewayFake()
    let capable = makeNoticeController(gateway: gateway, access: noticeAccess())
    await gateway.configureGapRead(.failure(.transport))
    capable.authoritativeReadFailed(.rejected(statusCode: 503, code: "persistence_degraded"))
    try await waitUntil("descriptor failure") { capable.state.descriptorFailure != nil }
    XCTAssertEqual(capable.presentation?.action, .retryDescriptor)

    // An incapable authority never shows a recovery surface.
    let incapable = makeNoticeController(gateway: gateway, access: noticeAccess(capable: false))
    incapable.authoritativeReadFailed(.rejected(statusCode: 503, code: "persistence_degraded"))
    try await Task.sleep(for: .milliseconds(30))
    XCTAssertNil(incapable.presentation)
  }

  func testLowerBoundAndReasonStringsAreLocalizedInEveryCatalog() throws {
    let keys = [
      "bounded_read_error_reads_echo_mismatch",
      "bounded_read_error_bounded_response_invalid",
      "bounded_read_error_cursor_mismatch",
      "bounded_read_error_route_unavailable",
      "bounded_read_error_membership_response_invalid",
      "rich_chat_notice_title",
      "rich_chat_notice_explainer",
      "rich_chat_notice_acknowledge",
      "rich_chat_notice_acknowledging",
      "rich_chat_notice_retry",
      "rich_chat_notice_uncertain",
      "rich_chat_notice_read_failed",
      "rich_chat_notice_episode_title",
      "rich_chat_notice_episode_explainer",
      "rich_chat_notice_lower_bound_events",
      "rich_chat_notice_lower_bound_bytes",
      "rich_chat_notice_evidence_exact",
      "rich_chat_notice_evidence_suspect",
    ] + [
      "thread-events", "thread-bytes", "global-events", "global-bytes", "oversize", "age",
      "degraded", "rebase-dropped", "shutdown", "unclean-epoch",
    ].map { "rich_chat_notice_reason_\($0.replacingOccurrences(of: "-", with: "_"))" }
    let locales = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let bundle = Bundle(for: Self.self)
    var englishPlaceholders: [String: [String]] = [:]
    for locale in locales {
      let path = try XCTUnwrap(
        bundle.path(
          forResource: "Localizable", ofType: "strings", inDirectory: nil,
          forLocalization: locale),
        "Compiled Localizable.strings missing for \(locale)"
      )
      let localeBundle = try XCTUnwrap(
        Bundle(path: URL(fileURLWithPath: path).deletingLastPathComponent().path)
      )
      for key in keys {
        let value = localeBundle.localizedString(forKey: key, value: nil, table: nil)
        XCTAssertFalse(value.isEmpty, "\(key)/\(locale) is empty")
        XCTAssertNotEqual(value, key, "\(key)/\(locale) is absent from compiled resources")
        let placeholders = Self.formatPlaceholders(in: value)
        if locale == "en" {
          englishPlaceholders[key] = placeholders
        } else {
          XCTAssertEqual(placeholders, englishPlaceholders[key], "\(key)/\(locale) placeholders")
        }
      }
    }
  }

  private static func formatPlaceholders(in value: String) -> [String] {
    let pattern = "%(?:\\d+\\$)?[@dfs]|%lld|%%"
    let regex = try? NSRegularExpression(pattern: pattern)
    let range = NSRange(value.startIndex ..< value.endIndex, in: value)
    return (regex?.matches(in: value, range: range) ?? []).compactMap { match in
      Range(match.range, in: value).map { String(value[$0]) }
    }.filter { $0 != "%%" }.sorted()
  }

  // MARK: - Session-level declaration + recovery

  private func richChatSuite(
    _ harness: BoundedCatalogSessionHarness
  ) async throws -> RichChatControllerSuite {
    harness.session.state.socketState = .online
    let suite = harness.session.makeRichChatControllerSuite()
    let access = try XCTUnwrap(harness.session.currentRichChatAccess)
    suite.select(access: access, threadID: "t1")
    harness.session.activeRichChatSuite = suite
    return suite
  }

  private func waitUntil(
    _ description: String,
    timeout: TimeInterval = 5,
    _ predicate: @escaping @MainActor () async -> Bool
  ) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if await predicate() { return }
      try? await Task.sleep(for: .milliseconds(10))
    }
    XCTFail("Timed out waiting for: \(description)")
  }

  func testStoredRestoreDeclaresNoticesAndGapRecoveryRunsThroughTheUI() async throws {
    fixture.setGap(gap(), forThread: "t1")
    seedTurns(count: 520)
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture, threadCount: 0, projectCount: 0
    )
    // The stored-restore preflight observed the same-authority advertisement
    // and declared on the client the socket and reads use.
    XCTAssertTrue(
      harness.session.state.runtimeHistoryNoticesDeclared,
      "paths=\(fixture.requests.map(\.path)) error=\(harness.session.globalError ?? "nil") phase=\(harness.session.phase)"
    )
    let box = try XCTUnwrap(harness.session.state.api as? RemoteAPIClientBox)
    let declared = await box.client.effectiveNoticesDeclaration
    XCTAssertTrue(declared)
    let url = try await box.client.websocketURL(ticket: "t", lastSeenSeq: 0)
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    XCTAssertEqual(
      components?.queryItems?.first(where: { $0.name == "notices" })?.value, "v1"
    )

    let suite = try await richChatSuite(harness)
    // The gap fence refuses the transcript; the failure projects into the
    // notice owner, which reads the capability-gated descriptor.
    await suite.refreshAuthoritativeHistory()
    if case .failed = suite.transcript.state.loadState {
      // expected: the host fence refuses a cursor-consistent read
    } else {
      XCTFail("expected the gap-fenced read to fail, got \(suite.transcript.state.loadState)")
    }
    try await waitUntil("descriptor read") { suite.notice.state.episode != nil }
    XCTAssertNotNil(suite.notice.state.episode)

    // The actual UI recovery action: explicit acknowledgement.
    await suite.notice.acknowledgeCurrentEpisode()
    XCTAssertNil(suite.notice.state.episode)
    XCTAssertNotNil(suite.notice.state.notice)

    // After `applied` the transcript re-baselines: the complete read now serves
    // the prefix and the durable notice survives.
    try await waitUntil("transcript reloads", timeout: 10) {
      suite.transcript.state.loadState == .loaded
    }
    XCTAssertEqual(suite.notice.state.notice?.refusedEvents, 7)
    XCTAssertEqual(suite.transcript.state.completedTurns.count, 200)
    XCTAssertNotNil(suite.transcript.state.olderTurnsCursor)
  }

  func testFailedCapabilityFetchStartsUndeclaredThenReconcilesOnceThroughTheBarrier() async throws {
    fixture.environmentFailures = 5
    seedTurns(count: 3)
    let socket = FakeLiveSocket()
    socket.upgradeDeclarationSnapshot = RemoteSocketUpgradeDeclarations(
      notices: false, catalogChanges: false
    )
    let (session, _, _) = try await makeSession(
      seedProfile: makeProfile(endpoint: "https://a.test"),
      seedToken: "token-1",
      apiFactory: { endpoint, token in
        RemoteAPIClientBox(
          RemoteAPIClient(
            endpoint: endpoint,
            accessToken: token,
            session: BoundedCatalogURLProtocol.makeSession()
          )
        )
      },
      socketFactory: { _ in socket }
    )
    await session.bootstrap()
    // The failed preflight is not an answer: the first installed socket is
    // truthfully undeclared.
    XCTAssertEqual(session.phase, .ready)
    XCTAssertFalse(session.state.runtimeHistoryNoticesDeclared)
    let box = try XCTUnwrap(session.state.api as? RemoteAPIClientBox)
    var declared = await box.client.effectiveNoticesDeclaration
    XCTAssertFalse(declared)

    // A fresh authoritative descriptor lands (the Online funnel) and the
    // one-shot reconcile flips the declaration and runs the existing
    // authoritative barrier before the socket is reconnected declared.
    await session.noteEnvironmentCapabilities(makeEnvironment())
    await session.reconcileCapabilityDeclarationsIfNeeded()
    declared = await box.client.effectiveNoticesDeclaration
    XCTAssertTrue(declared)
    try await waitUntil("resync barrier reconnects the captured socket") {
      socket.resumeAfterResyncSeqs.count == 1
    }

    // Exactly one reconcile per installed socket, no loop.
    let attemptsBefore = session.state.resyncAttemptId
    await session.reconcileCapabilityDeclarationsIfNeeded()
    try? await Task.sleep(for: .milliseconds(50))
    XCTAssertEqual(session.state.resyncAttemptId, attemptsBefore)
    XCTAssertEqual(socket.resumeAfterResyncSeqs.count, 1)
    XCTAssertEqual(
      socket.resumeAfterResyncSeqs, [fixture.snapshotSeq],
      "the barrier resumes at the committed reconnect cursor, not just once"
    )
    XCTAssertEqual(session.state.lastSeenSeq, fixture.snapshotSeq)
  }

  /// N3: a fresh pairing's FIRST socket must be built with the capabilities its
  /// own handshake advertised — no earlier authority, nothing persisted.
  func testFreshPairingFirstBuiltUpgradeURLDeclaresTheAdvertisedCapabilities() async throws {
    let (session, repo, _) = try await makeSession(
      apiFactory: { endpoint, token in
        RemoteAPIClientBox(
          RemoteAPIClient(
            endpoint: endpoint,
            accessToken: token,
            session: BoundedCatalogURLProtocol.makeSession()
          )
        )
      }
    )
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.pair(
      with: .init(manualBaseURL: "https://a.test", manualToken: "pair-credential")
    )

    XCTAssertEqual(session.phase, .ready)
    let box = try XCTUnwrap(session.state.api as? RemoteAPIClientBox)
    let notices = await box.client.effectiveNoticesDeclaration
    let catalogChanges = await box.client.effectiveCatalogChangesDeclaration
    XCTAssertTrue(notices)
    XCTAssertTrue(catalogChanges)
    let url = try await box.client.websocketURL(ticket: "t", lastSeenSeq: 0)
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    XCTAssertEqual(
      components?.queryItems?.first(where: { $0.name == "notices" })?.value, "v1"
    )
    XCTAssertEqual(
      components?.queryItems?.first(where: { $0.name == "catalogChanges" })?.value,
      "bounded-v1"
    )
  }
  /// N3: a host switch must declare from the switched host's own fresh
  /// handshake on its FIRST socket — and an incapable host must stay
  /// undeclared (no carry-over, no global/persisted capability).
  func testHostSwitchFirstBuiltUpgradeURLDeclaresOnlyTheSwitchedHostsCapabilities() async throws {
    fixture.desktopIdForHost = { host in host.contains("b.test") ? "desk-b" : "desk-a" }
    let (session, repo, _) = try await makeSession(
      apiFactory: { endpoint, token in
        RemoteAPIClientBox(
          RemoteAPIClient(
            endpoint: endpoint,
            accessToken: token,
            session: BoundedCatalogURLProtocol.makeSession()
          )
        )
      }
    )
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.pair(with: .init(manualBaseURL: "https://a.test", manualToken: "pair-a"))
    XCTAssertEqual(session.profile?.desktopId, "desk-a")

    // B is paired against a host that advertises neither capability.
    fixture.runtimeHistoryNoticesVersions = nil
    fixture.boundedCatalogChangesVersions = nil
    await session.pair(with: .init(manualBaseURL: "https://b.test", manualToken: "pair-b"))
    XCTAssertEqual(session.profile?.desktopId, "desk-b")
    let boxB = try XCTUnwrap(session.state.api as? RemoteAPIClientBox)
    let noticesB = await boxB.client.effectiveNoticesDeclaration
    let catalogChangesB = await boxB.client.effectiveCatalogChangesDeclaration
    XCTAssertFalse(noticesB)
    XCTAssertFalse(catalogChangesB)
    let urlB = try await boxB.client.websocketURL(ticket: "t", lastSeenSeq: 0)
    let componentsB = URLComponents(url: urlB, resolvingAgainstBaseURL: false)
    XCTAssertNil(componentsB?.queryItems?.first(where: { $0.name == "notices" }))
    XCTAssertNil(componentsB?.queryItems?.first(where: { $0.name == "catalogChanges" }))

    // Switching back to the capable host declares from A's own handshake on
    // the switched host's first socket.
    fixture.runtimeHistoryNoticesVersions = [1]
    fixture.boundedCatalogChangesVersions = [1]
    let hosts = try await session.deps.hostCatalog.snapshot()
    let hostA = try XCTUnwrap(hosts.hosts.first { $0.desktopId == "desk-a" })
    await session.switchHost(hostA.connectionId)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    let boxA = try XCTUnwrap(session.state.api as? RemoteAPIClientBox)
    let noticesA = await boxA.client.effectiveNoticesDeclaration
    let catalogChangesA = await boxA.client.effectiveCatalogChangesDeclaration
    XCTAssertTrue(noticesA)
    XCTAssertTrue(catalogChangesA)
    let urlA = try await boxA.client.websocketURL(ticket: "t", lastSeenSeq: 0)
    let componentsA = URLComponents(url: urlA, resolvingAgainstBaseURL: false)
    XCTAssertEqual(
      componentsA?.queryItems?.first(where: { $0.name == "notices" })?.value, "v1"
    )
    XCTAssertEqual(
      componentsA?.queryItems?.first(where: { $0.name == "catalogChanges" })?.value,
      "bounded-v1"
    )
  }

  func testCatalogSignalIsDeclaredOnlyWhenTheBoundedControllerIsNegotiated() async throws {
    seedTurns(count: 3)
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture, threadCount: 2, projectCount: 1
    )
    XCTAssertTrue(harness.session.catalog.isNegotiated)
    let box = try XCTUnwrap(harness.session.state.api as? RemoteAPIClientBox)
    await harness.session.declareBoundedCatalogChangesIfReady()
    let declared = await box.client.effectiveCatalogChangesDeclaration
    XCTAssertTrue(declared)
    let url = try await box.client.websocketURL(ticket: "t", lastSeenSeq: 0)
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    XCTAssertEqual(
      components?.queryItems?.first(where: { $0.name == "catalogChanges" })?.value,
      "bounded-v1"
    )
    XCTAssertEqual(
      components?.queryItems?.first(where: { $0.name == "notices" })?.value, "v1"
    )
  }

  func testLegacyShellNeverDeclaresTheCatalogSignal() async throws {
    fixture.declared = false
    seedTurns(count: 3)
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture, threadCount: 2, projectCount: 1
    )
    XCTAssertTrue(harness.session.catalog.isLegacyHost)
    let box = try XCTUnwrap(harness.session.state.api as? RemoteAPIClientBox)
    await harness.session.declareBoundedCatalogChangesIfReady()
    let declared = await box.client.effectiveCatalogChangesDeclaration
    XCTAssertFalse(declared, "a legacy shell keeps the full-list event form")
    let url = try await box.client.websocketURL(ticket: "t", lastSeenSeq: 0)
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    XCTAssertNil(components?.queryItems?.first(where: { $0.name == "catalogChanges" }))
  }

  // MARK: - Actual built upgrade request

  func testUpgradeDeclarationsAreRecordedFromTheBuiltRequest() async throws {
    let client = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    await client.observeEnvironmentCapabilities(try makeEnvironment())
    await client.declareRuntimeHistoryNotices(true)
    await client.declareBoundedCatalogChanges(true)

    let socket = RemoteWebSocketClient(api: client)
    await socket.start(lastSeenSeq: 0)
    try await waitUntil("upgrade recorded") {
      await socket.upgradeDeclarations != nil
    }
    let declarations = await socket.upgradeDeclarations
    XCTAssertEqual(
      declarations, RemoteSocketUpgradeDeclarations(notices: true, catalogChanges: true)
    )
    await socket.stop()

    // An undeclared client records the truthful absent declarations.
    let undeclared = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    let silentSocket = RemoteWebSocketClient(api: undeclared)
    await silentSocket.start(lastSeenSeq: 0)
    try await waitUntil("undeclared upgrade recorded") {
      await silentSocket.upgradeDeclarations != nil
    }
    let silent = await silentSocket.upgradeDeclarations
    XCTAssertEqual(
      silent, RemoteSocketUpgradeDeclarations(notices: false, catalogChanges: false)
    )
    await silentSocket.stop()
  }
}
