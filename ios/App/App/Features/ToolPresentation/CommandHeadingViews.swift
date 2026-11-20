import SwiftUI

private struct RuntimeItemHeadingControllerKey: EnvironmentKey {
  static let defaultValue: RichRuntimeItemHeadingController? = nil
}
private struct RuntimeItemHeadingSnapshotKey: EnvironmentKey {
  static let defaultValue: [String: RichRuntimeItemHeadingRecord] = [:]
}
extension EnvironmentValues {
  var runtimeItemHeadingSnapshot: [String: RichRuntimeItemHeadingRecord] {
    get { self[RuntimeItemHeadingSnapshotKey.self] }
    set { self[RuntimeItemHeadingSnapshotKey.self] = newValue }
  }
  var runtimeItemHeadings: RichRuntimeItemHeadingController? {
    get { self[RuntimeItemHeadingControllerKey.self] }
    set { self[RuntimeItemHeadingControllerKey.self] = newValue }
  }
}

/// List rows and collapsed groups request only their advertised visible inputs.
struct RuntimeItemHeadingRequests: ViewModifier {
  let items: [RichRuntimeItem]
  @Environment(\.toolPresentationCatalog) private var catalog
  @Environment(\.runtimeItemHeadings) private var controller
  private struct Work: Hashable { let target: RichChatThreadTarget?; let requests: [RichRuntimeItemHeadingRequest] }
  func body(content: Content) -> some View {
    let requests = Array(items.lazy.prefix(256).compactMap {
      RichRuntimeItemHeadingRequest($0, projection: catalog?.itemTypes[$0.type]?.workflowProjection)
        ?? RichRuntimeItemHeadingRequest($0, projection: catalog?.itemTypes[$0.type]?.headerProjection)
    })
    content.task(id: Work(target: controller?.target, requests: requests)) {
      guard !Task.isCancelled else { return }
      controller?.enqueue(requests)
    }
  }
}

struct RichRuntimeItemHeadingLabel: View {
  let heading: RichRuntimeItemHeading
  var body: some View {
    Group {
      if heading.title.objectValue?["kind"]?.stringValue == "view", let path = heading.path {
        let components = path.replacingOccurrences(of: "\\", with: "/").split(separator: "/", omittingEmptySubsequences: false)
        HStack(spacing: 4) {
          Text(heading.viewPrefix + (components.last.map(String.init) ?? path)).lineLimit(1).truncationMode(.middle)
          if components.count > 1 {
            Text(components.dropLast().joined(separator: "/"))
              .foregroundStyle(Color.poracodeTertiaryLabel).lineLimit(1).truncationMode(.head)
          }
          if heading.additionalActions > 0 { Text("+\(heading.additionalActions)") }
        }
      } else { Text(heading.displayTitle).lineLimit(1).truncationMode(.middle) }
    }
    .accessibilityElement(children: .ignore).accessibilityLabel(heading.displayTitle)
  }
}
