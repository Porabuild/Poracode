import SwiftUI
import WebKit

/// Credential-free web view running the bundled sandbox host (`mcp-app-host.js`)
/// for MCP Apps and authored HTML previews.
@MainActor
enum RichChatSandboxWebView {
  static let handlerName = "poracodeMcpApp"

  static func make(
    delegate: some WKScriptMessageHandler & WKNavigationDelegate, onMissingHost: () -> Void
  ) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.userContentController.add(delegate, name: handlerName)
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.navigationDelegate = delegate
    view.isOpaque = false
    view.backgroundColor = .clear
    view.scrollView.isScrollEnabled = false
    guard let url = Bundle.main.url(forResource: "mcp-app-host", withExtension: "js"),
      let script = try? String(contentsOf: url, encoding: .utf8)
    else {
      onMissingHost()
      return view
    }
    let escaped = script.replacingOccurrences(of: "</script", with: "<\\/script", options: .caseInsensitive)
    view.loadHTMLString("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><script>\(escaped)</script></body></html>", baseURL: URL(string: "http://localhost/"))
    return view
  }

  /// Only the host page loads in the main frame; nested sandbox frames stay CSP-bound.
  static func policy(for action: WKNavigationAction, started: Bool) -> WKNavigationActionPolicy {
    if action.targetFrame?.isMainFrame == false { return .allow }
    return !started && ["about:blank", "http://localhost/"].contains(action.request.url?.absoluteString ?? "") ? .allow : .cancel
  }

  static func evaluate(_ view: WKWebView?, _ code: String, value: RichJSON) {
    guard let data = try? JSONEncoder().encode(value),
      let object = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
    else { return }
    view?.callAsyncJavaScript(code, arguments: ["value": object], in: nil, in: .page, completionHandler: nil)
  }

  static func tearDown(_ view: WKWebView) {
    view.configuration.userContentController.removeScriptMessageHandler(forName: handlerName)
    view.stopLoading()
    view.loadHTMLString("", baseURL: nil)
  }
}

struct RichChatMcpAppView: View {
  let app: RichMcpAppPresentation
  let actions: RichChatTimelineActions
  let fallback: String
  @Environment(\.colorScheme) private var colorScheme
  @State private var height: CGFloat = 240
  @State private var unavailable = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(app.title).font(.caption).foregroundStyle(.secondary)
      if unavailable || actions.controlMcpApp == nil {
        Text(fallback).font(.footnote).textSelection(.enabled)
      } else {
        McpAppContentView(
          app: app, actions: actions, theme: colorScheme == .dark ? "dark" : "light",
          onHeight: { height = $0 }, onUnavailable: { unavailable = true }
        ).frame(height: height)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 12))
  }
}

private struct McpAppContentView: UIViewRepresentable {
  let app: RichMcpAppPresentation
  let actions: RichChatTimelineActions
  let theme: String
  let onHeight: (CGFloat) -> Void
  let onUnavailable: () -> Void

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
    if context.coordinator.started {
      context.coordinator.evaluate("window.PoracodeMcpApp?.setContext(value)", value: hostContext)
    }
  }

  static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
    coordinator.closed = true
    view.evaluateJavaScript("window.PoracodeMcpApp?.close()", completionHandler: nil)
    coordinator.tasks.values.forEach { $0.cancel() }
    coordinator.tasks.removeAll()
    RichChatSandboxWebView.tearDown(view)
  }

  private var hostContext: RichJSON {
    .object(["theme": .string(theme), "platform": .string("mobile"),
      "locale": .string(Locale.current.identifier.replacingOccurrences(of: "_", with: "-")),
      "timeZone": .string(TimeZone.current.identifier), "displayMode": .string("inline"),
      "availableDisplayModes": .array([.string("inline")])])
  }

  @MainActor
  final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var parent: McpAppContentView
    weak var view: WKWebView?
    var started = false
    var closed = false
    var tasks: [String: Task<Void, Never>] = [:]
    init(_ parent: McpAppContentView) { self.parent = parent }

    func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
      guard !started, !closed else { return }
      started = true
      evaluate("window.PoracodeMcpApp.start(value)", value: .object([
        "app": parent.app.reference, "threadId": .string(parent.actions.mcpAppThreadID ?? ""),
        "input": parent.app.input, "result": parent.app.result, "context": parent.hostContext,
      ]))
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
      RichChatSandboxWebView.policy(for: action, started: started)
    }

    func evaluate(_ code: String, value: RichJSON) {
      guard !closed else { return }
      RichChatSandboxWebView.evaluate(view, code, value: value)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
      guard !closed, message.frameInfo.isMainFrame, message.webView === view,
        let raw = message.body as? [String: Any], let operation = raw["operation"] as? String
      else { return }
      if operation == "height", let height = raw["height"] as? Double, height.isFinite {
        parent.onHeight(CGFloat(max(120, min(1200, height)))); return
      }
      if operation == "unavailable" { parent.onUnavailable(); return }
      guard let id = raw["id"] as? String, UUID(uuidString: id) != nil, tasks.count < 16,
        tasks[id] == nil, let payload = raw["payload"],
        let data = try? JSONSerialization.data(withJSONObject: payload),
        let input = try? RichJSON.decode(data).objectValue
      else { return }
      tasks[id] = Task { [weak self] in
        guard let self else { return }
        defer { tasks[id] = nil }
        do {
          let result: RichJSON
          switch operation {
          case "control":
            guard input["app"] == parent.app.reference, let control = parent.actions.controlMcpApp else { throw RichChatGatewayError.unavailable }
            result = try await control(input)
          case "sendMessage":
            guard let text = input["text"]?.stringValue, !text.isEmpty, text.count <= 65_536,
              let send = parent.actions.sendMcpAppMessage, await send(text)
            else { throw RichChatGatewayError.unavailable }
            result = .object([:])
          case "openLink":
            guard let text = input["url"]?.stringValue, let url = URL(string: text),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil,
              url.user == nil, url.password == nil, await UIApplication.shared.open(url)
            else { throw RichChatGatewayError.invalidRequest }
            result = .object([:])
          default: throw RichChatGatewayError.invalidRequest
          }
          try Task.checkCancellation()
          evaluate("window.PoracodeMcpApp.respond(value.id,value.result)", value: .object(["id": .string(id), "result": result]))
        } catch {
          evaluate("window.PoracodeMcpApp.respond(value.id,null,'MCP App request failed.')", value: .object(["id": .string(id)]))
        }
      }
    }
  }
}
