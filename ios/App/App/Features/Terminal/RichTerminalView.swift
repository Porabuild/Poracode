import SwiftUI
import UIKit

struct RichTerminalView: View {
  let controller: RichChatTerminalController
  let terminalID: String
  let canOperate: Bool
  @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector
  @Environment(\.poracodeTheme) private var theme
  @Environment(\.colorScheme) private var colorScheme
  private var terminalBackground: Color { theme.variant(for: colorScheme).background }

  @State private var input = ""
  @State private var inputFocused = false
  @State private var viewportSize: TerminalViewportSize?
  @State private var resizeTask: Task<Void, Never>?
  @State private var showsCloseConfirmation = false
  @AppStorage private var storedTextSize: Int
  @AppStorage(TerminalFontPreference.storageKey) private var storedFontName = TerminalFontPreference.storedName()
  @ScaledMetric(relativeTo: .body) private var dynamicTypeScale: CGFloat = 1
  @State private var outputBounds: CGSize = .zero

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
    let font = TerminalFontPreference.font(named: storedFontName, pointSize: terminalPointSize)
    VStack(spacing: 0) {
      statusBar
      ZStack {
        terminalBackground
        TerminalTextSurface(
          transcript: controller.state.cursor?.transcript ?? "",
          accessibilityLabel: TerminalStrings.output,
          font: font,
          onRawKeyInput: { value in
            guard acceptsRawKeyInput else { return }
            sendControl(value)
          }
        )
        if controller.state.cursor?.transcript.isEmpty != false {
          Text(TerminalStrings.empty)
            .font(Font(font))
            .foregroundStyle(Color.poracodeSecondaryLabel)
            .allowsHitTesting(false)
        }
      }
      .onGeometryChange(for: CGSize.self) { $0.size } action: { size in
        outputBounds = size
        scheduleResize(for: size, font: font)
      }
      Divider()
      inputBar(font: font)
    }
    .poracodeAvoidKeyboard(isActive: embeddedInInspector && inputFocused)
    .onChange(of: font) { scheduleResize(for: outputBounds, font: font) }
    .onChange(of: controller.state.lifecycle) { _, lifecycle in
      if lifecycle == .watching { scheduleResize(for: outputBounds, font: font, force: true) }
    }
    .background(terminalBackground.ignoresSafeArea())
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
    .foregroundStyle(.primary)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private func inputBar(font: UIFont) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      // "Read-only" names an access problem, so it is claimed only while the
      // transport is live. A lost host connection is an availability problem
      // the status line already reports ("Reconnecting…"), and the operate
      // grant is untouched by it.
      if availability == .readOnly {
        Label(TerminalStrings.readOnly, systemImage: "lock")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      HStack(alignment: .bottom, spacing: 8) {
        TerminalCommandField(
          text: $input,
          font: font,
          isDisabled: availability != .operable,
          accessibilityLabel: TerminalStrings.input,
          onFocusChanged: { inputFocused = $0 },
          onSubmit: sendCommand
        )
        .overlay(alignment: .topLeading) {
          if input.isEmpty {
            Text(TerminalStrings.inputPlaceholder)
              .font(Font(font))
              .foregroundStyle(Color.poracodeSecondaryLabel)
              .padding(.top, TerminalCommandFieldLayout.verticalInset)
              .allowsHitTesting(false)
          }
        }
        Button(TerminalStrings.send, systemImage: "arrow.up.circle.fill") {
          sendCommand()
        }
        .labelStyle(.iconOnly)
        .font(.title2)
        .accessibilityHint(TerminalStrings.sendHint)
        .accessibilityIdentifier("native-e2e.terminal.send")
        .disabled(!canSend)
      }
      TerminalKeyAccessory(
        isEnabled: canOperate && isLive && controller.state.operation == nil,
        send: sendControl
      )
    }
    .padding(12)
    .poracodeBarBackground()
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

  /// Access (scope granted) vs availability (host reachable and process live):
  /// only the former is described as read-only; the latter is left to the
  /// status line.
  private var availability: TerminalInputAvailability {
    TerminalInputAvailability.resolve(canOperate: canOperate, isLive: isLive)
  }

  /// Raw hardware-keyboard passthrough rides the same gate as the virtual
  /// key row: scope granted, process live, and no operation in flight.
  private var acceptsRawKeyInput: Bool {
    canOperate && isLive && controller.state.operation == nil
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

  private func scheduleResize(for bounds: CGSize, font: UIFont, force: Bool = false) {
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
      controller.resize(
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
  case d
  case l

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
    case .d: "D"
    case .l: "L"
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
    case .d: "d"
    case .l: "l"
    }
  }

  private static func letter(_ key: TerminalVirtualKey) -> Character? {
    switch key {
    case .t: "T"
    case .c: "C"
    case .d: "D"
    case .l: "L"
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
    case .d: 68
    case .l: 76
    case .up, .down, .left, .right: nil
    }
  }
}

private struct TerminalKeyAccessory: View {
  let isEnabled: Bool
  let send: (String) -> Void

  @Environment(\.poracodeAccent) private var accent
  @State private var modifiers = Set<TerminalVirtualModifier>()

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      PoracodeGlassGroup(spacing: 4) {
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
            .tint(modifiers.contains(modifier) ? accent : .secondary)
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
    }
    .poracodeGlassButtonStyle()
    .controlSize(.small)
    .disabled(!isEnabled)
    .onChange(of: isEnabled) { _, enabled in
      if !enabled { modifiers.removeAll() }
    }
  }
}
