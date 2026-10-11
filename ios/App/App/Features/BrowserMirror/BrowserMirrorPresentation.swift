import Foundation

/// Interface phase for the mirrored viewport. Derived only from controller state so the
/// same classification can be asserted without a rendered view.
enum BrowserMirrorPhase: Equatable, Sendable {
  case loading
  case stopped
  case empty
  case awaitingFrame
  case streaming
  case unavailable
  case failed
}

/// Local rendering mode for the mirrored frame. The protocol exposes no viewport or
/// device-emulation command, so this only changes how the received frame is presented.
enum BrowserMirrorViewportMode: String, CaseIterable, Equatable, Sendable {
  case fit
  case actual

  var label: String {
    switch self {
    case .fit: BrowserMirrorStrings.viewportFit
    case .actual: BrowserMirrorStrings.viewportActual
    }
  }
}

struct BrowserMirrorTabRow: Equatable, Identifiable, Sendable {
  let id: String
  let title: String
  let isActive: Bool
  let isLoading: Bool
  let canMoveBefore: Bool
  let canMoveAfter: Bool
}

/// Everything the interface renders, resolved from the controller on the main actor.
/// Copy always comes from the catalog; no server text reaches this projection.
struct BrowserMirrorViewProjection: Equatable, Sendable {
  let phase: BrowserMirrorPhase
  let tabs: [BrowserMirrorTabRow]
  let addressValue: String
  let canGoBack: Bool
  let canGoForward: Bool
  let canReload: Bool
  let canCreateTab: Bool
  let canSubmitAddress: Bool
  let acceptsInput: Bool
  let isMutating: Bool
  let isWatching: Bool
  let statusMessage: String?
  let noticeMessage: String?
  let viewportLabel: String?

  @MainActor
  init(controller: BrowserMirrorController) {
    let state = controller.browserState
    let active = state.activeTab
    let watching = controller.watchIntent
    phase = Self.phase(controller: controller)
    tabs = state.tabs.enumerated().map { index, tab in
      BrowserMirrorTabRow(
        id: tab.tabId,
        title: tab.title.isEmpty
          ? (tab.url.isEmpty ? BrowserMirrorStrings.untitledTab : tab.url)
          : tab.title,
        isActive: tab.tabId == state.activeTabId,
        isLoading: tab.loading,
        canMoveBefore: index > 0,
        canMoveAfter: index + 1 < state.tabs.count
      )
    }
    addressValue = active?.url ?? ""
    let operable = controller.isOperable && !controller.isMutating
    canGoBack = operable && active?.canGoBack == true
    canGoForward = operable && active?.canGoForward == true
    canReload = operable && active != nil
    canCreateTab = operable
    canSubmitAddress = operable && active != nil
    acceptsInput = controller.isStreamingInputAccepted
    isMutating = controller.isMutating
    isWatching = watching
    statusMessage = Self.statusMessage(phase: phase, controller: controller)
    noticeMessage = Self.noticeMessage(controller: controller)
    viewportLabel = controller.frame.map {
      BrowserMirrorStrings.viewportSize(
        width: Int($0.metadata.deviceWidth.rounded()),
        height: Int($0.metadata.deviceHeight.rounded())
      )
    }
  }

  @MainActor
  private static func phase(controller: BrowserMirrorController) -> BrowserMirrorPhase {
    if case .failed = controller.loadState { return .failed }
    if controller.loadState == .unavailable { return .unavailable }
    if !controller.watchIntent { return .stopped }
    if controller.loadState == .loading || controller.loadState == .idle { return .loading }
    if controller.mirrorStatus == .unavailable { return .unavailable }
    if controller.browserState.tabs.isEmpty { return .empty }
    return controller.frame == nil ? .awaitingFrame : .streaming
  }

  @MainActor
  private static func statusMessage(
    phase: BrowserMirrorPhase,
    controller: BrowserMirrorController
  ) -> String? {
    switch phase {
    case .loading: BrowserMirrorStrings.loading
    case .stopped: BrowserMirrorStrings.stopped
    case .empty: BrowserMirrorStrings.empty
    case .awaitingFrame: BrowserMirrorStrings.awaitingFrame
    case .streaming: nil
    case .unavailable: BrowserMirrorStrings.unavailable
    case .failed:
      if case .failed(let failure) = controller.loadState {
        BrowserMirrorStrings.failure(failure)
      } else {
        BrowserMirrorStrings.unavailable
      }
    }
  }

  @MainActor
  private static func noticeMessage(controller: BrowserMirrorController) -> String? {
    switch controller.lastMutationOutcome {
    case .none: nil
    case .ambiguousResolved: BrowserMirrorStrings.ambiguous
    case .ambiguousUnresolved: BrowserMirrorStrings.ambiguousUnresolved
    }
  }
}
