import XCTest
import SwiftUI
import UIKit
@testable import App

final class CustomThemeDocumentTests: XCTestCase {
  private struct Fixture: Decodable {
    struct Document: Decodable { let id: String; let json: String; let expected: JSONValue? }
    struct Hex: Decodable { let value: String; let valid: Bool }
    struct Palette: Decodable { let id: String; let mode: String?; let palette: JSONValue; let ratios: [String: Double?]; let muted: String? }
    let formatVersion: Int; let maximumBytes: Int; let maximumThemes: Int
    let documents: [Document]; let hex: [Hex]; let palettes: [Palette]
  }

  func testReleasedAuthoringFilesMatchPWAUnicodeValidationAndOptionalFieldPolicy() throws {
    let fixture = try fixture()
    XCTAssertEqual(fixture.formatVersion, CustomThemeDocument.version)
    XCTAssertEqual(fixture.maximumBytes, CustomThemeDocument.maximumBytes)
    for sample in fixture.documents {
      let bytes = Data(sample.json.utf8)
      if let expected = sample.expected {
        do {
          let document = try CustomThemeDocument.parse(bytes)
          let exported = try JSONDecoder().decode(JSONValue.self, from: document.export())
          XCTAssertEqual(exported, expected, sample.id)
          XCTAssertNil(exported["id"], "Portable files must not carry an installation ID")
        } catch { XCTFail("\(sample.id): \(error)") }
      } else { XCTAssertThrowsError(try CustomThemeDocument.parse(bytes), sample.id) }
    }
  }

  func testHexValidationMatchesPWAAndExpandsShortColorsForNativeRendering() throws {
    for sample in try fixture().hex {
      XCTAssertEqual(CustomThemePalette.normalizedHex(sample.value) != nil, sample.valid, sample.value)
    }
    XCTAssertEqual(CustomThemePalette.normalizedHex("#aBc"), "#aabbcc")
    XCTAssertFalse(NativeCustomTheme.validID("custom:line\n"))
    XCTAssertFalse(NativeCustomTheme.validID("default"))
    XCTAssertTrue(NativeCustomTheme.validID("custom:valid-1"))
  }

  func testNativeContrastAndMutedDerivationMatchThePWA() throws {
    for sample in try fixture().palettes {
      let palette = try palette(sample.palette)
      let mode = sample.mode ?? "light"
      let actual = CustomThemeColorMath.ratios(palette, mode: mode)
      for (key, expected) in sample.ratios {
        if let expected { XCTAssertEqual(try XCTUnwrap(actual[key]), expected, accuracy: 1e-12, sample.id + ":" + key) }
        else { XCTAssertNil(actual[key], sample.id + ":" + key) }
      }
      if let expected = sample.muted { XCTAssertEqual(CustomThemeColorMath.muted(palette, mode: mode), expected, sample.id) }
    }
  }

  func testImportReadsTheWholeBoundedFileAndRefusesOversizedOrTrailingData() throws {
    let valid = try XCTUnwrap(try fixture().documents.first(where: { $0.expected != nil }))
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("theme-import-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("theme.json")
    let bytes = Data(valid.json.utf8)
    let padded = bytes + Data(repeating: 32, count: CustomThemeDocument.maximumBytes - bytes.count)
    try padded.write(to: file)
    XCTAssertEqual(try CustomThemeFile.imported(from: file).label, "Shared palette")
    try (padded + Data([32])).write(to: file)
    XCTAssertThrowsError(try CustomThemeFile.imported(from: file))
    try (bytes + Data("trailing garbage".utf8)).write(to: file)
    XCTAssertThrowsError(try CustomThemeFile.imported(from: file))
  }

  func testBundledCreationSourcesPreserveAllCanonicalPresetAnchors() {
    let catalog = CustomThemeCatalog.bundled
    XCTAssertEqual(catalog.presets.map(\.id), PoracodeThemePreset.all.map(\.id))
    XCTAssertFalse(catalog.presets.isEmpty)
    for preset in catalog.presets { XCTAssertNoThrow(try preset.document.validate(), preset.id) }
    let source = catalog.source(for: "github", custom: [])
    XCTAssertEqual(source?.label, "GitHub")
    XCTAssertNotNil(source?.light.accentFg)
  }

  @MainActor func testAuthoredAccentForegroundChangesTheRealProminentButtonLabel() throws {
    func render(_ foreground: Color) throws -> (dark: Int, light: Int) {
      let content = Button("Aa") {}.font(.system(size: 38, weight: .bold))
        .frame(width: 160, height: 70).poracodeProminentButtonStyle()
        .environment(\.poracodeAccent, .red)
        .environment(\.poracodeAccentForeground, foreground)
        .frame(width: 200, height: 100).background(Color.gray)
      let host = UIHostingController(rootView: content)
      let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 200, height: 100))
      window.overrideUserInterfaceStyle = .light
      window.rootViewController = host; window.isHidden = false
      defer { window.isHidden = true }
      host.view.frame = window.bounds; host.view.layoutIfNeeded()
      let image = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in
        XCTAssertTrue(host.view.drawHierarchy(in: window.bounds, afterScreenUpdates: true))
      }
      let attachment = XCTAttachment(image: image)
      attachment.name = foreground == .black ? "custom-theme-accent-black-label" : "custom-theme-accent-white-label"
      attachment.lifetime = .keepAlways; add(attachment)
      let cg = try XCTUnwrap(image.cgImage)
      let context = try XCTUnwrap(CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8,
        bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
      context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
      let pixels = try XCTUnwrap(context.data).bindMemory(to: UInt8.self, capacity: cg.width * cg.height * 4)
      var dark = 0, light = 0
      for y in cg.height / 4..<cg.height * 3 / 4 {
        for x in cg.width / 4..<cg.width * 3 / 4 {
          let offset = (y * cg.width + x) * 4
          let rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]]
          if rgb.allSatisfy({ $0 < 64 }) { dark += 1 }
          if rgb.allSatisfy({ $0 > 192 }) { light += 1 }
        }
      }
      return (dark, light)
    }
    let black = try render(.black), white = try render(.white)
    XCTAssertGreaterThan(black.dark, white.dark, "The authored foreground must reach the real button label")
    XCTAssertGreaterThan(white.light, black.light, "Changing only Text on accent must change its visible text")
  }

  @MainActor func testAuthoredTextColorsReachTheUIKitComposerWithoutReplacingTheDraft() throws {
    var document = try XCTUnwrap(CustomThemeCatalog.bundled.presets.first).document
    document.light.bg = "#000000"; document.light.surface = "#222222"
    document.light.fg = "#ffffff"; document.light.content = "#000000"
    document.light.composer = "#222222"
    let view = RichChatComposerTextInput.makeEditor(pointSize: 17), placeholder = UILabel()
    view.text = "Retain this draft"; view.selectedRange = NSRange(location: 4, length: 3)
    let selection = view.selectedRange
    RichChatComposerTextInput.applyPalette(document.light.nativeVariant, to: view, placeholder: placeholder)
    XCTAssertEqual(view.textColor, UIColor(Color(poracodeHex: "#ffffff")))
    XCTAssertEqual(placeholder.textColor, UIColor(Color(poracodeHex: try XCTUnwrap(CustomThemeColorMath.muted(document.light)))))
    XCTAssertEqual(view.text, "Retain this draft"); XCTAssertEqual(view.selectedRange, selection)
    document.light.fg = "#123456"
    RichChatComposerTextInput.applyPalette(document.light.nativeVariant, to: view, placeholder: placeholder)
    XCTAssertEqual(view.textColor, UIColor(Color(poracodeHex: "#123456")))
    XCTAssertEqual(view.text, "Retain this draft"); XCTAssertEqual(view.selectedRange, selection)
  }

  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-custom-themes.json")
  }

  private func palette(_ value: JSONValue) throws -> CustomThemePalette {
    func required(_ key: String) throws -> String { try XCTUnwrap(value[key]?.stringValue) }
    return CustomThemePalette(bg: try required("bg"), surface: try required("surface"), fg: try required("fg"),
      accent: try required("accent"), accentFg: try required("accentFg"), border: try required("border"),
      sidebar: value["sidebar"]?.stringValue, content: value["content"]?.stringValue,
      composer: value["composer"]?.stringValue, sidebarFill: value["sidebarFill"]?.boolValue,
      sidebarRowActive: value["sidebarRowActive"]?.stringValue)
  }
}
