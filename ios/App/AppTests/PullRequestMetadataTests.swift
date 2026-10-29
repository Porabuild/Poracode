import Foundation
import XCTest

@testable import App

/// Review metadata: labels, requested reviewers, the timeline, and the three write flows.
@MainActor
final class PullRequestMetadataTests: XCTestCase {
  private static let enabled = #"{"labels":true,"reviewRequests":true,"convertToDraft":true}"#

  // MARK: - Decoding

  func testDetailsProjectionDecodesLabelsRequestedReviewersAndTimeline() throws {
    let details = try document(
      """
      {
        "details": {
          \(Self.requiredDetailsFields),
          "labels": [
            { "name": "bug", "color": "d73a4a", "description": "Something is broken" },
            { "name": "triage" },
            { "name": "bug", "color": "000000" },
            { "color": "ffffff" }
          ],
          "requestedReviewers": [
            { "id": "u-1", "login": "reviewer", "name": "Rev Iewer", "avatarUrl": "https://example.test/a.png" },
            { "id": "t-1", "login": "core", "team": true },
            { "login": "missing-id" }
          ],
          "timeline": [
            { "id": "e1", "kind": "labeled", "createdAt": "2026-10-01T10:00:00Z",
              "actor": { "login": "octocat" }, "label": { "name": "bug", "color": "d73a4a" } },
            { "id": "e2", "kind": "review-requested", "createdAt": "2026-10-01T10:01:00.250Z",
              "reviewer": { "id": "t-1", "login": "core", "team": true } },
            { "id": "e3", "kind": "base-changed", "createdAt": "2026-10-01T10:02:00Z",
              "fromRef": "main", "toRef": "release" }
          ]
        }
      }
      """
    )

    let projected = try XCTUnwrap(PullRequestReviewProjection.details(details))
    XCTAssertEqual(projected.labels.map(\.name), ["bug", "triage"])
    XCTAssertEqual(projected.labels.first?.color, "d73a4a")
    XCTAssertEqual(projected.labels.first?.detail, "Something is broken")
    XCTAssertNil(projected.labels.last?.color)
    XCTAssertEqual(projected.requestedReviewers.map(\.id), ["u-1", "t-1"])
    XCTAssertEqual(projected.requestedReviewers.first?.displayName, "Rev Iewer")
    XCTAssertEqual(projected.requestedReviewers.last?.displayName, "core")
    XCTAssertEqual(projected.requestedReviewers.map(\.isTeam), [false, true])
    XCTAssertEqual(projected.timeline.map(\.kind), [.labeled, .reviewRequested, .baseChanged])
    XCTAssertEqual(projected.timeline.first?.actor?.login, "octocat")
    XCTAssertEqual(projected.timeline.first?.label?.name, "bug")
    XCTAssertEqual(projected.timeline[1].reviewer?.isTeam, true)
    XCTAssertEqual(projected.timeline[2].fromRef, "main")
    XCTAssertEqual(projected.timeline[2].toRef, "release")
  }

  /// A details payload shaped like the release before review metadata: none of the new fields.
  func testPreUpgradeDetailsPayloadStillRenders() throws {
    let details = try document(
      """
      {
        "details": {
          \(Self.requiredDetailsFields),
          "author": { "login": "octocat" },
          "commits": [], "comments": [], "reviews": [], "checks": []
        }
      }
      """
    )

    let projected = try XCTUnwrap(PullRequestReviewProjection.details(details))
    XCTAssertEqual(projected.title, "Ship native review")
    XCTAssertEqual(projected.author?.login, "octocat")
    XCTAssertTrue(projected.labels.isEmpty)
    XCTAssertTrue(projected.requestedReviewers.isEmpty)
    XCTAssertTrue(projected.timeline.isEmpty)
  }

  func testPullRequestListRowsCarryLabelsAndAnOlderHostOmitsThem() throws {
    let row: (String, [String: GitHubJSONValue]) -> GitHubJSONValue = { number, extra in
      var object: [String: GitHubJSONValue] = [
        "pr": .object([
          "number": .integer(Int64(number) ?? 0), "title": .string("Row \(number)"),
          "state": .string("open"), "isDraft": .bool(false),
        ]),
        "headBranch": .string("feature"),
      ]
      object.merge(extra) { _, new in new }
      return .object(object)
    }
    let labeled = row("1", ["labels": .array([.object(["name": .string("bug"), "color": .string("d73a4a")])])])
    let legacy = row("2", [:])
    let rows = try XCTUnwrap(
      GitHubResultProjection.pullRequests(
        GitHubOperationsSamples.result(.ghListPullRequests, object: ["pullRequests": .array([labeled, legacy])])
      )
    )

    XCTAssertEqual(rows.map(\.number), [1, 2])
    XCTAssertEqual(rows[0].labels.map(\.name), ["bug"])
    XCTAssertTrue(rows[1].labels.isEmpty)
  }

  func testTimelineSkipsUnknownKindsAndRowsMissingWhatTheirKindNeeds() throws {
    let rows = try [
      #"{ "id": "a", "kind": "future-kind", "createdAt": "2026-10-01T10:00:00Z" }"#,
      #"{ "id": "b", "kind": "labeled", "createdAt": "2026-10-01T10:00:00Z" }"#,
      #"{ "id": "c", "kind": "review-requested", "createdAt": "2026-10-01T10:00:00Z" }"#,
      #"{ "id": "d", "kind": "system", "createdAt": "2026-10-01T10:00:00Z" }"#,
      #"{ "id": "e", "kind": "system", "createdAt": "2026-10-01T10:00:00Z", "text": "Host note" }"#,
      #"{ "id": "e", "kind": "closed", "createdAt": "2026-10-01T10:00:00Z" }"#,
      #"{ "id": "f", "kind": "merged" }"#,
      #"{ "kind": "opened", "createdAt": "2026-10-01T10:00:00Z" }"#,
      #"{ "id": "g", "kind": "force-pushed", "createdAt": "2026-10-01T10:00:00Z" }"#,
    ].map { try JSONDecoder().decode(GitHubJSONValue.self, from: Data($0.utf8)) }
    let events = PullRequestTimelineProjection.events(.array(rows))

    XCTAssertEqual(events.map(\.id), ["e", "g"])
    XCTAssertEqual(events.map(\.kind), [.system, .forcePushed])
    XCTAssertEqual(PullRequestsStrings.timelineText(events[0]), "Host note")
  }

  func testEveryKnownTimelineKindHasRowTextAndASymbol() {
    let label = GitHubReviewLabel(name: "bug", color: nil, detail: nil)
    let reviewer = GitHubReviewerSummary(id: "u", login: "reviewer", name: nil, avatarURL: nil, isTeam: false)
    for kind in PullRequestTimelineKind.allCases {
      let event = PullRequestTimelineEvent(
        id: kind.rawValue, kind: kind, createdAt: "2026-10-01T10:00:00Z", actor: nil, label: label,
        reviewer: reviewer, fromRef: "old", toRef: "new", text: "Host note"
      )
      XCTAssertNotNil(PullRequestsStrings.timelineText(event), kind.rawValue)
      XCTAssertFalse(kind.symbol.isEmpty, kind.rawValue)
    }
    XCTAssertEqual(PullRequestTimelineKind.allCases.count, 14)
  }

  func testTimelineTimeParsesWholeAndFractionalSecondsAndRejectsGarbage() {
    XCTAssertNotNil(PullRequestTimelineTime.relative("2026-10-01T10:00:00Z"))
    XCTAssertNotNil(PullRequestTimelineTime.relative("2026-10-01T10:00:00.123Z"))
    XCTAssertNil(PullRequestTimelineTime.relative("yesterday"))
  }

  func testLabelColorIsHexOnlyAndOtherwiseNeutral() throws {
    let red = try XCTUnwrap(GitHubReviewLabel(name: "x", color: "ff0000", detail: nil).rgb)
    XCTAssertEqual(red.red, 1, accuracy: 0.001)
    XCTAssertEqual(red.green, 0, accuracy: 0.001)
    XCTAssertEqual(red.blue, 0, accuracy: 0.001)
    XCTAssertNotNil(GitHubReviewLabel(name: "x", color: "D73A4A", detail: nil).rgb)
    for bad in ["#ff0000", "ff00", "ff00000", "gg0000", "", "ff 000"] {
      XCTAssertNil(GitHubReviewLabel(name: "x", color: bad, detail: nil).rgb, bad)
    }
    XCTAssertNil(GitHubReviewLabel(name: "x", color: nil, detail: nil).rgb)
  }

  // MARK: - Edit staging

  func testLabelDeltaSendsOnlyTheDifferenceSorted() {
    let change = PullRequestLabelEdit.delta(current: ["bug", "docs"], selected: ["docs", "zeta", "alpha"])
    XCTAssertEqual(change.add, ["alpha", "zeta"])
    XCTAssertEqual(change.remove, ["bug"])
    let none = PullRequestLabelEdit.delta(current: ["bug"], selected: ["bug"])
    XCTAssertTrue(none.add.isEmpty && none.remove.isEmpty)
  }

  func testReviewerEditStagesAndUnstagesWithinTheHostLimit() {
    let user = GitHubReviewerSummary(id: "u", login: "user", name: nil, avatarURL: nil, isTeam: false)
    let team = GitHubReviewerSummary(id: "t", login: "core", name: nil, avatarURL: nil, isTeam: true)
    var edit = PullRequestReviewerEdit()
    XCTAssertTrue(edit.isEmpty)
    edit.toggleAdded(user)
    edit.toggleRemoved(team)
    XCTAssertTrue(edit.isAdded(user))
    XCTAssertTrue(edit.isRemoved(team))
    XCTAssertFalse(edit.isEmpty)
    edit.toggleAdded(user)
    edit.toggleRemoved(team)
    XCTAssertTrue(edit.isEmpty)

    for index in 0...PullRequestReviewerEdit.maximumChanges {
      edit.toggleAdded(
        GitHubReviewerSummary(id: "u\(index)", login: "u\(index)", name: nil, avatarURL: nil, isTeam: false))
    }
    XCTAssertFalse(edit.isWithinLimits)
  }

  func testReviewerSearchTextIsTrimmedAndBoundedOnACharacterBoundary() {
    XCTAssertEqual(PullRequestReviewerEdit.boundedQuery("  alice \n"), "alice")
    let long = String(repeating: "😀", count: 300)
    let bounded = PullRequestReviewerEdit.boundedQuery(long)
    XCTAssertLessThanOrEqual(bounded.utf16.count, PullRequestReviewerEdit.maximumQueryLength)
    XCTAssertEqual(bounded, String(repeating: "😀", count: PullRequestReviewerEdit.maximumQueryLength / 2))
  }

  // MARK: - Wire

  func testTheFiveOperationsAreAccountScopedWireProceduresWithTheContractScopes() throws {
    let expected: [(ForgeReviewOperation, GitHubProcedureScope, Bool)] = [
      (.forgeListPrLabelCandidates, .read, true),
      (.forgeListPrReviewerCandidates, .read, true),
      (.forgeSetPrLabels, .operate, false),
      (.forgeRequestPrReviewers, .operate, false),
      (.forgeConvertPrToDraft, .operate, false),
    ]
    for (operation, scope, hasResult) in expected {
      XCTAssertEqual(operation.scope, scope, operation.rawValue)
      XCTAssertEqual(operation.hasResult, hasResult, operation.rawValue)
      XCTAssertNoThrow(try ForgeReviewRemoteV3Contract.checkMetadata(operation), operation.rawValue)
    }
    // The wire names native does not use yet stay out of the operation set.
    XCTAssertEqual(
      Set(ForgeReviewOperation.allCases.map(\.rawValue)),
      [
        "forgeClosePr", "forgeConvertPrToDraft", "forgeCreatePr", "forgeEditPr", "forgeEditPrComment",
        "forgeGetPrChecks", "forgeGetPrDetails", "forgeGetPrDiff", "forgeGetPrFiles", "forgeGetPrForBranch",
        "forgeGetPrReviewComments", "forgeGetPrReviewGuide", "forgeGetPrViewedFiles", "forgeGetRepository",
        "forgeListPrLabelCandidates", "forgeListPrReviewerCandidates", "forgeListPrs",
        "forgeListPullRequests", "forgeMarkPrReady", "forgeMergePr", "forgeMergePrAtHead",
        "forgePostPrComment", "forgeReopenPr", "forgeRequestPrReviewers", "forgeSetPrFileViewed",
        "forgeSetPrLabels", "forgeSubmitPrReview", "forgeUpdatePrBranch", "forgeWritePrReviewGuide",
      ]
    )
  }

  func testGeneratedCodecsAcceptTheExactRequestAndResultShapes() throws {
    let scoped = try scopedPayload([:])
    for operation: ForgeReviewOperation in [.forgeListPrLabelCandidates, .forgeConvertPrToDraft] {
      XCTAssertNoThrow(try ForgeReviewRemoteV3Contract.request(operation, payload: scoped), operation.rawValue)
    }
    XCTAssertNoThrow(
      try ForgeReviewRemoteV3Contract.request(
        .forgeListPrReviewerCandidates, payload: try scopedPayload(["query": .string("ali")])))
    XCTAssertNoThrow(
      try ForgeReviewRemoteV3Contract.request(
        .forgeSetPrLabels,
        payload: try scopedPayload(["add": .array([.string("bug")]), "remove": .array([])])))
    XCTAssertNoThrow(
      try ForgeReviewRemoteV3Contract.request(
        .forgeRequestPrReviewers,
        payload: try scopedPayload([
          "add": .array([.object(["id": .string("t-1"), "team": .bool(true)])]), "remove": .array([]),
        ])))

    let body = try ForgeReviewRemoteV3Contract.request(
      .forgeSetPrLabels,
      payload: try scopedPayload(["add": .array([.string("bug")]), "remove": .array([.string("old")])])
    )
    let envelope = try XCTUnwrap(JSONDecoder().decode(GitHubJSONValue.self, from: body).objectValue)
    XCTAssertEqual(envelope["procedure"]?.stringValue, "forgeSetPrLabels")
    XCTAssertEqual(envelope["payload"]?.objectValue?["add"], .array([.string("bug")]))

    let labels = try ForgeReviewRemoteV3Contract.result(
      .forgeListPrLabelCandidates,
      response: Data(#"{"result":{"labels":[{"name":"bug","color":"d73a4a"}],"truncated":true}}"#.utf8)
    )
    XCTAssertEqual(GitHubResultProjection.labels(labels["labels"]).map(\.name), ["bug"])
    XCTAssertEqual(labels["truncated"]?.boolValue, true)
    let reviewers = try ForgeReviewRemoteV3Contract.result(
      .forgeListPrReviewerCandidates,
      response: Data(#"{"result":{"reviewers":[{"id":"t-1","login":"core","team":true}],"truncated":false}}"#.utf8)
    )
    XCTAssertEqual(GitHubResultProjection.reviewers(reviewers["reviewers"]).map(\.isTeam), [true])
    for operation: ForgeReviewOperation in [.forgeSetPrLabels, .forgeRequestPrReviewers, .forgeConvertPrToDraft] {
      XCTAssertNoThrow(try ForgeReviewRemoteV3Contract.result(operation, response: Data("{}".utf8)))
      XCTAssertThrowsError(try ForgeReviewRemoteV3Contract.result(operation, response: Data(#"{"extra":1}"#.utf8)))
    }
  }

  func testEachOperationSendsTheSelectedAccountRepositoryAndNumberPlusItsOwnFields() async throws {
    let gateway = MetadataGateway()
    let controller = ForgeReviewController(gateway: gateway, cache: scratchCache())
    await controller.select(context: GitHubOperationsSamples.context, sourceData: sourceData(Self.enabled), number: 7)
    await gateway.reset()

    let labels = await controller.candidates(.forgeListPrLabelCandidates)
    XCTAssertEqual(GitHubResultProjection.labels(labels?["labels"]).map(\.name), ["bug"])
    let reviewers = await controller.candidates(
      .forgeListPrReviewerCandidates, fields: ["query": .string("ali")])
    XCTAssertEqual(GitHubResultProjection.reviewers(reviewers?["reviewers"]).map(\.login), ["alice"])
    let labelsSet = await controller.setLabels(add: ["bug"], remove: ["docs"])
    XCTAssertTrue(labelsSet)
    let user = GitHubReviewerSummary(id: "u-1", login: "user", name: nil, avatarURL: nil, isTeam: false)
    let team = GitHubReviewerSummary(id: "t-1", login: "core", name: nil, avatarURL: nil, isTeam: true)
    let former = GitHubReviewerSummary(id: "u-2", login: "former", name: nil, avatarURL: nil, isTeam: false)
    let requested = await controller.requestReviewers(add: [user, team], remove: [former])
    XCTAssertTrue(requested)
    let drafted = await controller.convertToDraft()
    XCTAssertTrue(drafted)

    let writes = await gateway.calls.filter { $0.0.scope == .operate || $0.0.rawValue.contains("Candidates") }
    XCTAssertEqual(
      writes.map { $0.0 },
      [
        .forgeListPrLabelCandidates, .forgeListPrReviewerCandidates, .forgeSetPrLabels,
        .forgeRequestPrReviewers, .forgeConvertPrToDraft,
      ])
    XCTAssertEqual(writes[0].1.value, try expected([:]))
    XCTAssertEqual(writes[1].1.value, try expected(["query": .string("ali")]))
    XCTAssertEqual(
      writes[2].1.value, try expected(["add": .array([.string("bug")]), "remove": .array([.string("docs")])]))
    XCTAssertEqual(
      writes[3].1.value,
      try expected([
        "add": .array([
          .object(["id": .string("u-1")]), .object(["id": .string("t-1"), "team": .bool(true)]),
        ]),
        "remove": .array([.object(["id": .string("u-2")])]),
      ]))
    XCTAssertEqual(writes[4].1.value, try expected([:]))
  }

  func testAWriteRefreshesTheReviewAfterItSucceeds() async throws {
    let gateway = MetadataGateway()
    let controller = ForgeReviewController(gateway: gateway, cache: scratchCache())
    await controller.select(context: GitHubOperationsSamples.context, sourceData: sourceData(Self.enabled), number: 7)
    await gateway.reset()

    let accepted = await controller.convertToDraft()

    XCTAssertTrue(accepted)
    let operations = await gateway.calls.map { $0.0 }
    XCTAssertEqual(operations.first, .forgeConvertPrToDraft)
    XCTAssertTrue(operations.contains(.forgeGetPrDetails))
  }

  func testAFailedWriteSurfacesTheFailureAndIsNotRepeated() async throws {
    let gateway = MetadataGateway()
    let controller = ForgeReviewController(gateway: gateway, cache: scratchCache())
    await controller.select(context: GitHubOperationsSamples.context, sourceData: sourceData(Self.enabled), number: 7)
    await gateway.failWrites()
    await gateway.reset()

    let accepted = await controller.setLabels(add: ["bug"], remove: [])

    XCTAssertFalse(accepted)
    XCTAssertEqual(controller.failure, .ambiguousOutcome)
    let operations = await gateway.calls.map { $0.0 }
    XCTAssertEqual(operations, [.forgeSetPrLabels])
  }

  // MARK: - Gating

  func testEveryEditIsHiddenUnlessItsCapabilityIsAdvertised() async throws {
    for capabilities in ["{}", #"{"labels":false,"reviewRequests":false,"convertToDraft":false}"#, #"{"viewedFiles":"host"}"#] {
      let gateway = MetadataGateway()
      let controller = ForgeReviewController(gateway: gateway, cache: scratchCache())
      await controller.select(context: GitHubOperationsSamples.context, sourceData: sourceData(capabilities), number: 7)
      await gateway.reset()

      for capability in ["labels", "reviewRequests", "convertToDraft"] {
        XCTAssertFalse(controller.offers(capability), "\(capabilities) \(capability)")
      }
      let labels = await controller.setLabels(add: ["bug"], remove: [])
      let reviewers = await controller.requestReviewers(
        add: [GitHubReviewerSummary(id: "u", login: "u", name: nil, avatarURL: nil, isTeam: false)], remove: [])
      let drafted = await controller.convertToDraft()
      XCTAssertFalse(labels || reviewers || drafted)
      let calls = await gateway.calls
      XCTAssertTrue(calls.isEmpty, capabilities)
    }
  }

  func testEachCapabilityEnablesOnlyItsOwnEdit() async throws {
    let gateway = MetadataGateway()
    let controller = ForgeReviewController(gateway: gateway, cache: scratchCache())
    await controller.select(
      context: GitHubOperationsSamples.context, sourceData: sourceData(#"{"labels":true}"#), number: 7)

    XCTAssertTrue(controller.offers("labels"))
    XCTAssertFalse(controller.offers("reviewRequests"))
    XCTAssertFalse(controller.offers("convertToDraft"))
  }

  func testAnEmptyChangeIsNeverSent() async throws {
    let gateway = MetadataGateway()
    let controller = ForgeReviewController(gateway: gateway, cache: scratchCache())
    await controller.select(context: GitHubOperationsSamples.context, sourceData: sourceData(Self.enabled), number: 7)
    await gateway.reset()

    let labels = await controller.setLabels(add: [], remove: [])
    let reviewers = await controller.requestReviewers(add: [], remove: [])

    XCTAssertFalse(labels || reviewers)
    let calls = await gateway.calls
    XCTAssertTrue(calls.isEmpty)
  }

  func testAReadOnlyGrantNeverWritesButStillListsCandidates() async throws {
    let gateway = MetadataGateway()
    let controller = ForgeReviewController(gateway: gateway, cache: scratchCache())
    let readOnly = GitHubControllerContext(lease: GitHubOperationsSamples.lease, grantedScopes: ["session:read"])
    await controller.select(context: readOnly, sourceData: sourceData(Self.enabled), number: 7)
    await gateway.reset()

    let drafted = await controller.convertToDraft()
    let labels = await controller.candidates(.forgeListPrLabelCandidates)

    XCTAssertFalse(controller.offers("convertToDraft"))
    XCTAssertFalse(drafted)
    XCTAssertNotNil(labels)
    let operations = await gateway.calls.map { $0.0 }
    XCTAssertEqual(operations, [.forgeListPrLabelCandidates])
  }

  func testCandidateLookupRefusesWriteOperationsAndIsNeverCached() async throws {
    let gateway = MetadataGateway()
    let controller = ForgeReviewController(gateway: gateway, cache: scratchCache())
    await controller.select(context: GitHubOperationsSamples.context, sourceData: sourceData(Self.enabled), number: 7)
    await gateway.reset()

    let refused = await controller.candidates(.forgeSetPrLabels)
    _ = await controller.candidates(.forgeListPrLabelCandidates)

    XCTAssertNil(refused)
    XCTAssertNil(controller.documents[.forgeListPrLabelCandidates])
    let operations = await gateway.calls.map { $0.0 }
    XCTAssertEqual(operations, [.forgeListPrLabelCandidates])
  }

  func testOfflineSnapshotNeverEnablesWritesOrCandidateLookups() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("forge-meta-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: directory) }
    var context = GitHubOperationsSamples.context
    context.cacheEndpoint = "https://desktop.example/prefix/"
    let online = ForgeReviewController(gateway: MetadataGateway(), cache: ForgeReviewDiskCache(directory: directory))
    await online.select(context: context, sourceData: sourceData(Self.enabled), number: 7)
    XCTAssertTrue(online.offers("labels"))

    context.isOnline = false
    let gateway = MetadataGateway()
    let offline = ForgeReviewController(gateway: gateway, cache: ForgeReviewDiskCache(directory: directory))
    await offline.select(context: context, sourceData: sourceData(Self.enabled), number: 7)

    XCTAssertTrue(offline.isCached)
    XCTAssertFalse(offline.documents.isEmpty)
    for capability in ["labels", "reviewRequests", "convertToDraft"] {
      XCTAssertFalse(offline.offers(capability), capability)
    }
    XCTAssertFalse(offline.canMutate)
    let labels = await offline.setLabels(add: ["bug"], remove: [])
    let drafted = await offline.convertToDraft()
    let candidates = await offline.candidates(.forgeListPrLabelCandidates)
    XCTAssertFalse(labels || drafted)
    XCTAssertNil(candidates)
    let calls = await gateway.calls
    XCTAssertTrue(calls.isEmpty)
  }

  // MARK: - Source gates

  func testReviewPageGatesEveryEditOnCapabilityScopedLiveReviewAndOpenState() throws {
    let page = try sourceText("App/Features/PullRequests/PullRequestReviewPageView.swift")
    for token in [
      #"forge.offers("convertToDraft")"#, #"forge.offers("labels")"#, #"forge.offers("reviewRequests")"#,
      "forge.convertToDraft()", "PullRequestLabelsSheet(", "PullRequestReviewersSheet(",
      "PullRequestsStrings.editLabels", "PullRequestsStrings.requestReview",
      "PullRequestsStrings.convertToDraft", "requestedReviewers: details?.requestedReviewers",
      "timeline: details?.timeline",
    ] {
      XCTAssertTrue(page.contains(token), token)
    }
    let rows = try sourceText("App/Features/PullRequests/PullRequestsPageView.swift")
    XCTAssertTrue(rows.contains("PullRequestLabelFlow(labels: entry.summary.labels"))
    let overview = try sourceText("App/Features/PullRequests/PullRequestReviewSections.swift")
    XCTAssertTrue(overview.contains("PullRequestLabelFlow(labels: labels)"))
    XCTAssertTrue(overview.contains("PullRequestTimelineSection(events: timeline)"))
    XCTAssertTrue(overview.contains("PullRequestRequestedReviewersSection(reviewers: requestedReviewers)"))
  }

  func testEveryLocalizedKeyInThePullRequestStringsExistsInTheCatalog() throws {
    let strings = try sourceText("App/Features/PullRequests/PullRequestsStrings.swift")
    let keys = try NSRegularExpression(pattern: #"\"(pullRequests\.[A-Za-z0-9.]*[A-Za-z0-9])\""#)
      .matches(in: strings, range: NSRange(strings.startIndex..., in: strings))
      .compactMap { Range($0.range(at: 1), in: strings).map { String(strings[$0]) } }
    XCTAssertGreaterThan(keys.count, 30)
    let catalog = try XCTUnwrap(
      JSONSerialization.jsonObject(
        with: Data(contentsOf: appRoot("App/Features/PullRequests/PullRequests.xcstrings"))) as? [String: Any])
    let catalogKeys = Set(((catalog["strings"] as? [String: Any]) ?? [:]).keys)
    for key in keys { XCTAssertTrue(catalogKeys.contains(key), key) }
  }

  func testMetadataSourcesStayUnderTheFileGateAndHaveNoRawVisibleStrings() throws {
    let directory = appRoot("App/Features/PullRequests")
    let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "swift" }
    for file in files {
      let text = try String(contentsOf: file, encoding: .utf8)
      let lines = text.split(separator: "\n", omittingEmptySubsequences: false).count
      XCTAssertLessThan(lines, 500, file.lastPathComponent)
    }
    for name in [
      "PullRequestReviewMetadata.swift", "PullRequestReviewMetadataViews.swift", "PullRequestMetadataSheets.swift",
    ] {
      let text = try String(contentsOf: directory.appendingPathComponent(name), encoding: .utf8)
      let raw = try NSRegularExpression(
        pattern: #"(?:Text|Button|Label|Section|ContentUnavailableView|navigationTitle)\(\s*\"[A-Za-z]"#)
      XCTAssertNil(raw.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)), name)
    }
  }

  // MARK: - Helpers

  private static let requiredDetailsFields = """
    "number": 42, "title": "Ship native review", "body": "Review inside the app.",
    "baseBranch": "main", "headBranch": "native-review",
    "additions": 14, "deletions": 3, "changedFiles": 2
    """

  private func document(_ json: String) throws -> GitHubDocument {
    GitHubDocument(value: try JSONDecoder().decode(GitHubJSONValue.self, from: Data(json.utf8)))
  }

  private func sourceData(_ capabilities: String) -> Data {
    Data(
      """
      {"repository":"team/repo","account":{"forge":"gitlab","host":"https://git.example","login":"alice"},"capabilities":\(capabilities)}
      """.utf8)
  }

  private func sourceText(_ relative: String) throws -> String {
    try String(contentsOf: appRoot(relative), encoding: .utf8)
  }

  private func appRoot(_ relative: String) -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relative)
  }

  private func scratchCache() -> ForgeReviewDiskCache {
    ForgeReviewDiskCache(
      directory: FileManager.default.temporaryDirectory.appendingPathComponent("forge-meta-\(UUID().uuidString)"))
  }

  private func expected(_ fields: [String: GitHubJSONValue]) throws -> GitHubJSONValue {
    try scopedPayload(fields).value
  }

  private func scopedPayload(_ fields: [String: GitHubJSONValue]) throws -> GitHubDocument {
    var object = fields
    object["projectLocation"] = try JSONDecoder().decode(
      GitHubJSONValue.self, from: JSONEncoder().encode(GitHubOperationsSamples.lease.location))
    object["forgeAccount"] = .object([
      "forge": .string("gitlab"), "host": .string("https://git.example"), "login": .string("alice"),
    ])
    object["forgeRepository"] = .string("team/repo")
    object["prNumber"] = .integer(7)
    return GitHubDocument(value: .object(object))
  }
}

private actor MetadataGateway: ForgeReviewGateway {
  private(set) var calls: [(ForgeReviewOperation, GitHubDocument)] = []
  private var failsWrites = false

  func reset() { calls = [] }
  func failWrites() { failsWrites = true }

  func callForge(
    _ operation: ForgeReviewOperation,
    payload: GitHubDocument,
    lease: GitHubProjectLease
  ) async throws -> GitHubDocument {
    calls.append((operation, payload))
    if operation.scope == .operate, failsWrites { throw GitHubOperationsFailure.ambiguousOutcome }
    switch operation {
    case .forgeGetPrDetails, .forgeGetPrFiles, .forgeGetPrReviewComments:
      let procedure: GitHubProcedure =
        operation == .forgeGetPrDetails
        ? .ghGetPrDetails : operation == .forgeGetPrFiles ? .ghGetPrFiles : .ghGetPrReviewComments
      return .init(
        value: try JSONDecoder().decode(
          GitHubJSONValue.self, from: GitHubOperationsSamples.response(for: procedure)))
    case .forgeGetPrDiff:
      return .init(value: .object(["diff": .string("diff")]))
    case .forgeListPrLabelCandidates:
      return .init(value: .object([
        "labels": .array([.object(["name": .string("bug"), "color": .string("d73a4a")])]),
        "truncated": .bool(false),
      ]))
    case .forgeListPrReviewerCandidates:
      return .init(value: .object([
        "reviewers": .array([.object(["id": .string("u-9"), "login": .string("alice")])]),
        "truncated": .bool(false),
      ]))
    default:
      return .init(value: .object([:]))
    }
  }
}
