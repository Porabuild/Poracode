struct RichQuestionAnswerSelection: Equatable, Sendable, Identifiable {
  let id: Int
  let label: String
  let description: String?
}

struct RichQuestionAnswerEntry: Equatable, Sendable, Identifiable {
  let id: Int
  let header: String
  let question: String
  let selected: [RichQuestionAnswerSelection]
  let customAnswer: String?
}

enum RichQuestionAnswerPresentation {
  static func entries(for item: RichRuntimeItem) -> [RichQuestionAnswerEntry] {
    guard item.type == "question_answer",
      let questions = item.payload?.objectValue?["questions"]?.arrayValue
    else { return [] }

    return questions.enumerated().compactMap { index, value in
      guard let object = value.objectValue,
        let header = object["header"]?.stringValue,
        let question = object["question"]?.stringValue,
        let rawSelections = object["selected"]?.arrayValue
      else { return nil }

      let selections = rawSelections.enumerated().compactMap {
        selectionIndex,
        selection -> RichQuestionAnswerSelection? in
        guard let selectionObject = selection.objectValue,
          let label = selectionObject["label"]?.stringValue
        else { return nil }
        return RichQuestionAnswerSelection(
          id: selectionIndex,
          label: label,
          description: selectionObject["description"]?.stringValue
        )
      }
      let customAnswer = object["customAnswer"]?.stringValue
      guard !selections.isEmpty || customAnswer?.isEmpty == false else { return nil }
      return RichQuestionAnswerEntry(
        id: index,
        header: header,
        question: question,
        selected: selections,
        customAnswer: customAnswer
      )
    }
  }

  static func text(for item: RichRuntimeItem) -> String {
    entries(for: item).map { entry in
      var lines: [String] = []
      if !entry.header.isEmpty, entry.header != entry.question { lines.append(entry.header) }
      if !entry.question.isEmpty { lines.append(entry.question) }
      lines.append(contentsOf: entry.selected.map(\.label))
      if let customAnswer = entry.customAnswer, !customAnswer.isEmpty {
        lines.append(customAnswer)
      }
      return lines.joined(separator: "\n")
    }
    .joined(separator: "\n\n")
  }
}
