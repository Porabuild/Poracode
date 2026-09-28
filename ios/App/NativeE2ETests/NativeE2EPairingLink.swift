import UIKit
import UniformTypeIdentifiers
import XCTest

/// Enters a pairing URL into the onboarding "Other ways to connect" sheet.
///
/// Every native journey needs this, and the obvious flow is racy on a loaded
/// runner: a paste is four separate UI round-trips (tap the field, hold for the
/// edit menu, wait for `Paste`, tap it), and XCUITest measured ~54s between
/// publishing the pasteboard item and the synthesized tap on the CI runner that
/// failed dispatch 35863101272. A pasteboard item that expires sooner than that
/// turns the tap into a silent no-op: the field stays empty, `Connect` has
/// nothing to submit, the app makes no pairing request, and the journey only
/// surfaces the problem tens of seconds later as "never reached Home".
///
/// So the item outlives the slowest observed interaction, and the field's own
/// value is the gate — nothing is submitted until the URL is demonstrably in
/// the field.
@MainActor
enum PairingLinkEntry {
  enum Failure: Error, CustomStringConvertible {
    case fieldNeverAppeared
    case urlNotEntered(expected: String, actual: String, attempts: Int)

    var description: String {
      switch self {
      case .fieldNeverAppeared:
        return "The pairing-link field never appeared in the 'Other ways to connect' sheet."
      case let .urlNotEntered(expected, actual, attempts):
        return """
          The pairing link never landed in the field after \(attempts) paste attempt(s) \
          (\(actual.isEmpty ? "field is empty" : "field holds \(actual.count) characters"), \
          expected \(expected.count)).
          """
      }
    }
  }

  /// Comfortably longer than the slowest paste measured on a loaded runner (54s).
  /// The pasteboard is cleared when the entry attempt ends either way, so this
  /// only widens the window in which a one-time credential sits in the
  /// simulator's shared pasteboard — never the whole test run.
  private static let pasteboardLifetime: TimeInterval = 5 * 60
  private static let pasteAttempts = 3

  /// Reveal the field, paste `pairingURL` into it, prove it landed, then submit.
  static func enter(
    _ pairingURL: URL,
    into app: XCUIApplication,
    revealTimeout: TimeInterval = 10
  ) throws {
    let expected = pairingURL.absoluteString
    UIPasteboard.general.setItems(
      [[UTType.plainText.identifier: expected]],
      options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(pasteboardLifetime)],
    )
    defer { UIPasteboard.general.items = [] }

    let field = revealLinkField(in: app, timeout: revealTimeout)
    guard field.exists else { throw Failure.fieldNeverAppeared }

    var attempt = 0
    while fieldValue(field) != expected {
      guard attempt < pasteAttempts else { break }
      attempt += 1
      field.tap()
      field.press(forDuration: 1)
      let paste = app.menuItems["Paste"]
      if paste.waitForExistence(timeout: 5) {
        paste.tap()
      }
      // Dismiss the edit menu; `Connect` is unreachable behind it.
      app.navigationBars.firstMatch.tap()
    }
    let entered = fieldValue(field)
    guard entered == expected else {
      throw Failure.urlNotEntered(expected: expected, actual: entered, attempts: attempt)
    }

    let submit = app.buttons["native-e2e.pair.submit"]
    XCTAssertTrue(submit.waitForExistence(timeout: 5))
    XCTAssertTrue(submit.isHittable, "Connect must remain visible after entering a pairing link")
    submit.tap()
  }

  /// The pairing-link field lives inside the "Other ways to connect" sheet. It
  /// auto-expands when scanning is unavailable — always true on the Simulator —
  /// but expand explicitly so the journey never depends on that.
  @discardableResult
  static func revealLinkField(
    in app: XCUIApplication,
    timeout: TimeInterval = 10
  ) -> XCUIElement {
    let field = app.textFields["native-e2e.pairing-link"]
    if field.waitForExistence(timeout: timeout) { return field }
    let expander = app.buttons["native-e2e.pair.manual"]
    if expander.waitForExistence(timeout: 5) {
      expander.tap()
      _ = field.waitForExistence(timeout: timeout)
    }
    return field
  }

  /// What the app is actually showing while a pairing is expected to complete,
  /// so a journey that stalls on this screen says why instead of guessing.
  static func pendingState(in app: XCUIApplication) -> String {
    let error = app.staticTexts.matching(
      NSPredicate(format: "label BEGINSWITH %@", "Error:")
    ).firstMatch
    if error.exists { return "pairing reported an error: \(error.label)" }
    let submit = app.buttons["native-e2e.pair.submit"]
    guard submit.exists else {
      return "the pairing screen is gone, but Home never appeared"
    }
    let characters = fieldValue(app.textFields["native-e2e.pairing-link"]).count
    return """
      still on the pairing screen with \(characters) character(s) in the link field and \
      Connect \(submit.isEnabled ? "enabled, so no pairing request was made" : "disabled, so a pairing is in flight")
      """
  }

  private static func fieldValue(_ field: XCUIElement) -> String {
    (field.value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }
}
