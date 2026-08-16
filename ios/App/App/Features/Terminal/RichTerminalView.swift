import SwiftUI

struct RichTerminalView: View {
  let controller: RichChatTerminalController
  let terminalID: String
  let canOperate: Bool

  @State private var input = ""
  @State private var viewportSize: TerminalViewportSize?
  @State private var resizeTask: Task<Void, Never>?
  @State private var showsCloseConfirmation = false
  @FocusState private var inputFocused: Bool

  var body: some View {
    GeometryReader { proxy in
      VStack(spacing: 0) {
        statusBar
        ZStack {
          Color(red: 0.035, green: 0.04, blue: 0.055)
          TerminalTextSurface(
            transcript: controller.state.cursor?.transcript ?? "",
            accessibilityLabel: TerminalStrings.output
          )
          if controller.state.cursor?.transcript.isEmpty != false {
            Text(TerminalStrings.empty)
              .font(.callout.monospaced())
              .foregroundStyle(.secondary)
              .allowsHitTesting(false)
          }
        }
        Divider().overlay(Color.white.opacity(0.12))
        inputBar
      }
      .onAppear { scheduleResize(for: proxy.size) }
      .onChange(of: proxy.size) { _, size in scheduleResize(for: size) }
      .onChange(of: controller.state.lifecycle) { _, lifecycle in
        if lifecycle == .watching { scheduleResize(for: proxy.size, force: true) }
      }
    }
    .background(Color(red: 0.035, green: 0.04, blue: 0.055).ignoresSafeArea())
    .confirmationDialog(
      TerminalStrings.closeTitle,
      isPresented: $showsCloseConfirmation,
      titleVisibility: .visible
    ) {
      Button(TerminalStrings.close, role: .destructive) {
        Task { await controller.close() }
      }
      Button(TerminalStrings.cancel, role: .cancel) {}
    } message: {
      Text(TerminalStrings.closeMessage)
    }
    .onDisappear {
      resizeTask?.cancel()
      resizeTask = nil
    }
  }

  private var statusBar: some View {
    HStack(spacing: 8) {
      if controller.state.lifecycle == .starting, controller.state.exit == nil {
        ProgressView().controlSize(.small)
      } else {
        Image(systemName: statusSymbol)
          .foregroundStyle(statusColor)
          .accessibilityHidden(true)
      }
      Text(
        TerminalStrings.status(
          controller.state.lifecycle,
          connection: controller.state.connectionState,
          exit: controller.state.exit
        )
      )
      .font(.caption.weight(.medium))
      .lineLimit(1)
      Spacer(minLength: 8)
      if controller.state.exit == nil,
        case .watchFailed(let retryable) = controller.state.lifecycle, retryable
      {
        Button(TerminalStrings.reconnect, systemImage: "arrow.clockwise") {
          Task { await controller.watch(terminalID: terminalID) }
        }
        .labelStyle(.iconOnly)
      }
      Button(TerminalStrings.close, systemImage: "xmark.circle") {
        showsCloseConfirmation = true
      }
      .labelStyle(.iconOnly)
      .disabled(!canOperate || controller.state.operation != nil)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .foregroundStyle(.white)
    .terminalControlChrome()
  }

  private var inputBar: some View {
    VStack(alignment: .leading, spacing: 8) {
      if !canOperate {
        Label(TerminalStrings.readOnly, systemImage: "lock")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      HStack(alignment: .bottom, spacing: 8) {
        TextField(TerminalStrings.inputPlaceholder, text: $input, axis: .vertical)
          .focused($inputFocused)
          .font(.body.monospaced())
          .lineLimit(1...4)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .submitLabel(.send)
          .accessibilityLabel(TerminalStrings.input)
          .onSubmit { sendCommand() }
          .disabled(!canOperate || !isLive)
        Button(TerminalStrings.send, systemImage: "arrow.up.circle.fill") {
          sendCommand()
        }
        .labelStyle(.iconOnly)
        .font(.title2)
        .accessibilityHint(TerminalStrings.sendHint)
        .disabled(!canSend)
      }
      HStack(spacing: 10) {
        Button(TerminalStrings.controlC) { sendControl("\u{3}") }
        Button(TerminalStrings.tab) { sendControl("\t") }
        Spacer()
      }
      .buttonStyle(.bordered)
      .controlSize(.small)
      .disabled(!canOperate || !isLive || controller.state.operation != nil)
    }
    .padding(12)
    .background(.bar)
  }

  private var canSend: Bool {
    canOperate && isLive && !input.isEmpty && controller.state.operation == nil
  }

  /// A host-reported exit ends input even while the socket is still attached.
  private var isLive: Bool {
    controller.state.lifecycle == .watching && controller.state.exit == nil
  }

  private var statusSymbol: String {
    if controller.state.exit != nil { return "stop.circle.fill" }
    switch controller.state.lifecycle {
    case .watching: return "checkmark.circle.fill"
    case .watchFailed: return "exclamationmark.triangle.fill"
    case .inactive, .starting: return "circle.dotted"
    }
  }

  private var statusColor: Color {
    if controller.state.exit != nil { return .secondary }
    switch controller.state.lifecycle {
    case .watching: return .green
    case .watchFailed: return .orange
    case .inactive, .starting: return .secondary
    }
  }

  private func sendCommand() {
    guard canSend else { return }
    let value = input + "\n"
    input = ""
    Task { await controller.write(value) }
  }

  private func sendControl(_ value: String) {
    guard canOperate, isLive, controller.state.operation == nil else { return }
    Task { await controller.write(value) }
  }

  private func scheduleResize(for bounds: CGSize, force: Bool = false) {
    guard let next = TerminalViewportMetrics.size(for: bounds), force || next != viewportSize else {
      return
    }
    viewportSize = next
    resizeTask?.cancel()
    resizeTask = Task {
      do {
        if !force { try await Task.sleep(for: .milliseconds(180)) }
        try Task.checkCancellation()
      } catch { return }
      await controller.resize(
        RichChatTerminalSize(columns: next.columns, rows: next.rows)
      )
    }
  }
}

extension View {
  @ViewBuilder
  fileprivate func terminalControlChrome() -> some View {
    if #available(iOS 26.0, *) {
      self.glassEffect(.regular, in: .rect(cornerRadius: 14))
    } else {
      self.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }
  }
}
