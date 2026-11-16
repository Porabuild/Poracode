import SwiftUI
import UIKit
import WebKit

/// Settled assistant text split around `poracode-html` previews; native-visual
/// fences keep their source, as in the rest of the mobile transcript.
struct RichChatInlineVisualBlocksView: View {
  let blocks: [RichInlineVisualBlock]

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        switch block {
        case .markdown(let text):
          RichChatMarkdownView(source: text)
        case .html(let visual):
          RichChatHtmlVisualView(visual: visual).id(visual)
        case .source(let language, let source):
          RichChatMarkdownCodeBlock(language: language, source: source)
        }
      }
    }
  }
}

/// App theme values exposed to authored pages, mirroring the desktop variable set.
enum RichHtmlVisualTheme {
  static func value(palette: PoracodeThemeVariant, dark: Bool) -> RichJSON {
    let surface = palette.surfaceHex
    let foreground = palette.foregroundHex
    let variables: [String: String] = [
      "--background": surface,
      "--foreground": foreground,
      "--surface": "color-mix(in srgb, \(surface) 94%, \(foreground))",
      "--surface-secondary": "color-mix(in srgb, \(surface) 88%, \(foreground))",
      "--muted": "color-mix(in srgb, \(foreground) 62%, \(surface))",
      "--border": palette.borderHex,
      "--accent": palette.accentHex,
      "--accent-foreground": contrastingForeground(palette.accentHex),
      "--success": dark ? "#3fb950" : "#1a7f37",
      "--warning": dark ? "#d29922" : "#9a6700",
      "--danger": dark ? "#f85149" : "#cf222e",
      "--font-sans": "-apple-system, system-ui, sans-serif",
      "--font-mono": "ui-monospace, Menlo, monospace",
    ]
    return .object([
      "appearance": .string(dark ? "dark" : "light"),
      "variables": .object(variables.mapValues(RichJSON.string)),
    ])
  }

  /// Picks the text color with the higher WCAG contrast against `hex`.
  static func contrastingForeground(_ hex: String) -> String {
    let value = Int(hex.dropFirst(), radix: 16) ?? 0
    func channel(_ shift: Int) -> Double {
      let component = Double((value >> shift) & 0xFF) / 255
      return component <= 0.03928 ? component / 12.92 : pow((component + 0.055) / 1.055, 2.4)
    }
    let luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
    return (luminance + 0.05) * (luminance + 0.05) > 0.0562 ? "#0a0a12" : "#ffffff"
  }
}

struct RichChatHtmlVisualView: View {
  let visual: RichHtmlVisualPresentation
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme
  @State private var height: CGFloat = CGFloat(RichInlineVisualParser.minHeight)
  @State private var ready = false
  @State private var unavailable = false
  @State private var showSource = false
  @State private var pendingLink: URL?

  private var palette: PoracodeThemeVariant { theme.variant(for: colorScheme) }
  private var title: String { visual.title.isEmpty ? RichChatStrings.htmlVisualTitle : visual.title }

  private var sourceOnlyStatus: String? {
    switch visual.sourceOnlyReason {
    case .incomplete: RichChatStrings.htmlVisualIncomplete
    case .unsupported: RichChatStrings.htmlVisualUnsupported
    case .limited: RichChatStrings.htmlVisualLimited
    case .tooLarge: RichChatStrings.htmlVisualTooLarge
    case nil: unavailable ? RichChatStrings.htmlVisualUnavailable : nil
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      Divider()
      if let sourceOnlyStatus {
        Text(sourceOnlyStatus)
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
        Divider()
        source
      } else if showSource {
        source
      } else {
        if !ready {
          Text(RichChatStrings.htmlVisualLoading)
            .poracodeChatText(.metadata)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
        RichChatHtmlVisualContentView(
          html: visual.html,
          theme: RichHtmlVisualTheme.value(palette: palette, dark: colorScheme == .dark),
          onReady: { ready = true },
          onHeight: { height = $0 },
          onUnavailable: { unavailable = true },
          onOpenLink: { url in
            if pendingLink == nil { pendingLink = url }
          }
        )
        .frame(height: height)
        .opacity(ready ? 1 : 0)
        .accessibilityLabel(title)
      }
    }
    .background(palette.surface)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(palette.border.opacity(0.7), lineWidth: 0.5)
    }
    .confirmationDialog(
      RichChatStrings.htmlVisualOpenLinkTitle,
      isPresented: Binding(get: { pendingLink != nil }, set: { if !$0 { pendingLink = nil } }),
      titleVisibility: .visible,
      presenting: pendingLink
    ) { url in
      Button(RichChatStrings.htmlVisualOpenLink) { UIApplication.shared.open(url) }
      Button(RichChatStrings.cancel, role: .cancel) {}
    } message: { url in
      Text(url.absoluteString)
    }
  }

  private var header: some View {
    HStack(spacing: 8) {
      Image(systemName: "macwindow")
        .font(.caption)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Text(title)
        .poracodeChatText(.metadata, weight: .medium)
        .lineLimit(1)
        .truncationMode(.tail)
      Spacer(minLength: 4)
      if sourceOnlyStatus == nil {
        Button {
          showSource.toggle()
          ready = false
        } label: {
          Label(
            showSource ? RichChatStrings.htmlVisualPreview : RichChatStrings.htmlVisualSource,
            systemImage: "chevron.left.forwardslash.chevron.right"
          )
          .font(.caption)
        }
        .buttonStyle(.borderless)
      }
      Button {
        UIPasteboard.general.string = visual.html
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      } label: {
        Image(systemName: "doc.on.doc").font(.caption)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(RichChatStrings.htmlVisualCopySource)
    }
    .foregroundStyle(.secondary)
    .padding(.horizontal, 10)
    .padding(.vertical, 7)
  }

  private var source: some View {
    RichChatMarkdownCodeBlock(language: "html", source: visual.html)
      .padding(8)
  }
}

private struct RichChatHtmlVisualContentView: UIViewRepresentable {
  let html: String
  let theme: RichJSON
  let onReady: () -> Void
  let onHeight: (CGFloat) -> Void
  let onUnavailable: () -> Void
  let onOpenLink: (URL) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIView(context: Context) -> WKWebView {
    let view = RichChatSandboxWebView.make(delegate: context.coordinator) {
      DispatchQueue.main.async { onUnavailable() }
    }
    context.coordinator.view = view
    return view
  }

  func updateUIView(_ view: WKWebView, context: Context) {
    context.coordinator.parent = self
    if context.coordinator.started, context.coordinator.theme != theme {
      context.coordinator.theme = theme
      context.coordinator.evaluate("window.PoracodeHtmlVisual?.setTheme(value)", value: theme)
    }
  }

  static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
    coordinator.closed = true
    view.evaluateJavaScript("window.PoracodeHtmlVisual?.close()", completionHandler: nil)
    RichChatSandboxWebView.tearDown(view)
  }

  @MainActor
  final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var parent: RichChatHtmlVisualContentView
    weak var view: WKWebView?
    var started = false
    var theme: RichJSON?
    var closed = false
    init(_ parent: RichChatHtmlVisualContentView) { self.parent = parent }

    func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
      guard !started, !closed else { return }
      started = true
      theme = parent.theme
      evaluate(
        "window.PoracodeHtmlVisual.start(value)",
        value: .object(["html": .string(parent.html), "theme": parent.theme]))
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async
      -> WKNavigationActionPolicy
    {
      RichChatSandboxWebView.policy(for: action, started: started)
    }

    func evaluate(_ code: String, value: RichJSON) {
      guard !closed else { return }
      RichChatSandboxWebView.evaluate(view, code, value: value)
    }

    func userContentController(
      _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
    ) {
      guard !closed, message.frameInfo.isMainFrame, message.webView === view,
        let raw = message.body as? [String: Any], let operation = raw["operation"] as? String
      else { return }
      switch operation {
      case "ready":
        parent.onReady()
      case "height":
        if let height = raw["height"] as? Double, height.isFinite {
          parent.onHeight(
            CGFloat(
              min(
                max(height, RichInlineVisualParser.minHeight),
                RichInlineVisualParser.maxHeight)))
        }
      case "unavailable":
        parent.onUnavailable()
      case "openLink":
        if let url = RichInlineVisualParser.linkURL(raw["url"] as? String) { parent.onOpenLink(url) }
      default:
        break
      }
    }
  }
}
