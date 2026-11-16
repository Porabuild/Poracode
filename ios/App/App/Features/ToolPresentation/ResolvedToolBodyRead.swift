import SwiftUI

private struct RuntimeToolBodySnapshotKey: EnvironmentKey {
  static let defaultValue: [String: RichResolvedToolBodyRecord] = [:]
}
extension EnvironmentValues {
  var runtimeToolBodySnapshot: [String: RichResolvedToolBodyRecord] {
    get { self[RuntimeToolBodySnapshotKey.self] }
    set { self[RuntimeToolBodySnapshotKey.self] = newValue }
  }
}

/// Optional display read attached to a visible row. Failure preserves its
/// complete canonical sections; synthetic transcripts only use their snapshot.
struct RichRuntimeToolBodyRead<Content: View>: View {
  let item: RichRuntimeItem
  let projection: RichRuntimeItemHeadingProjection?
  let content: (RichResolvedToolBody?) -> Content
  @Environment(\.runtimeItemHeadings) private var controller
  @Environment(\.runtimeToolBodySnapshot) private var snapshot
  @State private var loaded: Loaded?
  private struct Loaded {
    let target: RichChatThreadTarget
    let record: RichResolvedToolBodyRecord
  }
  private struct Work: Hashable {
    let target: RichChatThreadTarget?
    let request: RichRuntimeItemHeadingRequest?
    let readable: Bool
  }
  init(item: RichRuntimeItem, projection: RichRuntimeItemHeadingProjection?,
    @ViewBuilder content: @escaping (RichResolvedToolBody?) -> Content) {
    self.item = item; self.projection = projection; self.content = content
  }
  var body: some View {
    let request = RichRuntimeItemHeadingRequest(item, projection: projection)
    let snapshotBody = snapshot[item.id]?.displayBody(matching: request)
    let body = snapshotBody
      ?? (loaded?.target == controller?.target ? loaded?.record.displayBody(matching: request) : nil)
    content(body)
      .task(id: Work(target: controller?.target, request: request, readable: controller?.canReadAdvisory == true)) {
        loaded = nil
        guard snapshotBody == nil,
          let request, let controller, controller.canReadAdvisory, let target = controller.target else { return }
        do {
          let next = try await controller.readBodyAdvisory(request)
          guard !Task.isCancelled else { return }
          if let next { loaded = .init(target: target, record: next) }
        } catch { } // Advisory only; retain canonical output without retrying in a loop.
      }
  }
}
