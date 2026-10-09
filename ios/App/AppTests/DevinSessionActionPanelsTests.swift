import XCTest

@testable import App

final class DevinSessionActionPanelsTests: XCTestCase {
  private let leaf = DevinSessionActionPanels()

  func testMatchesBaseKindAndEveryProfileKindOnly() {
    XCTAssertTrue(leaf.presents(agentKind: "devin"))
    XCTAssertTrue(leaf.presents(agentKind: "devin:work"))
    XCTAssertTrue(leaf.presents(agentKind: "devin:second-account"))
    XCTAssertFalse(leaf.presents(agentKind: "claude"))
    XCTAssertFalse(leaf.presents(agentKind: "cursor:org"))
    XCTAssertFalse(leaf.presents(agentKind: "devinish"))
    XCTAssertFalse(leaf.presents(agentKind: ""))
  }

  func testRuleEntriesShowNamesPathsWithoutImplementationMetadata() throws {
    let rules = try leaf.ruleEntries(in: [
      "rules": .array([
        .object([
          "name": .string("no-force-push"),
          "path": .string(".cursor/rules/git.md"),
          "scope": .string("project"),
          "provider": .string("internal-provider"),
          "trigger": .string("always_on"),
        ])
      ])
    ])
    XCTAssertEqual(rules.count, 1)
    XCTAssertEqual(rules[0].name, "no-force-push")
    XCTAssertEqual(rules[0].path, ".cursor/rules/git.md")
    XCTAssertTrue(rules[0].details.isEmpty)
  }

  func testRuleEntriesRejectMalformedResults() {
    XCTAssertThrowsError(try leaf.ruleEntries(in: [:]))
    XCTAssertThrowsError(try leaf.ruleEntries(in: ["rules": .array([.string("bare")])]))
  }

  func testSharedCatalogResolvesTheLeafForBaseAndProfileKinds() {
    XCTAssertNotNil(RichChatSessionActionCatalog.contributor(for: "devin"))
    XCTAssertNotNil(RichChatSessionActionCatalog.contributor(for: "devin:work"))
    XCTAssertNil(RichChatSessionActionCatalog.contributor(for: "claude"))
    XCTAssertNil(RichChatSessionActionCatalog.contributor(for: "cursor:org"))
  }

  func testOnlyRulesAndReviseBecomeMenuEntries() {
    let removed = [
      "devin.session.rename", "devin.session.archive", "devin.hooks.list",
      "native-personas.list", "devin.config.list", "devin.config.set", "unknown",
    ]
    XCTAssertTrue(leaf.entries(inventory: removed).isEmpty)
    let entries = leaf.entries(
      inventory: removed + [
        DevinSessionActionID.rules,
        DevinSessionActionID.revise, DevinSessionActionID.rules,
      ])
    XCTAssertEqual(entries.map(\.panel), [.listRules, .reviseCommand])
    for id in removed { XCTAssertNil(leaf.panel(for: id)) }
  }

  func testRevisePayloadAndSuggestionRemainExplicit() {
    XCTAssertEqual(
      leaf.payload(for: .reviseCommand, form: .init(command: "pwd")),
      ["command": .string("pwd")])
    XCTAssertEqual(
      leaf.payload(for: .reviseCommand, form: .init(command: "pwd", note: "shorter")),
      ["command": .string("pwd"), "note": .string("shorter")])
    XCTAssertEqual(leaf.payload(for: .listRules, form: .init()), [:])
    XCTAssertEqual(leaf.reviseSuggestion(in: ["command": .string("ls")]), "ls")
    XCTAssertNil(leaf.reviseSuggestion(in: [:]))
    XCTAssertNil(leaf.reviseSuggestion(in: ["command": .string("")]))
  }
}
