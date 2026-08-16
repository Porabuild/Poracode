import SwiftUI

#if DEBUG
  import Combine
#endif

#if DEBUG
  /// Debug-only bridge for InjectionNext. The console runner provides the
  /// verified injection bundle to the simulator process; release builds contain
  /// none of this runtime. Invalidating the root view re-evaluates injected
  /// SwiftUI bodies without replacing AppSession or changing the view identity.
  @MainActor
  private final class NativeHotReloadObserver: ObservableObject {
    static let shared = NativeHotReloadObserver()

    @Published private(set) var generation = 0
    private var notification: AnyCancellable?

    private init() {
      let path =
        Bundle.main.path(forResource: "iOSInjection", ofType: "bundle")
        ?? ProcessInfo.processInfo.environment["PORACODE_INJECTION_BUNDLE_PATH"]
      if let path {
        _ = Bundle(path: path)?.load()
      }
      notification = NotificationCenter.default
        .publisher(for: Notification.Name("INJECTION_BUNDLE_NOTIFICATION"))
        .receive(on: RunLoop.main)
        .sink { [weak self] _ in
          self?.generation &+= 1
        }
    }
  }
#endif

@main
struct PoracodeApp: App {
  @UIApplicationDelegateAdaptor(NotificationAppDelegate.self) private var appDelegate
  @State private var session = AppSession()
  @Environment(\.scenePhase) private var scenePhase

  init() {
    GeneratedRemoteV3Contract.assertCompatibility()
  }

  var body: some Scene {
    WindowGroup {
      PoracodeThemeRoot {
        RootView(session: session)
      }
      .task {
        NotificationIngress.shared.attach(session: session)
        await NotificationPermissionController.shared.refreshAndRegisterIfUsable()
        await session.bootstrap()
        NotificationIngress.shared.setForeground(scenePhase == .active)
      }
      .onChange(of: scenePhase) { _, newPhase in
        session.handleScenePhase(newPhase)
        NotificationIngress.shared.setForeground(newPhase == .active)
        if newPhase == .active {
          Task {
            await NotificationPermissionController.shared.refreshAndRegisterIfUsable()
          }
        }
      }
      .onOpenURL { url in
        if !NotificationIngress.shared.receiveURL(url) {
          Task { await session.handleIncomingPairingURL(url) }
        }
      }
    }
  }
}

struct RootView: View {
  @Bindable var session: AppSession
  #if DEBUG
    @ObservedObject private var hotReload = NativeHotReloadObserver.shared
  #endif

  var body: some View {
    #if DEBUG
      let _ = hotReload.generation
    #endif
    Group {
      switch RootPresentation.resolve(phase: session.phase, hasProfile: session.profile != nil) {
      case .splash:
        BrandLaunchView()
      case .onboarding:
        OnboardingView(session: session)
      case .home:
        HomeView(session: session)
      }
    }
    .animation(.easeInOut(duration: 0.2), value: session.phase)
    .animation(.easeInOut(duration: 0.2), value: session.selectedConnectionId?.rawValue)
    #if DEBUG
      // Type erasure gives injected body implementations a stable dynamic
      // boundary while preserving the identity and state above it.
      .eraseToAnyViewForNativeHotReload()
    #endif
  }
}

enum RootPresentation: Equatable {
  case splash
  case onboarding
  case home

  static func resolve(phase: SessionPhase, hasProfile: Bool) -> Self {
    switch phase {
    case .launching:
      return .splash
    case .ready:
      return .home
    case .connecting where hasProfile:
      return .home
    case .needsPairing, .connecting, .sessionExpired, .protocolIncompatible,
      .localStoreInconsistent:
      return .onboarding
    }
  }
}

#if DEBUG
  extension View {
    fileprivate func eraseToAnyViewForNativeHotReload() -> some View {
      AnyView(self)
    }
  }
#endif
