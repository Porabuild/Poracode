import SwiftUI

/// Adaptive host switcher. Secrets never appear in the UI.
struct HostSwitcherView: View {
    @Bindable var session: AppSession
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var pendingRemoval: HostRecord?
    @State private var showAddHost = false

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
    }

    private var isRegularWidth: Bool {
        horizontalSizeClass == .regular
    }

    private var compactLayout: some View {
        List {
            hostSection
            addSection
        }
        .listStyle(.insetGrouped)
    }

    private var regularLayout: some View {
        List {
            hostSection
            addSection
        }
        .listStyle(.sidebar)
    }

    @ViewBuilder
    private var hostSection: some View {
        if session.hosts.isEmpty {
            ContentUnavailableView {
                Label(HostStrings.emptyTitle, systemImage: "desktopcomputer")
            } description: {
                Text(HostStrings.emptyDescription)
            } actions: {
                Button(HostStrings.addHost) { showAddHost = true }
                    .poracodeProminentButtonStyle()
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
        return Button {
            guard !selected else { return }
            Task { await session.switchHost(host.connectionId) }
        } label: {
            hostRowLabel(host, selected: selected, secondary: secondary)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("native-e2e.connection-row")
        .accessibilityLabel(
            HostStrings.hostAccessibility(
                label: host.label,
                selected: selected
            )
        )
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityHint(selected ? HostStrings.currentHost : HostStrings.switchAction)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                pendingRemoval = host
            } label: {
                Label(HostStrings.removeHost, systemImage: "trash")
            }
            .accessibilityLabel(HostStrings.removeHost)
        }
        .contextMenu {
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
        secondary: Bool
    ) -> some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: 8) {
                hostRowContent(host, selected: selected, secondary: secondary)
            }
        } else {
            hostRowContent(host, selected: selected, secondary: secondary)
        }
    }

    private func hostRowContent(
        _ host: HostRecord,
        selected: Bool,
        secondary: Bool
    ) -> some View {
        HStack(spacing: 12) {
            hostGlyph(selected: selected)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if selected {
                        Circle()
                            .fill(session.socketState == .online ? Color.green : Color.secondary)
                            .frame(width: 8, height: 8)
                            .accessibilityHidden(true)
                    }
                    Text(host.label)
                        .font(.body.weight(selected ? .semibold : .regular))
                        .foregroundStyle(.primary)
                }
                Text(HostStrings.endpointCaption(host.httpBaseURL))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                statusPills(selected: selected, secondary: secondary)
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

    private func hostGlyph(selected: Bool) -> some View {
        Image(systemName: "desktopcomputer")
            .font(.title3)
            .foregroundStyle(selected ? Color.accentColor : Color.secondary)
            .frame(width: 36, height: 36)
            .modifier(HostGlyphBackground())
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func statusPills(selected: Bool, secondary: Bool) -> some View {
        HStack(spacing: 6) {
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
        if #available(iOS 26.0, *) {
            content.glassEffect(in: Circle())
        } else {
            content.background(.ultraThinMaterial, in: Circle())
        }
    }
}

private struct HostPillBackground: ViewModifier {
    var tint: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(in: Capsule())
        } else if tint {
            content.background(Color.accentColor.opacity(0.15), in: Capsule())
        } else {
            content.background(.thinMaterial, in: Capsule())
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
