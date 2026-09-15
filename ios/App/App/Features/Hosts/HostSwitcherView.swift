import SwiftUI

/// Adaptive host switcher. Secrets never appear in the UI.
struct HostSwitcherView: View {
    @Bindable var session: AppSession
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var pendingRemoval: HostRecord?
    @State private var pendingRename: HostRecord?
    @State private var renameDraft = ""
    @State private var showAddHost = false
    @State private var destination: HostDestination?

    var body: some View {
        Group {
            if isRegularWidth {
                regularLayout
            } else {
                compactLayout
            }
        }
        .navigationTitle(HostStrings.switcherTitle)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .sheet(isPresented: $showAddHost) {
            AddHostSheet(session: session)
        }
        .navigationDestination(item: $destination) { destination in
            HostDestinationView(session: session, destination: destination)
        }
        .confirmationDialog(
            pendingRemoval.map { HostStrings.removeConfirmTitle($0.label) } ?? HostStrings.removeHost,
            isPresented: Binding(
                get: { pendingRemoval != nil },
                set: { if !$0 { pendingRemoval = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(HostStrings.removeConfirmAction, role: .destructive) {
                if let host = pendingRemoval {
                    Task { await session.removeHost(host.connectionId) }
                }
                pendingRemoval = nil
            }
            Button(HostStrings.cancel, role: .cancel) {
                pendingRemoval = nil
            }
        } message: {
            Text(HostStrings.removeConfirmMessage)
        }
        .alert(
            ThreadLifecycleStrings.rename,
            isPresented: Binding(
                get: { pendingRename != nil },
                set: { if !$0 { pendingRename = nil } }
            )
        ) {
            TextField(HostStrings.renamePrompt, text: $renameDraft)
            Button(ThreadLifecycleStrings.rename) {
                guard let host = pendingRename else { return }
                let label = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !label.isEmpty else { return }
                Task { await session.renameHost(host.connectionId, label: label) }
                pendingRename = nil
            }
            Button(HostStrings.cancel, role: .cancel) {
                pendingRename = nil
            }
        }
    }

    private var isRegularWidth: Bool {
        horizontalSizeClass == .regular
    }

    private var compactLayout: some View {
        List {
            hostSection(showsEmptyAction: false)
        }
        .listStyle(.insetGrouped)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PoracodeBottomActionDock(placement: .trailing) {
                PoracodeCircleButton {
                    showAddHost = true
                } label: {
                    Label(HostStrings.addHost, systemImage: "plus")
                        .labelStyle(.iconOnly)
                }
                .accessibilityLabel(HostStrings.addHostAccessibility)
                .accessibilityIdentifier("native-e2e.connections.add")
            }
        }
    }

    private var regularLayout: some View {
        List {
            hostSection(showsEmptyAction: true)
            addSection
        }
        .listStyle(.sidebar)
    }

    @ViewBuilder
    private func hostSection(showsEmptyAction: Bool) -> some View {
        if session.hosts.isEmpty {
            ContentUnavailableView {
                Label(HostStrings.emptyTitle, systemImage: "desktopcomputer")
            } description: {
                Text(HostStrings.emptyDescription)
            } actions: {
                if showsEmptyAction {
                    Button(HostStrings.addHost) { showAddHost = true }
                        .poracodeProminentButtonStyle()
                }
            }
            .accessibilityElement(children: .combine)
        } else {
            Section(HostStrings.switcherTitle) {
                ForEach(session.hosts) { host in
                    hostRow(host)
                }
            }
        }
    }

    private var addSection: some View {
        Section {
            Button {
                showAddHost = true
            } label: {
                Label(HostStrings.addHost, systemImage: "plus")
            }
            .accessibilityLabel(HostStrings.addHostAccessibility)
        }
    }

    private func hostRow(_ host: HostRecord) -> some View {
        let selected = session.selectedConnectionId == host.connectionId
        let secondary = session.hostsLRU.first { $0 != session.selectedConnectionId } == host.connectionId
        let status = HostConnectionStatus(
            session.state.hostSocketStates[host.connectionId]
                ?? (selected ? session.socketState : .idle)
        )
        return HStack(spacing: 0) {
            Button {
                guard !selected else { return }
                Task { await session.switchHost(host.connectionId) }
            } label: {
                hostRowLabel(
                    host,
                    selected: selected,
                    secondary: secondary,
                    status: status
                )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("native-e2e.connection-row")
            .accessibilityLabel(
                HostStrings.hostAccessibility(
                    label: host.label,
                    selected: selected
                )
            )
            .accessibilityValue(status.label)
            .accessibilityAddTraits(selected ? .isSelected : [])
            .accessibilityHint(selected ? HostStrings.currentHost : HostStrings.switchAction)

            Menu {
                Button(ProjectManagementStrings.title, systemImage: "folder") {
                    destination = HostDestination(
                        connectionID: host.connectionId,
                        kind: .projects
                    )
                }
                Button(SettingsUIStrings.desktopSettingsTitle, systemImage: "desktopcomputer") {
                    destination = HostDestination(
                        connectionID: host.connectionId,
                        kind: .desktopSettings
                    )
                }
                Button(ThreadLifecycleStrings.rename, systemImage: "pencil") {
                    beginRename(host)
                }
                if !selected {
                    Button(HostStrings.switchAction, systemImage: "arrow.left.arrow.right") {
                        Task { await session.switchHost(host.connectionId) }
                    }
                }
                Divider()
                Button(HostStrings.removeHost, systemImage: "trash", role: .destructive) {
                    pendingRemoval = host
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(HostStrings.switcherTitle)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                pendingRemoval = host
            } label: {
                Label(HostStrings.removeHost, systemImage: "trash")
            }
            .accessibilityLabel(HostStrings.removeHost)
        }
        .contextMenu {
            Button(ProjectManagementStrings.title, systemImage: "folder") {
                destination = HostDestination(
                    connectionID: host.connectionId,
                    kind: .projects
                )
            }
            Button(SettingsUIStrings.desktopSettingsTitle, systemImage: "desktopcomputer") {
                destination = HostDestination(
                    connectionID: host.connectionId,
                    kind: .desktopSettings
                )
            }
            Button(ThreadLifecycleStrings.rename, systemImage: "pencil") {
                beginRename(host)
            }
            if !selected {
                Button(HostStrings.switchAction, systemImage: "arrow.left.arrow.right") {
                    Task { await session.switchHost(host.connectionId) }
                }
            }
            Button(HostStrings.removeHost, systemImage: "trash", role: .destructive) {
                pendingRemoval = host
            }
        }
    }

    @ViewBuilder
    private func hostRowLabel(
        _ host: HostRecord,
        selected: Bool,
        secondary: Bool,
        status: HostConnectionStatus
    ) -> some View {
        hostRowContent(
            host,
            selected: selected,
            secondary: secondary,
            status: status
        )
    }

    private func beginRename(_ host: HostRecord) {
        renameDraft = host.label
        pendingRename = host
    }

    private func hostRowContent(
        _ host: HostRecord,
        selected: Bool,
        secondary: Bool,
        status: HostConnectionStatus
    ) -> some View {
        HStack(spacing: 12) {
            hostGlyph(selected: selected)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(host.label)
                        .font(.body.weight(selected ? .semibold : .regular))
                        .foregroundStyle(.primary)
                }
                Text(HostStrings.endpointCaption(host.httpBaseURL))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                statusPills(status: status, selected: selected, secondary: secondary)
            }
            Spacer(minLength: 8)
            if selected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private func hostGlyph(selected _: Bool) -> some View {
        Image(systemName: "desktopcomputer")
            .font(.title3)
            .foregroundStyle(.secondary)
            .frame(width: 36, height: 36)
            .modifier(HostGlyphBackground())
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func statusPills(
        status: HostConnectionStatus,
        selected: Bool,
        secondary: Bool
    ) -> some View {
        HStack(spacing: 6) {
            HStack(spacing: 5) {
                Circle()
                    .fill(status.color)
                    .frame(width: 6, height: 6)
                Text(status.label)
            }
            .font(.caption2.weight(.medium))
            .foregroundStyle(status.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .modifier(HostPillBackground(tint: false))
            if selected {
                Text(HostStrings.selectedBadge)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .modifier(HostPillBackground(tint: true))
            } else if secondary {
                Text(HostStrings.secondaryBadge)
                    .font(.caption2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .modifier(HostPillBackground(tint: false))
            }
        }
        .accessibilityHidden(true)
    }
}

enum HostConnectionStatus: Equatable {
    case online
    case connecting
    case offline

    init(_ state: RemoteWebSocketClient.ConnectionState) {
        switch state {
        case .online:
            self = .online
        case .connecting, .reconnecting:
            self = .connecting
        case .idle, .suspended, .failed:
            self = .offline
        }
    }

    var label: String {
        switch self {
        case .online: HostStrings.statusOnline
        case .connecting: HostStrings.statusConnecting
        case .offline: HostStrings.statusOffline
        }
    }

    var color: Color {
        switch self {
        case .online: .green
        case .connecting: .orange
        case .offline: .secondary
        }
    }
}

/// Toolbar control that presents the host switcher. Secrets never appear here.
struct HostSwitcherEntry: View {
    @Bindable var session: AppSession
    @State private var showSwitcher = false

    var body: some View {
        Button {
            showSwitcher = true
        } label: {
            Label(
                session.profile?.label ?? HostStrings.switcherTitle,
                systemImage: "desktopcomputer"
            )
        }
        .accessibilityLabel(HostStrings.switcherAccessibility)
        .accessibilityValue(session.profile?.label ?? HostStrings.switcherTitle)
        .sheet(isPresented: $showSwitcher) {
            NavigationStack {
                HostSwitcherView(session: session)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(HostStrings.cancel) { showSwitcher = false }
                        }
                    }
            }
            .modifier(HostSheetSizing())
        }
    }
}

private struct HostGlyphBackground: ViewModifier {
    func body(content: Content) -> some View {
        content.background(.thinMaterial, in: Circle())
    }
}

private struct HostPillBackground: ViewModifier {
    var tint: Bool

    func body(content: Content) -> some View {
        if tint {
            content.background(Color.accentColor.opacity(0.15), in: Capsule())
        } else {
            content.background(Color.secondary.opacity(0.12), in: Capsule())
        }
    }
}

private struct HostSheetSizing: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.presentationSizing(.form)
        } else {
            content
        }
    }
}
