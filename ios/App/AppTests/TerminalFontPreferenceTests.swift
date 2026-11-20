import UIKit
import XCTest
import SwiftUI
import Observation

@testable import App

@MainActor
final class TerminalFontPreferenceTests: XCTestCase {
  func testChangingOnlyTheFontUpdatesAnOpenTranscriptAndPreservesTheCommandDraft() async throws {
    let original = TerminalTextAttributes.font(pointSize: 13)
    let selected = try XCTUnwrap(TerminalFontPreference.availableFont(named: "CourierNewPSMT", pointSize: 13))
    let model = TerminalTypographyHarnessState(font: original)
    let appeared = expectation(description: "Terminal typography mounted")
    let changed = expectation(description: "Font changed without new output")
    let host = UIHostingController(rootView: TerminalTypographyHarness(model: model,
      appeared: { appeared.fulfill() }, changed: { changed.fulfill() }))
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 640, height: 480))
    window.windowScene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    window.rootViewController = host; window.isHidden = false
    defer { window.isHidden = true; window.rootViewController = nil }
    await fulfillment(of: [appeared], timeout: 5)
    host.view.layoutIfNeeded()
    let views = descendants(host.view)
    let output = try XCTUnwrap(views.compactMap { $0 as? TerminalTranscriptView }.first)
    let input = try XCTUnwrap(views.compactMap { $0 as? TerminalCommandTextView }.first)
    output.selectedRange = NSRange(location: 1, length: 3)
    input.selectedRange = NSRange(location: 2, length: 0)
    model.font = selected
    await fulfillment(of: [changed], timeout: 5)
    await Task.yield()
    host.view.layoutIfNeeded()

    XCTAssertEqual(output.attributedText.string, "plain red")
    XCTAssertEqual((output.attributedText.attribute(.font, at: 0, effectiveRange: nil) as? UIFont)?.fontName,
      selected.fontName)
    XCTAssertEqual(input.font, selected, "The input must not retain the old face at the same point size")
    XCTAssertEqual(input.text, "echo 'keep 漢字'")
    XCTAssertEqual(model.input, "echo 'keep 漢字'")
    XCTAssertEqual(input.selectedRange, NSRange(location: 2, length: 0))
    XCTAssertEqual(output.selectedRange, NSRange(location: 1, length: 3))
  }

  func testUpgradeRetainsBothOldTextSizesAndUsesTheExistingDefaultFont() throws {
    let suite = "poracode.tests.terminal-font.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set(17, forKey: PoracodeTerminalTextSize.storageKey)
    defaults.set(11, forKey: PoracodeTerminalTextSize.projectStorageKey)

    let name = TerminalFontPreference.storedName(in: defaults)
    XCTAssertEqual(name, "")
    XCTAssertEqual(TerminalFontPreference.font(named: name, pointSize: 17),
      UIFont.monospacedSystemFont(ofSize: 17, weight: .regular))
    XCTAssertEqual(PoracodeTerminalTextSizeRole.agent.initialValue(in: defaults), 17)
    XCTAssertEqual(PoracodeTerminalTextSizeRole.project.initialValue(in: defaults), 11)
    XCTAssertNil(defaults.object(forKey: TerminalFontPreference.storageKey))
  }

  func testMissingAndMalformedSavedFontsFallBackWithoutRewritingTheirBytes() throws {
    let suite = "poracode.tests.terminal-font.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let missing = "UnavailableMono-ForRegression"
    defaults.set(missing, forKey: TerminalFontPreference.storageKey)
    XCTAssertEqual(TerminalFontPreference.storedName(in: defaults), missing)
    XCTAssertEqual(TerminalFontPreference.font(named: missing, pointSize: 15),
      UIFont.monospacedSystemFont(ofSize: 15, weight: .regular))
    XCTAssertEqual(defaults.string(forKey: TerminalFontPreference.storageKey), missing)

    defaults.set(42, forKey: TerminalFontPreference.storageKey)
    XCTAssertEqual(TerminalFontPreference.storedName(in: defaults), "")
    XCTAssertEqual(defaults.integer(forKey: TerminalFontPreference.storageKey), 42)
  }

  func testChosenMonospacedFaceSurvivesRestartAndResetKeepsOtherPreferences() throws {
    let suite = "poracode.tests.terminal-font.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let selected = try XCTUnwrap(TerminalFontPreference.availableFont(named: "CourierNewPSMT", pointSize: 18))
    defaults.set(selected.fontName, forKey: TerminalFontPreference.storageKey)
    defaults.set(16, forKey: PoracodeTerminalTextSize.storageKey)
    let reopened = try XCTUnwrap(UserDefaults(suiteName: suite))
    XCTAssertEqual(TerminalFontPreference.font(named: TerminalFontPreference.storedName(in: reopened), pointSize: 18), selected)
    reopened.set(TerminalFontPreference.defaultValue, forKey: TerminalFontPreference.storageKey)
    XCTAssertEqual(TerminalFontPreference.storedName(in: defaults), "")
    XCTAssertEqual(defaults.integer(forKey: PoracodeTerminalTextSize.storageKey), 16)
  }

  func testAProportionalFontCannotBreakTerminalColumnAlignment() {
    XCTAssertNil(TerminalFontPreference.availableFont(named: "Helvetica", pointSize: 13))
    XCTAssertNil(TerminalFontPreference.availableFont(named: String(repeating: "x", count: 513), pointSize: 13))
    XCTAssertNil(TerminalFontPreference.availableFont(named: "CourierNewPSMT\n", pointSize: 13))
  }

  func testRenderedRunsAndGridUseTheSameChosenFontAtTheScaledPointSize() throws {
    let font = try XCTUnwrap(TerminalFontPreference.availableFont(named: "CourierNewPSMT", pointSize: 26))
    let rendered = TerminalTextAttributes.attributed(TerminalANSIParser.render("plain \u{1B}[31;1mred"), font: font)
    let plain = try XCTUnwrap(rendered.attribute(.font, at: 0, effectiveRange: nil) as? UIFont)
    let bold = try XCTUnwrap(rendered.attribute(.font, at: 6, effectiveRange: nil) as? UIFont)
    XCTAssertEqual(plain.familyName, font.familyName)
    XCTAssertEqual(plain.pointSize, 26)
    XCTAssertEqual(bold.familyName, font.familyName)
    XCTAssertEqual(bold.pointSize, 26)
    XCTAssertTrue(bold.fontDescriptor.symbolicTraits.contains(.traitBold))
    let bounds = CGSize(width: 640, height: 360)
    let grid = try XCTUnwrap(TerminalViewportMetrics.size(for: bounds, font: font))
    let width = ("W" as NSString).size(withAttributes: [.font: font]).width
    XCTAssertEqual(grid.columns, Int(floor((bounds.width - 24) / width)))
    XCTAssertEqual(grid.rows, Int(floor((bounds.height - 24) / font.lineHeight)))
  }

  func testChangingAppearanceRefreshesExistingOutputAndTheCommandKeyboard() async throws {
    let model = TerminalTypographyHarnessState(font: TerminalTextAttributes.font(pointSize: 13))
    let appeared = expectation(description: "Light terminal mounted")
    let changed = expectation(description: "Terminal appearance changed")
    let host = UIHostingController(rootView: TerminalTypographyHarness(model: model,
      appeared: { appeared.fulfill() }, changed: { changed.fulfill() }))
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 640, height: 480))
    window.windowScene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    window.rootViewController = host
    window.isHidden = false
    defer { window.isHidden = true; window.rootViewController = nil }
    await fulfillment(of: [appeared], timeout: 5)
    host.view.layoutIfNeeded()
    let views = descendants(host.view)
    let output = try XCTUnwrap(views.compactMap { $0 as? TerminalTranscriptView }.first)
    let input = try XCTUnwrap(views.compactMap { $0 as? TerminalCommandTextView }.first)
    let theme = PoracodeThemePreset.resolve(PoracodeThemePreset.defaultID)
    XCTAssertEqual(input.keyboardAppearance, .light)
    XCTAssertEqual(output.attributedText.attribute(.foregroundColor, at: 0, effectiveRange: nil) as? UIColor,
      UIColor(theme.variant(for: .light).foreground))
    model.appearance = .dark
    await fulfillment(of: [changed], timeout: 5)
    await Task.yield()
    host.view.layoutIfNeeded()
    XCTAssertEqual(input.keyboardAppearance, .dark)
    XCTAssertEqual(output.attributedText.attribute(.foregroundColor, at: 0, effectiveRange: nil) as? UIColor,
      UIColor(theme.variant(for: .dark).foreground))
    XCTAssertEqual(input.text, model.input)
    XCTAssertEqual(output.attributedText.string, "plain red")
  }

  func testDefaultAndInverseTerminalTextUseTheSelectedThemeAcrossAppearances() throws {
    let theme = PoracodeThemePreset.resolve(PoracodeThemePreset.defaultID)
    let transcript = TerminalANSIParser.render("plain \u{1B}[7mreverse\u{1B}[0m \u{1B}[31mred")
    let font = TerminalTextAttributes.font(pointSize: 13)
    var explicitRed: UIColor?
    for appearance in [ColorScheme.light, .dark] {
      let variant = theme.variant(for: appearance)
      let foreground = UIColor(variant.foreground)
      let background = UIColor(variant.background)
      let text = TerminalTextAttributes.attributed(transcript, font: font,
        defaultForeground: foreground, defaultBackground: background)
      XCTAssertEqual(text.attribute(.foregroundColor, at: 0, effectiveRange: nil) as? UIColor, foreground)
      XCTAssertEqual(text.attribute(.foregroundColor, at: 6, effectiveRange: nil) as? UIColor, background)
      XCTAssertEqual(text.attribute(.backgroundColor, at: 6, effectiveRange: nil) as? UIColor, foreground)
      let red = try XCTUnwrap(text.attribute(.foregroundColor, at: 14, effectiveRange: nil) as? UIColor)
      XCTAssertNotEqual(red, foreground)
      if let explicitRed { XCTAssertEqual(red, explicitRed) }
      explicitRed = red
    }
  }

  private func descendants(_ view: UIView) -> [UIView] {
    [view] + view.subviews.flatMap(descendants)
  }
}

@MainActor
@Observable
private final class TerminalTypographyHarnessState {
  var font: UIFont
  var appearance: ColorScheme = .light
  var input = "echo 'keep 漢字'"
  init(font: UIFont) { self.font = font }
}

private struct TerminalTypographyHarness: View {
  let model: TerminalTypographyHarnessState
  let appeared: () -> Void
  let changed: () -> Void

  var body: some View {
    VStack {
      TerminalTextSurface(transcript: "plain \u{1B}[31mred", accessibilityLabel: "Output", font: model.font)
      TerminalCommandField(text: Binding(get: { model.input }, set: { model.input = $0 }),
        font: model.font, isDisabled: false, accessibilityLabel: "Input", onSubmit: {})
    }
    .environment(\.colorScheme, model.appearance)
    .onAppear(perform: appeared)
    .onChange(of: model.font) { changed() }
    .onChange(of: model.appearance) { changed() }
  }
}
