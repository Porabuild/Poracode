import SwiftUI

/// One environment's details and explicit actions. CAS/trust probe/accept and
/// upgrade are intentional steps with confirmation; nothing is auto-trusted.
struct EnvironmentDetailView: View {
    @Bindable var session: AppSession
    let controller: EnvironmentManagementController
    let environmentId: String

    @State private var isUpgrading = false
    @State private var isAcceptingTrust = false

    private var environment: RemoteEnvironmentProjection? {
        controller.environments.first { $0.environmentId == environmentId }
    }

    var body: some View {
        List {
            if let environment {
                configurationSection(environment)
                deviceSection
                actionsSection(environment)
            } else {
                Text(EnvironmentStrings.operationFailed)
                    .foregroundStyle(.secondary)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(environment?.label ?? EnvironmentStrings.title)
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .confirmationDialog(
            EnvironmentStrings.upgradeConfirmTitle,
            isPresented: $isUpgrading,
            titleVisibility: .visible
        ) {
            Button(EnvironmentStrings.upgrade, role: .destructive) {
                Task { await controller.upgrade(environmentId) }
            }
            Button(HostStrings.cancel, role: .cancel) {}
        } message: {
            Text(EnvironmentStrings.upgradeConfirmMessage)
        }
        .confirmationDialog(
            EnvironmentStrings.trustAcceptTitle,
            isPresented: $isAcceptingTrust,
            titleVisibility: .visible
        ) {
            Button(EnvironmentStrings.acceptTrust, role: .destructive) {
                Task { await controller.acceptTrust(environmentId) }
            }
            Button(HostStrings.cancel, role: .cancel) {
                controller.clearTrustProbe()
            }
        } message: {
            Text(EnvironmentStrings.trustAcceptMessage)
        }
    }

    private func configurationSection(
        _ environment: RemoteEnvironmentProjection
    ) -> some View {
        Section(EnvironmentStrings.configurationSection) {
            LabeledContent(EnvironmentStrings.detailTarget, value: environment.target)
            if let port = environment.port {
                LabeledContent(EnvironmentStrings.detailPort, value: String(port))
            }
            LabeledContent(
                EnvironmentStrings.detailState,
                value: EnvironmentStrings.stateLabel(environment.state)
            )
            LabeledContent(
                EnvironmentStrings.detailTrust,
                value: EnvironmentStrings.trustLabel(environment.trust.stateKey)
            )
            if let fingerprint = environment.trust.displayFingerprint {
                VStack(alignment: .leading, spacing: 2) {
                    Text(EnvironmentStrings.trustFingerprint)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(fingerprint)
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                }
            }
            LabeledContent(
                EnvironmentStrings.detailRevision,
                value: String(environment.revision)
            )
            if let lastError = environment.lastError {
                Text(
                    EnvironmentStrings.publicErrorLabel(
                        code: lastError.code,
                        fallback: lastError.message
                    )
                )
                .font(.footnote)
                .foregroundStyle(.red)
            }
        }
    }

    private var deviceSection: some View {
        Section(EnvironmentStrings.deviceSection) {
            if let local = controller.localRecord(for: environmentId) {
                Text(EnvironmentStrings.paired)
                Button(EnvironmentStrings.open) {
                    Task { await controller.openLocal(local.connectionId) }
                }
                Button(EnvironmentStrings.forget, role: .destructive) {
                    Task { await controller.forgetLocal(local.connectionId) }
                }
            } else {
                Text(EnvironmentStrings.notPaired)
                    .foregroundStyle(.secondary)
                if controller.canPairOnDevice, controller.capabilities.canUse {
                    Button(EnvironmentStrings.pairDevice) {
                        Task { await controller.pairOnDevice(environmentId) }
                    }
                }
            }
        }
    }

    private func actionsSection(
        _ environment: RemoteEnvironmentProjection
    ) -> some View {
        Section(EnvironmentStrings.actionsSection) {
            if controller.capabilities.canUse {
                if environment.state == "connected" || environment.state == "connecting" {
                    Button(EnvironmentStrings.disconnect) {
                        Task { await controller.disconnect(environmentId) }
                    }
                } else {
                    Button(EnvironmentStrings.connect) {
                        Task { await controller.connect(environmentId) }
                    }
                }
            }
            if controller.capabilities.canManage {
                Button(EnvironmentStrings.probeTrust) {
                    Task { await controller.probeTrust(environmentId) }
                }
                if let probe = controller.trustProbe, probe.environmentId == environmentId {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(EnvironmentStrings.trustKeyType): \(probe.keyType)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(probe.fingerprint)
                            .font(.caption.monospaced())
                            .textSelection(.enabled)
                        Button(EnvironmentStrings.acceptTrust) {
                            isAcceptingTrust = true
                        }
                    }
                }
                Button(EnvironmentStrings.upgrade) {
                    isUpgrading = true
                }
            }
        }
    }
}
