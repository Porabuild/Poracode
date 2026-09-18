import XCTest

@testable import App

/// `background_tasks.changed` parity with the TS runtime event reducer
/// (replace / empty-drain / session.exited drain semantics) and zod
/// `backgroundTaskSchema` strictness — mirroring the Android
/// `RuntimeBackgroundTasksReduceTest`. Golden fixture: `runtime-events.json`.
final class RuntimeBackgroundTasksReduceTests: XCTestCase {
  private var fixturesRoot: URL {
    // ios/App/AppTests → repo root → protocol/remote/v3/fixtures
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("protocol/remote/v3/fixtures", isDirectory: true)
  }

  private func loadFixture(_ name: String) throws -> Data {
    try Data(contentsOf: fixturesRoot.appendingPathComponent(name))
  }

  private func task(
    _ taskId: String, _ kind: String, _ description: String
  ) -> [String: JSONValue] {
    [
      "taskId": .string(taskId),
      "kind": .string(kind),
      "description": .string(description),
    ]
  }

  private func tasksArray(_ tuples: (String, String, String)...) -> [JSONValue] {
    tuples.map { JSONValue.object(task($0.0, $0.1, $0.2)) }
  }

  private func event(
    tasks: [JSONValue]?, extraTopLevel: Bool = false
  ) -> [String: JSONValue] {
    var object: [String: JSONValue] = [
      "type": .string("background_tasks.changed"),
      "threadId": .string("t1"),
    ]
    if let tasks {
      object["tasks"] = .array(tasks)
    }
    if extraTopLevel {
      object["futureTopLevel"] = .number(1)
    }
    return object
  }

  private func decode(_ object: [String: JSONValue]) -> RuntimeEventReducer.RuntimeEvent? {
    RuntimeEventDecoder.decode(object)
  }

  private func reduce(
    _ object: [String: JSONValue], into domain: RuntimeThreadDomainState
  ) throws -> RuntimeThreadDomainState {
    var next = domain
    let event = try XCTUnwrap(decode(object))
    RuntimeEventReducer.applyDomain(event: event, threadId: "t1", domain: &next)
    return next
  }

  func testSharedFixtureEntryParsesWithExactPayloadPreserved() throws {
    let array = try JSONDecoding.decode([JSONValue].self, from: loadFixture("runtime-events.json"))
    let entry = try XCTUnwrap(
      array.first { value in
        guard case .object(let object) = value else { return false }
        return object["type"]?.stringValue == "background_tasks.changed"
      }
    )
    guard case .object(let object) = entry else { return XCTFail("fixture entry not an object") }
    let parsed = try XCTUnwrap(decode(object))
    XCTAssertEqual(parsed.threadId, "thread-fixture-001")
    XCTAssertEqual(
      parsed.backgroundTasks,
      [RuntimeBackgroundTask(taskId: "task-fixture-001", kind: "command", description: "pnpm test")]
    )
  }

  func testKindEnumAcceptsCommandAndOtherOnly() {
    XCTAssertNotNil(decode(event(tasks: tasksArray(("a", "command", "d")))))
    XCTAssertNotNil(decode(event(tasks: tasksArray(("a", "other", "d")))))
    XCTAssertNil(decode(event(tasks: tasksArray(("a", "watcher", "d")))))
    XCTAssertNil(
      decode(
        event(
          tasks: [
            .object([
              "taskId": .string("a"),
              "kind": .number(1),
              "description": .string("d"),
            ])
          ]
        )
      )
    )
  }

  func testStrictSchemaRejections() {
    // tasks key missing (required by the wire schema)
    XCTAssertNil(decode(event(tasks: nil)))
    // tasks not an array
    XCTAssertNil(
      decode([
        "type": .string("background_tasks.changed"),
        "threadId": .string("t1"),
        "tasks": .string("nope"),
      ])
    )
    // empty taskId (zod min(1))
    XCTAssertNil(decode(event(tasks: tasksArray(("", "command", "d")))))
    // missing description
    XCTAssertNil(
      decode(
        event(
          tasks: [
            .object([
              "taskId": .string("a"),
              "kind": .string("command"),
            ])
          ]
        )
      )
    )
    // non-object task entry
    XCTAssertNil(decode(event(tasks: [.string("task")])))
    // threadId missing
    XCTAssertNil(
      decode([
        "type": .string("background_tasks.changed"),
        "tasks": .array([]),
      ])
    )
  }

  func testUnknownFieldsAreStrippedNotRejected() {
    let parsed = decode(
      event(
        tasks: [
          .object([
            "taskId": .string("a"),
            "kind": .string("other"),
            "description": .string("d"),
            "futureTaskField": .bool(true),
          ])
        ]
      )
    )
    XCTAssertEqual(parsed?.backgroundTasks, [RuntimeBackgroundTask(taskId: "a", kind: "other", description: "d")])
    XCTAssertNotNil(decode(event(tasks: tasksArray(("a", "other", "d")), extraTopLevel: true)))
  }

  func testReplaceEmptyDrainAndSessionExitedSemantics() throws {
    let a = RuntimeBackgroundTask(taskId: "a", kind: "command", description: "d1")
    let b = RuntimeBackgroundTask(taskId: "b", kind: "other", description: "d2")
    var domain = RuntimeThreadDomainState()
    XCTAssertNil(domain.backgroundTasks)

    // Replace: nil -> [a, b]
    domain = try reduce(
      event(tasks: tasksArray(("a", "command", "d1"), ("b", "other", "d2"))), into: domain
    )
    XCTAssertEqual(domain.backgroundTasks, [a, b])

    // Identical list is a no-op.
    let before = domain
    domain = try reduce(
      event(tasks: tasksArray(("a", "command", "d1"), ("b", "other", "d2"))), into: domain
    )
    XCTAssertEqual(domain, before)

    // Replace shrinks [a, b] -> [a].
    domain = try reduce(event(tasks: tasksArray(("a", "command", "d1"))), into: domain)
    XCTAssertEqual(domain.backgroundTasks, [a])

    // Empty list drains (key dropped).
    domain = try reduce(event(tasks: []), into: domain)
    XCTAssertNil(domain.backgroundTasks)

    // Empty list with no prior key is a no-op.
    let drained = domain
    domain = try reduce(event(tasks: []), into: domain)
    XCTAssertEqual(domain, drained)

    // session.exited drains a live list; a second exit is a no-op.
    domain = try reduce(event(tasks: tasksArray(("a", "command", "d1"))), into: domain)
    XCTAssertEqual(domain.backgroundTasks, [a])
    RuntimeEventReducer.applyDomain(
      event: .init(type: "session.exited", threadId: "t1"),
      threadId: "t1",
      domain: &domain
    )
    XCTAssertNil(domain.backgroundTasks)
    let exited = domain
    RuntimeEventReducer.applyDomain(
      event: .init(type: "session.exited", threadId: "t1"),
      threadId: "t1",
      domain: &domain
    )
    XCTAssertEqual(domain, exited)
  }

  func testReduceNeverTouchesItemsOrStructuralVersion() throws {
    var items: [PersistedRuntimeItem] = []
    var domain = RuntimeThreadDomainState()
    for object in [
      event(tasks: tasksArray(("a", "command", "d1"))),
      event(tasks: []),
    ] {
      let event = try XCTUnwrap(decode(object))
      RuntimeEventReducer.apply(event: event, to: &items)
      RuntimeEventReducer.applyDomain(event: event, threadId: "t1", domain: &domain)
    }
    RuntimeEventReducer.apply(
      event: .init(type: "session.exited", threadId: "t1"), to: &items
    )
    RuntimeEventReducer.applyDomain(
      event: .init(type: "session.exited", threadId: "t1"), threadId: "t1", domain: &domain
    )
    XCTAssertTrue(items.isEmpty)
    XCTAssertNil(domain.backgroundTasks)
    XCTAssertEqual(domain.structuralVersion, 0)
  }

  func testEventSurvivesMixedBatchEnvelopeAndInvalidSiblingsAreSkipped() throws {
    let envelope: JSONValue = .object([
      "type": .string("thread-runtime-events"),
      "threadId": .string("t1"),
      "events": .array([
        .object(event(tasks: tasksArray(("a", "command", "d1")))),
        .object(event(tasks: tasksArray(("bad", "not_a_kind", "d")))),
        .object([
          "type": .string("unicorn.spotted"),
          "threadId": .string("t1"),
        ]),
      ]),
    ])
    let batches = RuntimeEventReducer.collectRuntimeEvents(from: envelope)
    XCTAssertEqual(batches.count, 1)
    let event = try XCTUnwrap(batches.first?.events.single)
    XCTAssertEqual(event.type, "background_tasks.changed")
    XCTAssertEqual(
      event.backgroundTasks,
      [RuntimeBackgroundTask(taskId: "a", kind: "command", description: "d1")]
    )
  }
}

extension Array {
  fileprivate var single: Element? { count == 1 ? first : nil }
}
