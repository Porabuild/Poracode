import SwiftUI

/// Create one host-owned environment on the bound host. Creating is an
/// explicit action: the confirmation names the first-install authorization
/// before anything is written.
struct AddEnvironmentSheet: View {
    let controller: EnvironmentManagementController
    @Environment(\.dismiss) private var dismiss

    @State private var label = ""
    @State private var target = ""
    @State private var port = ""
    @State private var credentialRef = ""
    @State private var isSubmitting = false
    @State private var isConfirming = false
    @State private var validationMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(EnvironmentStrings.configurationSection) {
                    TextField(EnvironmentStrings.addLabel, text: $label)
                        .textInputAutocapitalization(.words)
                    TextField(
                        EnvironmentStrings.addTarget,
                        text: $target,
                        prompt: Text(EnvironmentStrings.addTargetPlaceholder)
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    TextField(
                        EnvironmentStrings.addPort,
                        text: $port,
                        prompt: Text(EnvironmentStrings.addPortPlaceholder)
                    )
                    .keyboardType(.numberPad)
                    TextField(
                        EnvironmentStrings.addCredential,
                        text: $credentialRef,
                        prompt: Text(EnvironmentStrings.addCredentialPlaceholder)
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                }
                if let validationMessage {
                    Section {
                        Text(validationMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(EnvironmentStrings.addTitle)
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(HostStrings.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(EnvironmentStrings.addAction) { beginConfirmation() }
                        .disabled(isSubmitting)
                }
            }
            .confirmationDialog(
                EnvironmentStrings.addConfirmTitle,
                isPresented: $isConfirming,
                titleVisibility: .visible
            ) {
                Button(EnvironmentStrings.addAction, role: .destructive) {
                    Task { await submit() }
                }
                Button(HostStrings.cancel, role: .cancel) {}
            } message: {
                Text(EnvironmentStrings.addConfirmMessage)
            }
        }
    }

    private func beginConfirmation() {
        let trimmedLabel = label.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTarget = target.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedLabel.isEmpty, !trimmedTarget.isEmpty else {
            validationMessage = EnvironmentStrings.addRequired
            return
        }
        if !port.isEmpty, parsedPort == nil {
            validationMessage = EnvironmentStrings.addRequired
            return
        }
        validationMessage = nil
        isConfirming = true
    }

    private var parsedPort: Int? {
        Int(port.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func submit() async {
        isSubmitting = true
        defer { isSubmitting = false }
        let credential = credentialRef.trimmingCharacters(in: .whitespacesAndNewlines)
        let created = await controller.create(
            label: label.trimmingCharacters(in: .whitespacesAndNewlines),
            target: target.trimmingCharacters(in: .whitespacesAndNewlines),
            port: parsedPort,
            credentialRef: credential.isEmpty ? nil : credential
        )
        if created {
            dismiss()
        } else {
            validationMessage = controller.failure ?? EnvironmentStrings.operationFailed
        }
    }
}
