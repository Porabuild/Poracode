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
  @AppStorage private var storedTextSize: Int
  @ScaledMetric(relativeTo: .body) private var dynamicTypeScale: CGFloat = 1

  init(
    controller: RichChatTerminalController,
    terminalID: String,
    canOperate: Bool,
    textSizeRole: PoracodeTerminalTextSizeRole = .agent
  ) {
    self.controller = controller
    self.terminalID = terminalID
    self.canOperate = canOperate
    _storedTextSize = AppStorage(
      wrappedValue: textSizeRole.initialValue(),
      textSizeRole.storageKey
    )
  }

  var body: some View {
    GeometryReader { proxy in
      VStack(spacing: 0) {
        statusBar
        ZStack {
          Color(red: 0.035, green: 0.04, blue: 0.055)
          TerminalTextSurface(
            transcript: controller.state.cursor?.transcript ?? "",
            accessibilityLabel: TerminalStrings.output,
            fontSize: terminalPointSize
          )
          if controller.state.cursor?.transcript.isEmpty != false {
            Text(TerminalStrings.empty)
              .font(.system(size: terminalPointSize, design: .monospaced))
              .foregroundStyle(.secondary)
              .allowsHitTesting(false)
          }
        }
        Divider().overlay(Color.white.opacity(0.12))
        inputBar
      }
      .onAppear { scheduleResize(for: proxy.size) }
      .onChange(of: proxy.size) { _, size in scheduleResize(for: size) }
      .onChange(of: terminalPointSize) { scheduleResize(for: proxy.size, force: true) }
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
          .font(.system(size: terminalPointSize, design: .monospaced))
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
      TerminalKeyAccessory(
        isEnabled: canOperate && isLive && controller.state.operation == nil,
        send: sendControl
      )
    }
    .padding(12)
    .background(.bar)
  }

  private var canSend: Bool {
    canOperate && isLive && !input.isEmpty && controller.state.operation == nil
  }

  private var terminalPointSize: CGFloat {
    CGFloat(PoracodeTerminalTextSize.resolve(storedTextSize)) * dynamicTypeScale
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
    let font = TerminalTextAttributes.font(pointSize: terminalPointSize)
    guard let next = TerminalViewportMetrics.size(for: bounds, font: font),
      force || next != viewportSize
    else {
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

enum TerminalVirtualModifier: String, CaseIterable, Identifiable, Sendable {
  case shift
  case control
  case command

  var id: Self { self }

  var label: String {
    switch self {
    case .shift: "⇧"
    case .control: "⌃"
    case .command: "⌘"
    }
  }
}

enum TerminalVirtualKey: String, CaseIterable, Identifiable, Sendable {
  case escape
  case tab
  case enter
  case backspace
  case up
  case down
  case left
  case right
  case t
  case c

  var id: Self { self }

  var label: String {
    switch self {
    case .escape: "Esc"
    case .tab: TerminalStrings.tab
    case .enter: "↵"
    case .backspace: "⌫"
    case .up: "↑"
    case .down: "↓"
    case .left: "←"
    case .right: "→"
    case .t: "T"
    case .c: "C"
    }
  }
}

enum TerminalVirtualKeyEncoder {
  static func encode(
    _ key: TerminalVirtualKey,
    modifiers: Set<TerminalVirtualModifier> = []
  ) -> String {
    if modifiers.isEmpty { return unmodified(key) }

    if modifiers == [.control] {
      if key == .tab { return "\u{1B}[9;5u" }
      if let ascii = letter(key)?.asciiValue,
        let scalar = UnicodeScalar(Int(ascii) - 64)
      {
        return String(scalar)
      }
    }
    if modifiers == [.shift], key == .tab { return "\u{1B}[Z" }

    let modifier =
      1
      + (modifiers.contains(.shift) ? 1 : 0)
      + (modifiers.contains(.control) ? 4 : 0)
      + (modifiers.contains(.command) ? 8 : 0)
    if let suffix = arrowSuffix(key) { return "\u{1B}[1;\(modifier)\(suffix)" }
    guard let codePoint = codePoint(key) else { return "" }
    return "\u{1B}[\(codePoint);\(modifier)u"
  }

  private static func unmodified(_ key: TerminalVirtualKey) -> String {
    switch key {
    case .escape: "\u{1B}"
    case .tab: "\t"
    case .enter: "\r"
    case .backspace: "\u{7F}"
    case .up: "\u{1B}[A"
    case .down: "\u{1B}[B"
    case .left: "\u{1B}[D"
    case .right: "\u{1B}[C"
    case .t: "t"
    case .c: "c"
    }
  }

  private static func letter(_ key: TerminalVirtualKey) -> Character? {
    switch key {
    case .t: "T"
    case .c: "C"
    default: nil
    }
  }

  private static func arrowSuffix(_ key: TerminalVirtualKey) -> String? {
    switch key {
    case .up: "A"
    case .down: "B"
    case .right: "C"
    case .left: "D"
    default: nil
    }
  }

  private static func codePoint(_ key: TerminalVirtualKey) -> Int? {
    switch key {
    case .enter: 13
    case .backspace: 127
    case .escape: 27
    case .tab: 9
    case .t: 84
    case .c: 67
    case .up, .down, .left, .right: nil
    }
  }
}

private struct TerminalKeyAccessory: View {
  let isEnabled: Bool
  let send: (String) -> Void

  @State private var modifiers = Set<TerminalVirtualModifier>()

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(TerminalVirtualModifier.allCases) { modifier in
          Button {
            if modifiers.contains(modifier) {
              modifiers.remove(modifier)
            } else {
              modifiers.insert(modifier)
            }
          } label: {
            Text(verbatim: modifier.label)
              .frame(minWidth: 18)
          }
          .tint(modifiers.contains(modifier) ? .accentColor : .secondary)
          .accessibilityAddTraits(modifiers.contains(modifier) ? .isSelected : [])
        }

        Divider().frame(height: 22)

        ForEach(TerminalVirtualKey.allCases) { key in
          Button {
            send(TerminalVirtualKeyEncoder.encode(key, modifiers: modifiers))
            modifiers.removeAll()
          } label: {
            Text(verbatim: key.label)
              .frame(minWidth: 18)
          }
        }
      }
    }
    .buttonStyle(.bordered)
    .controlSize(.small)
    .disabled(!isEnabled)
    .onChange(of: isEnabled) { _, enabled in
      if !enabled { modifiers.removeAll() }
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
