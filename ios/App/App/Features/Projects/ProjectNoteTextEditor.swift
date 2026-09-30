import SwiftUI
import UIKit

struct ProjectNoteEditorCommand: Equatable, Sendable {
  let id = UUID()
  let format: ProjectNoteFormat
}

enum ProjectNoteTextSelection {
  static func text(in value: String, range: NSRange) -> String {
    guard range.location != NSNotFound, range.length > 0,
      let selection = Range(range, in: value)
    else { return "" }
    return String(value[selection])
  }
}

/// Native attributed editor for the shared ProseMirror note. UIKit exposes
/// selection and typing attributes on iOS 17, while the SwiftUI equivalent is
/// only available on newer deployment targets.
struct ProjectNoteTextEditor: UIViewRepresentable {
  @Binding var document: JSONValue?
  @Binding var selectedText: String
  @Binding var isEditing: Bool
  @Binding var activeFormats: Set<ProjectNoteFormat>
  let command: ProjectNoteEditorCommand?

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  func makeUIView(context: Context) -> UITextView {
    let view = UITextView()
    view.delegate = context.coordinator
    view.backgroundColor = .clear
    view.font = ProjectNoteDocument.font(for: [])
    view.adjustsFontForContentSizeCategory = true
    view.allowsEditingTextAttributes = true
    view.keyboardDismissMode = .interactive
    view.textContainerInset = UIEdgeInsets(top: 8, left: 0, bottom: 8, right: 0)
    view.textContainer.lineFragmentPadding = 0
    view.accessibilityLabel = ProjectManagementStrings.notes
    view.attributedText = ProjectNoteDocument.attributedText(document)
    view.typingAttributes = typingAttributes(for: [])
    context.coordinator.renderedDocument = document
    return view
  }

  func updateUIView(_ view: UITextView, context: Context) {
    let coordinator = context.coordinator
    coordinator.parent = self
    if coordinator.renderedDocument != document {
      let selection = view.selectedRange
      view.attributedText = ProjectNoteDocument.attributedText(document)
      view.selectedRange = NSRange(
        location: min(selection.location, view.attributedText.length),
        length: 0
      )
      coordinator.renderedDocument = document
      coordinator.publishSelection(from: view)
    }
    if let command, coordinator.lastCommandID != command.id {
      coordinator.lastCommandID = command.id
      coordinator.toggle(command.format, in: view)
    }
  }

  private func typingAttributes(
    for formats: Set<ProjectNoteFormat>
  ) -> [NSAttributedString.Key: Any] {
    [
      .font: ProjectNoteDocument.font(for: formats),
      .foregroundColor: UIColor.label,
    ]
  }

  final class Coordinator: NSObject, UITextViewDelegate {
    var parent: ProjectNoteTextEditor
    var renderedDocument: JSONValue?
    var lastCommandID: UUID?

    init(_ parent: ProjectNoteTextEditor) {
      self.parent = parent
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
      parent.isEditing = true
      publishSelection(from: textView)
    }

    func textViewDidChange(_ textView: UITextView) {
      publishDocument(from: textView)
      publishSelection(from: textView)
    }

    func textViewDidChangeSelection(_ textView: UITextView) {
      publishSelection(from: textView)
    }

    func textViewDidEndEditing(_ textView: UITextView) {
      publishSelection(from: textView)
      parent.isEditing = false
    }

    func toggle(_ format: ProjectNoteFormat, in textView: UITextView) {
      let range = textView.selectedRange
      let shouldAdd = !parent.activeFormats.contains(format)
      if range.length == 0 {
        var formats = ProjectNoteDocument.formats(
          in: textView.typingAttributes[.font] as? UIFont
        )
        if shouldAdd { formats.insert(format) } else { formats.remove(format) }
        var attributes = textView.typingAttributes
        attributes[.font] = ProjectNoteDocument.font(for: formats)
        textView.typingAttributes = attributes
      } else {
        var updates: [(NSRange, Set<ProjectNoteFormat>)] = []
        textView.textStorage.enumerateAttribute(.font, in: range) { font, runRange, _ in
          var formats = ProjectNoteDocument.formats(in: font as? UIFont)
          if shouldAdd { formats.insert(format) } else { formats.remove(format) }
          updates.append((runRange, formats))
        }
        for (runRange, formats) in updates {
          textView.textStorage.addAttribute(
            .font,
            value: ProjectNoteDocument.font(for: formats),
            range: runRange
          )
        }
        publishDocument(from: textView)
      }
      textView.becomeFirstResponder()
      publishSelection(from: textView)
    }

    func publishDocument(from textView: UITextView) {
      let value = ProjectNoteDocument.document(from: textView.attributedText)
      renderedDocument = value
      if parent.document != value { parent.document = value }
    }

    func publishSelection(from textView: UITextView) {
      let selected = ProjectNoteTextSelection.text(
        in: textView.text,
        range: textView.selectedRange
      )
      if parent.selectedText != selected { parent.selectedText = selected }
      let formats = formats(at: textView.selectedRange, in: textView)
      if parent.activeFormats != formats { parent.activeFormats = formats }
    }

    private func formats(at range: NSRange, in textView: UITextView) -> Set<ProjectNoteFormat> {
      if range.length == 0 {
        return ProjectNoteDocument.formats(
          in: textView.typingAttributes[.font] as? UIFont
        )
      }
      var result: Set<ProjectNoteFormat>?
      textView.attributedText.enumerateAttribute(.font, in: range) { font, _, _ in
        let formats = ProjectNoteDocument.formats(in: font as? UIFont)
        if let current = result {
          result = current.intersection(formats)
        } else {
          result = formats
        }
      }
      return result ?? []
    }
  }
}
