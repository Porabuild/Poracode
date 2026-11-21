import SwiftUI
import UIKit

struct TerminalFontPicker: UIViewControllerRepresentable {
  let selection: (String?) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(selection: selection) }

  func makeUIViewController(context: Context) -> UINavigationController {
    let configuration = UIFontPickerViewController.Configuration()
    configuration.filteredTraits = .traitMonoSpace
    configuration.includeFaces = false
    let picker = UIFontPickerViewController(configuration: configuration)
    picker.delegate = context.coordinator
    picker.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel,
      primaryAction: UIAction { _ in context.coordinator.selection(nil) })
    return UINavigationController(rootViewController: picker)
  }

  func updateUIViewController(_ navigation: UINavigationController, context: Context) {
    context.coordinator.selection = selection
  }

  static func dismantleUIViewController(_ navigation: UINavigationController, coordinator: Coordinator) {
    if let picker = navigation.viewControllers.first as? UIFontPickerViewController {
      picker.delegate = nil
      picker.navigationItem.leftBarButtonItem = nil
    }
  }

  final class Coordinator: NSObject, UIFontPickerViewControllerDelegate {
    var selection: (String?) -> Void

    init(selection: @escaping (String?) -> Void) { self.selection = selection }

    func fontPickerViewControllerDidPickFont(_ viewController: UIFontPickerViewController) {
      guard let descriptor = viewController.selectedFontDescriptor else { selection(nil); return }
      let font = UIFont(descriptor: descriptor, size: 13)
      selection(TerminalFontPreference.availableFont(named: font.fontName, pointSize: 13)?.fontName)
    }

    func fontPickerViewControllerDidCancel(_ viewController: UIFontPickerViewController) {
      selection(nil)
    }
  }
}
