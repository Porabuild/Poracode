import SwiftUI

/// Production composition boundary for Advanced Operations.
///
/// The selection source, credential resolution, and controllers are retained
/// for the lifetime of this destination instead of being rebuilt on every
/// SwiftUI render. The surface it was opened from supplies the owner, so the
/// project and thread entry points reach the same boundary with different
/// authority and never invent context of their own.
struct AdvancedOperationsSessionView: View {
  @Bindable var session: AppSession
  let surface: AdvancedOperationsSurface

  @Environment(\.scenePhase) private var scenePhase
  @State private var source: AdvancedOperationsSelectionSource
  @State private var composition: AdvancedOperationsComposition
  @State private var transport: AdvancedOperationsExactHostTransportSource

  init(session: AppSession, surface: AdvancedOperationsSurface) {
    self.session = session
    self.surface = surface
    let source = session.makeAdvancedOperationsSelectionSource(surface: surface)
    _source = State(initialValue: source)
    _composition = State(
      initialValue: session.makeAdvancedOperationsComposition(source: source)
    )
    _transport = State(
      initialValue: session.makeAdvancedOperationsTransportSource(source: source)
    )
  }

  var body: some View {
    VStack(spacing: 12) {
      if let reason = unavailability {
        AdvancedOperationsUnavailableBanner(message: reason)
          .padding(.horizontal, 20)
          .padding(.top, 12)
      }
      AdvancedOperationsScreen(composition: composition)
    }
    .task(id: source.ownerKey) {
      source.synchronize()
      await resolveHost()
    }
    .task(id: source.binding) { await resolveHost() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        source.leaveBackground()
      } else {
        source.enterBackground()
      }
    }
    .onDisappear { source.enterBackground() }
  }

  /// Localized explanation for a surface whose owner cannot be derived. It is
  /// shown alongside the disabled actions rather than replacing them, so the
  /// user can see which operations exist and why none of them can run.
  private var unavailability: String? {
    guard source.binding != nil else { return AdvancedOperationsStrings.unavailableNoHost }
    let key = source.ownerKey
    switch surface {
    case .project:
      return key.projectLocation == nil ? AdvancedOperationsStrings.unavailableNoProject : nil
    case .thread:
      if key.threadID == nil { return AdvancedOperationsStrings.unavailableNoThread }
      return key.projectLocation == nil
        ? AdvancedOperationsStrings.unavailableNoLocation : nil
    }
  }

  /// Cancellation is not an error here: `.task(id:)` cancels this on every
  /// owner or host change and the next identity resolves from scratch.
  private func resolveHost() async {
    source.invalidateHost()
    guard scenePhase != .background else { return }
    do {
      let resolved = try await transport.resolve()
      guard !Task.isCancelled else { return }
      source.adoptResolvedHost(resolved)
    } catch is CancellationError {
      return
    } catch {
      source.adoptResolvedHost(nil)
    }
  }
}

struct AdvancedOperationsUnavailableBanner: View {
  let message: String

  var body: some View {
    AdvancedOperationsChrome.card {
      Label(message, systemImage: "lock.slash")
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(message)
        .accessibilityIdentifier("advancedOperations.unavailable")
    }
  }
}
