import UIKit

enum NativeInputFocusChanges {
  static let changed = Notification.Name("com.poracode.native-command-focus")
}

extension UIView {
  func notifyNativeCommandFocusChanged() {
    NotificationCenter.default.post(name: NativeInputFocusChanges.changed, object: self)
  }
}

/// Shared UIKit text bridges report successful focus transitions without
/// claiming focus, changing editing behavior or owning an app command target.
class NativeFocusReportingTextView: UITextView {
  override func becomeFirstResponder() -> Bool {
    let accepted = super.becomeFirstResponder()
    if accepted { notifyNativeCommandFocusChanged() }
    return accepted
  }

  override func resignFirstResponder() -> Bool {
    let accepted = super.resignFirstResponder()
    if accepted { notifyNativeCommandFocusChanged() }
    return accepted
  }
}
