import SwiftUI

/// Collects the non-owner inputs for one procedure.
///
/// The owner row is informational: the thread and location shown here come
/// from the lease and are submitted from the lease, never from this form.
struct AdvancedOperationFormView: View {
  let descriptor: AdvancedOperationDescriptor
  let owner: AdvancedOperationOwner?
  let submit: (AdvancedOperationDraft) async -> AdvancedSubmission

  @State private var draft: AdvancedOperationDraft
  @State private var isSubmitting = false
  @Environment(\.dismiss) private var dismiss

  init(
    descriptor: AdvancedOperationDescriptor,
    owner: AdvancedOperationOwner?,
    submit: @escaping (AdvancedOperationDraft) async -> AdvancedSubmission
  ) {
    self.descriptor = descriptor
    self.owner = owner
    self.submit = submit
    _draft = State(initialValue: AdvancedOperationDraft(procedure: descriptor.procedure))
  }

  var body: some View {
    NavigationStack {
      Form {
        ownerSection
        if !draft.fields.isEmpty {
          Section(AdvancedOperationsStrings.inputs) {
            ForEach(draft.fields) { field in
              AdvancedFormFieldView(
                field: field,
                text: binding(for: field.key)
              )
            }
          }
        }
        optionsSection
        if draft.usesSegments {
          AdvancedSegmentsSection(draft: $draft)
        }
      }
      .navigationTitle(descriptor.title)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(AdvancedOperationsStrings.close) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(AdvancedOperationsStrings.run) { Task { await run() } }
            .disabled(isSubmitting || owner == nil || !draft.hasRequiredValues)
            .accessibilityIdentifier("advancedOperations.submit")
        }
      }
    }
  }

  @ViewBuilder
  private var ownerSection: some View {
    Section(AdvancedOperationsStrings.ownerSection) {
      if let owner {
        if let threadID = owner.threadID {
          LabeledContent(AdvancedOperationsStrings.ownerThread, value: threadID)
        }
        if let location = owner.location {
          LabeledContent(
            AdvancedOperationsStrings.ownerLocation,
            value: AdvancedOperationRedaction.location(location)
          )
        }
      } else {
        Text(AdvancedOperationsStrings.notReady).foregroundStyle(.secondary)
      }
    }
  }

  @ViewBuilder
  private var optionsSection: some View {
    if !draft.flagDescriptors.isEmpty || draft.usesEntryType {
      Section(AdvancedOperationsStrings.options) {
        ForEach(draft.flagDescriptors) { flag in
          AdvancedFormFlagView(flag: flag, value: flagBinding(flag))
        }
        if draft.usesEntryType {
          Picker(AdvancedOperationsStrings.entryType, selection: $draft.entryType) {
            Text(AdvancedOperationsStrings.entryTypeFile).tag(AdvancedProjectEntryType.file)
            Text(AdvancedOperationsStrings.entryTypeDirectory)
              .tag(AdvancedProjectEntryType.directory)
          }
          .accessibilityIdentifier("advancedOperations.entryType")
        }
      }
    }
  }

  private func run() async {
    isSubmitting = true
    let outcome = await submit(draft)
    isSubmitting = false
    if outcome != .rejected { dismiss() }
  }

  private func binding(for key: AdvancedFormFieldKey) -> Binding<String> {
    Binding(
      get: { draft.value(key) },
      set: { draft.setValue($0, for: key) }
    )
  }

  private func flagBinding(_ flag: AdvancedFormFlagDescriptor) -> Binding<AdvancedOptionalFlag> {
    Binding(
      get: { draft.flag(flag.key) },
      set: { draft.setFlag($0, for: flag.key) }
    )
  }
}

struct AdvancedFormFieldView: View {
  let field: AdvancedFormFieldDescriptor
  @Binding var text: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(field.title)
        .font(.caption)
        .foregroundStyle(.secondary)
      editor
        .accessibilityLabel(field.title)
        .accessibilityIdentifier(field.accessibilityIdentifier)
      if !field.isRequired {
        Text(AdvancedOperationsStrings.optionalValue)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }

  @ViewBuilder
  private var editor: some View {
    switch field.kind {
    case .multiline:
      TextField(field.title, text: $text, axis: .vertical)
        .lineLimit(3...8)
    case .milliseconds:
      TextField(field.title, text: $text)
        .font(.callout.monospaced())
    case .identifier, .location:
      TextField(field.title, text: $text)
        .font(.callout.monospaced())
        .advancedVerbatimInput()
    case .singleLine:
      TextField(field.title, text: $text)
    }
  }
}

struct AdvancedFormFlagView: View {
  let flag: AdvancedFormFlagDescriptor
  @Binding var value: AdvancedOptionalFlag

  var body: some View {
    if flag.isOptional {
      Picker(flag.title, selection: $value) {
        ForEach(AdvancedOptionalFlag.allCases, id: \.self) { option in
          Text(AdvancedOperationsStrings.optionalFlag(option)).tag(option)
        }
      }
      .accessibilityIdentifier(flag.accessibilityIdentifier)
    } else {
      Toggle(
        flag.title,
        isOn: Binding(get: { value == .on }, set: { value = $0 ? .on : .off })
      )
      .accessibilityIdentifier(flag.accessibilityIdentifier)
    }
  }
}
