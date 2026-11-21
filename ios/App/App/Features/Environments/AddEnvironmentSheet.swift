import SwiftUI

@MainActor
@Observable
final class AddEnvironmentDraft: Identifiable {
    var label = ""
    var target = ""
    var port = ""
    var credentialRef = ""
    var isSubmitting = false
    var isConfirming = false
    var validationMessage: String?
}

/// Create one host-owned environment on the bound host. Creating is an
/// explicit action: the confirmation names the first-install authorization
/// before anything is written.
struct AddEnvironmentSheet: View {
    let controller: EnvironmentManagementController
    @Bindable var draft: AddEnvironmentDraft
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section(EnvironmentStrings.configurationSection) {
                    TextField(EnvironmentStrings.addLabel, text: $draft.label)
                        .textInputAutocapitalization(.words)
                        .accessibilityIdentifier("native-e2e.environment-editor.name")
                    TextField(
                        EnvironmentStrings.addTarget,
                        text: $draft.target,
                        prompt: Text(EnvironmentStrings.addTargetPlaceholder)
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("native-e2e.environment-editor.target")
                    TextField(
                        EnvironmentStrings.addPort,
                        text: $draft.port,
                        prompt: Text(EnvironmentStrings.addPortPlaceholder)
                    )
                    .keyboardType(.numberPad)
                    .accessibilityIdentifier("native-e2e.environment-editor.port")
                    TextField(
                        EnvironmentStrings.addCredential,
                        text: $draft.credentialRef,
                        prompt: Text(EnvironmentStrings.addCredentialPlaceholder)
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("native-e2e.environment-editor.credential")
                }
                if let validationMessage = draft.validationMessage {
                    Section {
                        Text(validationMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .disabled(draft.isSubmitting)
            .navigationTitle(EnvironmentStrings.addTitle)
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Label(HostStrings.cancel, systemImage: "xmark")
                    }
                    .disabled(draft.isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        beginConfirmation()
                    } label: {
                        Label(EnvironmentStrings.addAction, systemImage: "plus")
                    }
                    .disabled(draft.isSubmitting || !controller.canCreate)
                    .accessibilityIdentifier("native-e2e.environment-editor.confirm")
                }
            }
            .interactiveDismissDisabled(draft.isSubmitting)
            .confirmationDialog(
                EnvironmentStrings.addConfirmTitle,
                isPresented: $draft.isConfirming,
                titleVisibility: .visible
            ) {
                Button(EnvironmentStrings.addAction, role: .destructive) {
                    Task { await submit() }
                }
                .accessibilityIdentifier("native-e2e.environment-editor.create")
                Button(HostStrings.cancel, role: .cancel) {}
            } message: {
                Text(EnvironmentStrings.addConfirmMessage)
            }
        }
    }

    private func beginConfirmation() {
        let trimmedLabel = draft.label.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTarget = draft.target.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedLabel.isEmpty, !trimmedTarget.isEmpty else {
            draft.validationMessage = EnvironmentStrings.addRequired
            return
        }
        if !draft.port.isEmpty, parsedPort == nil {
            draft.validationMessage = EnvironmentStrings.addRequired
            return
        }
        draft.validationMessage = nil
        draft.isConfirming = true
    }

    private var parsedPort: Int? {
        Int(draft.port.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func submit() async {
        guard !draft.isSubmitting else { return }
        draft.isSubmitting = true
        defer { draft.isSubmitting = false }
        let credential = draft.credentialRef.trimmingCharacters(in: .whitespacesAndNewlines)
        let created = await controller.create(
            label: draft.label.trimmingCharacters(in: .whitespacesAndNewlines),
            target: draft.target.trimmingCharacters(in: .whitespacesAndNewlines),
            port: parsedPort,
            credentialRef: credential.isEmpty ? nil : credential
        )
        if created {
            dismiss()
        } else {
            draft.validationMessage = controller.failure ?? EnvironmentStrings.operationFailed
        }
    }
}
