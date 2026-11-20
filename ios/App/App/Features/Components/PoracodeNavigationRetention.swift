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
  func release(_ presentation: UUID) {
    if presentations.contains(presentation) { presentations.remove(presentation) }
  }
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

/// Keeps the current navigation container until a presented tool closes.
/// The tool still receives the current viewport and safe areas.
struct PoracodeRetainNavigationWhilePresented: ViewModifier {
  var isPresented = true
  @Environment(\.poracodeNavigationRetention) private var retention
  @State private var presentation = UUID()

  func body(content: Content) -> some View {
    content
      .onAppear {
        if isPresented { retention?.retain(presentation) }
      }
      .onChange(of: isPresented) { _, presented in
        if presented { retention?.retain(presentation) }
        else { retention?.release(presentation) }
      }
      .onDisappear { retention?.release(presentation) }
  }
}
