import SwiftUI
import UIKit

/// Ports surface mirroring the mobile web panel: active forwards above detected
/// dev servers, whole-row tap to open/start, a per-forward actions menu, and a
/// manual "Forward a port" entry for ports the desktop has not detected.
struct PortForwardingView: View {
  @Environment(\.scenePhase) private var scenePhase
  @State private var controller: PortForwardingController
  private let access: PortForwardingHostAccess?
  private let copyAddress: ((String) async -> URL?)?
  @State private var actionTask: Task<Void, Never>?
  @State private var manualPresented = false
  @State private var manualPort = ""
  @State private var copiedForwardID: String?

  init(
    controller: PortForwardingController,
    access: PortForwardingHostAccess?,
    copyAddress: ((String) async -> URL?)? = nil
  ) {
    _controller = State(initialValue: controller)
    self.access = access
    self.copyAddress = copyAddress
  }

  var body: some View {
    let projection = PortForwardingViewProjection(controller: controller, access: access)
    List {
      Section {
        Text(PortForwardingStrings.intro)
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      switch projection.gate {
      case .noDesktop:
        gateState(
          systemImage: "plug",
          title: PortForwardingStrings.noDesktop,
          hint: PortForwardingStrings.noDesktopHint
        )
      case .notEnabled:
        gateState(
          systemImage: "plug",
          title: PortForwardingStrings.notEnabled,
          hint: PortForwardingStrings.notEnabledHint
        )
      case .loadFailed(let message):
        gateState(
          systemImage: "exclamationmark.triangle",
          title: PortForwardingStrings.loadFailed,
          hint: message
        ) {
          Button(PortForwardingStrings.retry) {
            run { await controller.scan() }
          }
          .buttonStyle(.bordered)
        }
      case .looking:
        Section {
          HStack(spacing: 10) {
            ProgressView()
            Text(PortForwardingStrings.looking)
              .foregroundStyle(.secondary)
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 20)
        }
      case .none, .ready:
        if !projection.active.isEmpty {
          Section(PortForwardingStrings.active) {
            ForEach(projection.active) { row in
              activeRow(row)
            }
          }
        }
        if showDetectedSection(projection) {
          Section(PortForwardingStrings.detected) {
            if projection.detected.isEmpty {
              gateState(
                systemImage: "plug",
                title: PortForwardingStrings.empty,
                hint: PortForwardingStrings.emptyHint
              )
            } else {
              ForEach(projection.detected) { row in
                detectedRow(row)
              }
            }
          }
        }
      }
    }
    .navigationTitle(PortForwardingStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        Button {
          manualPresented = true
        } label: {
          Label(PortForwardingStrings.manualForward, systemImage: "plus")
        }
        .disabled(!canUse)
        .accessibilityIdentifier("port-forwarding.manual")

        Button {
          run { await controller.scan() }
        } label: {
          if projection.isScanning {
            ProgressView().accessibilityLabel(PortForwardingStrings.scanning)
          } else {
            Label(PortForwardingStrings.scan, systemImage: "arrow.clockwise")
          }
        }
        .disabled(projection.isScanning || controller.operation != .none)
        .accessibilityIdentifier("port-forwarding.scan")
      }
    }
    .alert(
      PortForwardingStrings.manualForward,
      isPresented: $manualPresented
    ) {
      TextField(PortForwardingStrings.portField, text: $manualPort)
        .keyboardType(.numberPad)
      Button(PortForwardingStrings.forward) {
        if let port = Int(manualPort.trimmingCharacters(in: .whitespaces)),
          (1...65_535).contains(port)
        {
          run { await controller.start(port: port) }
        }
        manualPort = ""
      }
      .disabled(!manualPortValid)
      Button(PortForwardingStrings.close, role: .cancel) {
        manualPort = ""
      }
    } message: {
      Text(PortForwardingStrings.manualForwardHint)
    }
    .overlay(alignment: .bottom) {
      if copiedForwardID != nil {
        Label(PortForwardingStrings.copied, systemImage: "doc.on.doc")
          .font(.footnote)
          .padding(10)
          .poracodeGlassBackground(in: Capsule())
          .padding()
          .task {
            try? await Task.sleep(for: .seconds(1.5))
            copiedForwardID = nil
          }
      }
    }
    .task { await controller.scan() }
    .onDisappear { cancelAction() }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { cancelAction() }
    }
  }

  private var canUse: Bool {
    access?.capabilities.contains(.forward) == true
  }

  private var manualPortValid: Bool {
    let port = Int(manualPort.trimmingCharacters(in: .whitespaces))
    return port.map((1...65_535).contains) ?? false
  }

  private func showDetectedSection(_ projection: PortForwardingViewProjection) -> Bool {
    let visible = projection.detected.filter(\.canStart)
    return !visible.isEmpty || projection.active.isEmpty
  }

  private func gateState(
    systemImage: String,
    title: String,
    hint: String,
    @ViewBuilder action: () -> some View = { EmptyView() }
  ) -> some View {
    Section {
      VStack(spacing: 8) {
        ContentUnavailableView {
          Label(title, systemImage: systemImage)
        } description: {
          Text(hint)
        } actions: {
          action()
      }
      .padding(.vertical, 12)
      }
    }
  }

  private func detectedRow(_ row: PortForwardingDetectedRow) -> some View {
    PortForwardingActionSurface {
      Button {
        run { await controller.start(port: row.id) }
      } label: {
        HStack(spacing: 12) {
          Image(systemName: "plug")
            .foregroundStyle(.secondary)
          VStack(alignment: .leading, spacing: 2) {
            Text(row.title)
              .font(.body.weight(.medium))
              .foregroundStyle(.primary)
            if let subtitle = row.subtitle {
              Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
          Spacer()
          if row.isBusy {
            ProgressView()
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(!row.canStart || row.isBusy)
      .accessibilityLabel(PortForwardingStrings.start)
      .accessibilityValue(row.title)
      .accessibilityIdentifier("port-forwarding.start.\(row.id)")
    }
  }

  private func activeRow(_ row: PortForwardingActiveRow) -> some View {
    PortForwardingActionSurface {
      HStack(spacing: 12) {
        Button {
          run { await controller.open(forwardID: row.id) }
        } label: {
          HStack(spacing: 12) {
            Image(systemName: "powerplug")
              .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
              Text(row.title)
                .font(.body.weight(.medium))
                .foregroundStyle(.primary)
              Text(row.value)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            if row.isBusy {
              ProgressView()
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!row.canOpen || row.isBusy)
        .accessibilityLabel(PortForwardingStrings.open)
        .accessibilityValue(row.title)
        .accessibilityIdentifier("port-forwarding.open.\(row.id)")

        Menu {
          Button {
            run { await controller.open(forwardID: row.id) }
          } label: {
            Label(PortForwardingStrings.openInBrowser, systemImage: "safari")
          }
          Button {
            copyURL(row)
          } label: {
            Label(PortForwardingStrings.copyURL, systemImage: "doc.on.doc")
          }
          Button(role: .destructive) {
            run { await controller.stop(forwardID: row.id) }
          } label: {
            Label(PortForwardingStrings.stopForwarding, systemImage: "powerplug")
          }
        } label: {
          Image(systemName: "ellipsis")
            .frame(width: 34, height: 34)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(PortForwardingStrings.actions)
        .accessibilityIdentifier("port-forwarding.actions.\(row.id)")
      }
    }
  }

  private func copyURL(_ row: PortForwardingActiveRow) {
    guard let copyAddress else { return }
    actionTask?.cancel()
    actionTask = Task {
      if let url = await copyAddress(row.id) {
        UIPasteboard.general.url = url
        copiedForwardID = row.id
      }
    }
  }

  private func run(_ operation: @escaping @MainActor () async -> Void) {
    actionTask?.cancel()
    actionTask = Task { await operation() }
  }

  private func cancelAction() {
    actionTask?.cancel()
    actionTask = nil
  }
}
