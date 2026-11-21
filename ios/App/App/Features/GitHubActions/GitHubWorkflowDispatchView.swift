import SwiftUI

struct GitHubWorkflowDispatchSelection: Identifiable {
  var id: Int64 { workflow.id }
  let workflow: GitHubWorkflowSummary
  let definition: GitHubWorkflowDefinition
  let lease: GitHubProjectLease

  func request(ref: String, inputs: [String: String]) -> GitHubOperationRequest {
    .ghDispatchWorkflow(.init(
      projectLocation: lease.location, workflowId: workflow.id, ref: ref, inputs: inputs
    ))
  }
}

struct GitHubWorkflowDispatchView: View {
  @Environment(\.dismiss) private var dismiss

  let workflow: GitHubWorkflowSummary
  let definition: GitHubWorkflowDefinition
  let dispatch: (String, [String: String]) async -> GitHubOperationsFailure?

  @State private var ref: String
  @State private var values: [String: String]
  @State private var isSubmitting = false
  @State private var failure: GitHubOperationsFailure?

  private var trimmedRef: String { ref.trimmingCharacters(in: .whitespacesAndNewlines) }

  private var dispatchInputs: [String: String] {
    values.mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.value.isEmpty }
  }

  private var hasMissingRequiredInputs: Bool {
    let inputs = dispatchInputs
    return definition.inputs.contains { $0.required && inputs[$0.name] == nil }
  }

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
            .accessibilityIdentifier("native-e2e.github-actions.dispatch-ref")
        }

        if !definition.inputs.isEmpty {
          Section {
            ForEach(definition.inputs) { input in
              inputField(input)
            }
          } header: {
            Text(GitHubOperationsStrings.inputs)
          } footer: {
            if hasMissingRequiredInputs { Text(GitHubOperationsStrings.workflowInputsRequired) }
          }
        }
      }
      .navigationTitle(workflow.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitHubOperationsStrings.cancel, systemImage: "xmark") { dismiss() }
            .accessibilityIdentifier("native-e2e.github-actions.dispatch-cancel")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(GitHubOperationsStrings.run, systemImage: "play.fill") {
            guard !isSubmitting else { return }
            let branch = trimmedRef
            let inputs = dispatchInputs
            isSubmitting = true
            Task {
              failure = await dispatch(branch, inputs)
              isSubmitting = false
              if failure == nil { dismiss() }
            }
          }
          .disabled(isSubmitting || trimmedRef.isEmpty || hasMissingRequiredInputs)
          .accessibilityIdentifier("native-e2e.github-actions.dispatch-submit")
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }

  @ViewBuilder
  private func inputField(_ input: GitHubWorkflowInput) -> some View {
    let title = input.required ? GitHubOperationsStrings.requiredWorkflowInput(input.name) : input.name
    if input.type == "boolean" {
      Toggle(
        title,
        isOn: Binding(
          get: { values[input.name] == "true" },
          set: { values[input.name] = $0 ? "true" : "false" }
        )
      )
      .poracodeSwitchStyle()
    } else if input.type == "choice", !input.options.isEmpty {
      Picker(title, selection: valueBinding(input)) {
        ForEach(input.options, id: \.self) { option in
          Text(option).tag(option)
        }
      }
    } else {
      LabeledContent(title) {
        TextField(title, text: valueBinding(input), prompt: Text(input.description))
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .keyboardType(input.type == "number" ? .numbersAndPunctuation : .default)
          .accessibilityIdentifier("native-e2e.github-actions.dispatch-input.\(input.name)")
      }
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
