import SwiftUI

/// Host-owned environment management for one bound host.
///
/// Management authority is the bound host; a direct host manages its own
/// registry and can pair an environment onto this device. An environment
/// bound through its parent proxy (one hop) lists and manages the child
/// registry but offers no device pairing: that would invent a second hop.
struct EnvironmentsView: View {
    @Bindable var session: AppSession
    let boundConnectionId: ClientConnectionID

    @State private var controller: EnvironmentManagementController
    @State private var showAdd = false
    @State private var pendingDelete: RemoteEnvironmentProjection?

    init(session: AppSession, boundConnectionId: ClientConnectionID) {
        self.session = session
        self.boundConnectionId = boundConnectionId
        _controller = State(
            initialValue: EnvironmentManagementController(
                session: session,
                boundConnectionId: boundConnectionId
            )
        )
    }

    var body: some View {
        Group {
            switch controller.availability {
            case .unknown:
                LoadingStateView(message: EnvironmentStrings.working)
            case .unavailable(let message):
                ContentUnavailableView {
                    Label(EnvironmentStrings.unavailableTitle, systemImage: "server.rack")
                } description: {
                    Text(message)
                }
            case .failed(let message):
                ContentUnavailableView {
                    Label(EnvironmentStrings.unavailableTitle, systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button(StateViewStrings.retry) {
                        Task { await controller.activate() }
                    }
                }
            case .available:
                environmentList
            }
        }
        .navigationTitle(EnvironmentStrings.title)
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .task(id: boundConnectionId) {
            await controller.activate()
        }
        .sheet(isPresented: $showAdd) {
            AddEnvironmentSheet(controller: controller)
        }
        .confirmationDialog(
            EnvironmentStrings.deleteConfirmTitle,
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(EnvironmentStrings.delete, role: .destructive) {
                if let environment = pendingDelete {
                    Task { await controller.delete(environment.environmentId) }
                }
                pendingDelete = nil
            }
            Button(HostStrings.cancel, role: .cancel) {
                pendingDelete = nil
            }
        } message: {
            Text(EnvironmentStrings.deleteConfirmMessage)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await controller.refresh() }
                } label: {
                    Label(EnvironmentStrings.refresh, systemImage: "arrow.clockwise")
                }
            }
            if controller.capabilities.canManage {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showAdd = true
                    } label: {
                        Label(EnvironmentStrings.addTitle, systemImage: "plus")
                    }
                }
            }
        }
    }

    private var environmentList: some View {
        List {
            if !controller.capabilities.canUse {
                Section {
                    Text(EnvironmentStrings.readOnlyMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Section {
                if controller.environments.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(EnvironmentStrings.emptyTitle)
                            .font(.body.weight(.medium))
                        Text(EnvironmentStrings.emptyMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                ForEach(controller.environments) { environment in
                    NavigationLink {
                        EnvironmentDetailView(
                            session: session,
                            controller: controller,
                            environmentId: environment.environmentId
                        )
                    } label: {
                        EnvironmentRow(
                            environment: environment,
                            local: controller.localRecord(
                                for: environment.environmentId
                            ) != nil
                        )
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if controller.capabilities.canManage {
                            Button(role: .destructive) {
                                pendingDelete = environment
                            } label: {
                                Label(EnvironmentStrings.delete, systemImage: "trash")
                            }
                        }
                    }
                }
            } header: {
                Text(EnvironmentStrings.subtitle)
                    .font(.footnote)
                    .textCase(nil)
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await controller.refresh()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if controller.capabilities.canManage {
                PoracodeBottomActionDock(placement: .trailing) {
                    PoracodeCircleButton {
                        showAdd = true
                    } label: {
                        Label(EnvironmentStrings.addTitle, systemImage: "plus")
                            .labelStyle(.iconOnly)
                    }
                    .accessibilityLabel(EnvironmentStrings.addTitle)
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let failure = controller.failure {
                Text(failure)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(8)
                    .poracodeGlassBackground()
                    .padding()
                    .onTapGesture { controller.clearFeedback() }
            }
        }
    }
}

private struct EnvironmentRow: View {
    let environment: RemoteEnvironmentProjection
    let local: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(environment.label)
                    .font(.body.weight(.medium))
                if local {
                    Text(EnvironmentStrings.paired)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Text(environment.target)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                Text(EnvironmentStrings.stateLabel(environment.state))
                Text("·")
                Text(EnvironmentStrings.trustLabel(environment.trust.stateKey))
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
