import SwiftUI
import XCTest

@testable import App

@MainActor
final class PoracodeNavigationRetentionTests: XCTestCase {
  func testFileSheetRetainsItsContainerAcrossBothDuoDisplaysUntilDismissed() {
    let retention = PoracodeNavigationRetention()
    let presentation = UUID()
    let inner = CGSize(width: 951, height: 669)
    let outer = CGSize(width: 466, height: 678)
    var mode = HomeAdaptiveLayoutPolicy.resolve(for: inner).mode
    retention.retain(presentation)

    for size in [outer, inner, outer] {
      let layout = HomeAdaptiveLayoutPolicy.resolve(for: size, safeAreaInsets: EdgeInsets(),
        retainingMode: retention.isActive ? mode : nil)
      XCTAssertEqual(layout.mode, .splitTwoColumn, "The sheet's presenting container must survive")
      XCTAssertEqual(layout.containerSize, size, "The sheet still adapts to its actual display")
      mode = layout.mode
    }

    retention.release(presentation)
    XCTAssertEqual(HomeAdaptiveLayoutPolicy.resolve(for: outer, safeAreaInsets: EdgeInsets(),
      retainingMode: retention.isActive ? mode : nil).mode, .compactSinglePane)
  }

  func testNestedPresentationsDoNotReleaseAnotherSheetOrAnotherWindow() {
    let window = PoracodeNavigationRetention(), otherWindow = PoracodeNavigationRetention()
    let settings = UUID(), editor = UUID()
    window.retain(settings)
    window.retain(settings)
    window.retain(editor)
    window.release(editor)
    window.release(editor)
    XCTAssertTrue(window.isActive, "Repeated lifecycle callbacks cannot release the parent sheet")
    XCTAssertFalse(otherWindow.isActive, "One window must not freeze another window's layout")
    window.release(settings)
    XCTAssertFalse(window.isActive)
  }
}
