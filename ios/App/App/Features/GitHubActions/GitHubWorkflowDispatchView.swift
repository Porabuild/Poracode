import SwiftUI

struct GitHubWorkflowDispatchView: View {
  @Environment(\.dismiss) private var dismiss

  let workflow: GitHubWorkflowSummary
  let definition: GitHubWorkflowDefinition
  let dispatch: (String, [String: String]) async -> GitHubOperationsFailure?

  @State private var ref: String
  @State private var values: [String: String]
  @State private var isSubmitting = false
  @State private var failure: GitHubOperationsFailure?

  init(
    workflow: GitHubWorkflowSummary,
    definition: GitHubWorkflowDefinition,
    dispatch: @escaping (String, [String: String]) async -> GitHubOperationsFailure?
  ) {
    self.workflow = workflow
    self.definition = definition
    self.dispatch = dispatch
    _ref = State(initialValue: definition.ref.isEmpty ? definition.defaultBranch : definition.ref)
    _values = State(
      initialValue: Dictionary(
        uniqueKeysWithValues: definition.inputs.compactMap { input in
          let value =
            input.defaultValue.flatMap(Self.stringValue)
            ?? input.options.first
            ?? (input.type == "boolean" ? "false" : nil)
          guard let value else { return nil }
          return (input.name, value)
        }
      )
    )
  }

  var body: some View {
    NavigationStack {
      Form {
        if let failure {
          Section {
            Label(
              GitHubOperationsStrings.failure(failure),
              systemImage: "exclamationmark.triangle"
            )
            .foregroundStyle(.secondary)
          }
        }

        Section {
          TextField(GitHubOperationsStrings.ref, text: $ref)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }

        if !definition.inputs.isEmpty {
          Section(GitHubOperationsStrings.inputs) {
            ForEach(definition.inputs) { input in
              inputField(input)
            }
          }
        }
      }
      .navigationTitle(workflow.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitHubOperationsStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(GitHubOperationsStrings.run) {
            isSubmitting = true
            Task {
              failure = await dispatch(ref, values)
              isSubmitting = false
              if failure == nil { dismiss() }
            }
          }
          .disabled(isSubmitting || ref.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }

  @ViewBuilder
  private func inputField(_ input: GitHubWorkflowInput) -> some View {
    if input.type == "boolean" {
      Toggle(
        input.name,
        isOn: Binding(
          get: { values[input.name] == "true" },
          set: { values[input.name] = $0 ? "true" : "false" }
        )
      )
    } else if input.type == "choice", !input.options.isEmpty {
      Picker(input.name, selection: valueBinding(input)) {
        ForEach(input.options, id: \.self) { option in
          Text(option).tag(option)
        }
      }
    } else {
      TextField(input.name, text: valueBinding(input), prompt: Text(input.description))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(input.type == "number" ? .numbersAndPunctuation : .default)
    }
  }

  private func valueBinding(_ input: GitHubWorkflowInput) -> Binding<String> {
    Binding(
      get: { values[input.name] ?? input.options.first ?? "" },
      set: { values[input.name] = $0 }
    )
  }

  private static func stringValue(_ value: GitHubJSONValue) -> String? {
    switch value {
    case .string(let value): value
    case .integer(let value): String(value)
    case .number(let value): String(value)
    case .bool(let value): value ? "true" : "false"
    case .null, .array, .object: nil
    }
  }
}
