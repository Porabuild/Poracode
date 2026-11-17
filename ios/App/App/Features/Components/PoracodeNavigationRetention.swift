import Observation
import SwiftUI

/// Each Home window keeps the container presenting its sheets alive until the
/// last sheet disappears. The content still receives the new display geometry.
@MainActor
@Observable
final class PoracodeNavigationRetention {
  private var presentations = Set<UUID>()

  var isActive: Bool { !presentations.isEmpty }

  func retain(_ presentation: UUID) { presentations.insert(presentation) }
  func release(_ presentation: UUID) { presentations.remove(presentation) }
}

private struct PoracodeNavigationRetentionKey: EnvironmentKey {
  static let defaultValue: PoracodeNavigationRetention? = nil
}

extension EnvironmentValues {
  var poracodeNavigationRetention: PoracodeNavigationRetention? {
    get { self[PoracodeNavigationRetentionKey.self] }
    set { self[PoracodeNavigationRetentionKey.self] = newValue }
  }
}

/// Apply to a sheet's content, rather than its presenting page, so closing the
/// sheet restores normal adaptation after its dismissal transition finishes.
struct PoracodeRetainNavigationWhilePresented: ViewModifier {
  @Environment(\.poracodeNavigationRetention) private var retention
  @State private var presentation = UUID()

  func body(content: Content) -> some View {
    content
      .onAppear { retention?.retain(presentation) }
      .onDisappear { retention?.release(presentation) }
  }
}
