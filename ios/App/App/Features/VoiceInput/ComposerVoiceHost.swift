import Observation
import SwiftUI

@MainActor final class ComposerVoiceRequest: Identifiable {
  let id = UUID()
  let controller: VoiceInputController
  let commit: (String) -> Void
  init(controller: VoiceInputController, commit: @escaping (String) -> Void) {
    self.controller = controller; self.commit = commit
  }
}

@MainActor @Observable final class ComposerVoiceState {
  var request: ComposerVoiceRequest?
  private(set) var visibleOwners = Set<VoiceInputOwner>()
  private(set) var presenterID: UUID?
  @ObservationIgnored var ownerIsPresented: (@MainActor () -> Bool)?
  @ObservationIgnored private(set) weak var session: AppSession?
  init(session: AppSession) { self.session = session }

  var canReparent: Bool { ownerIsPresented != nil }
  private var retainsOwner: Bool { ownerIsPresented?() == true }
  func owns(_ owner: VoiceInputOwner) -> Bool {
    guard ownerIsPresented?() != false else { return false }
    return visibleOwners.contains(owner) || (retainsOwner && request?.controller.owner == owner)
  }
  func refreshOwnership() {
    if let request, !owns(request.controller.owner) { close(request) }
  }
  func presenterAppeared(_ id: UUID) { presenterID = id }
  func presenterDisappeared(_ id: UUID) {
    guard presenterID == id else { return }
    presenterID = nil
    if !retainsOwner, let request { close(request) }
  }
  func dismiss(_ expected: ComposerVoiceRequest, from id: UUID) {
    guard presenterID == id else { return }
    // A retained capture can outlive its old sheet during adaptive reparenting.
    // Its sheet uses explicit Cancel/Insert; structural dismissal isn't cancellation.
    if retainsOwner, expected.controller.phase != .cancelled { return }
    close(expected)
  }

  func updateOwners(_ owners: Set<VoiceInputOwner>) {
    guard visibleOwners != owners else { return }
    visibleOwners = owners
    Task { @MainActor [weak self] in
      await Task.yield()
      guard let self, let request = self.request,
        !self.owns(request.controller.owner) else { return }
      self.close(request)
    }
  }

  func close(_ expected: ComposerVoiceRequest) {
    guard request === expected else { return }
    expected.controller.cancel()
    request = nil
  }
}

private struct ComposerVoiceKey: EnvironmentKey { static let defaultValue: ComposerVoiceState? = nil }
extension EnvironmentValues {
  var composerVoiceHost: ComposerVoiceState? {
    get { self[ComposerVoiceKey.self] }
    set { self[ComposerVoiceKey.self] = newValue }
  }
}

struct ComposerVoiceOwners: PreferenceKey {
  static let defaultValue = Set<VoiceInputOwner>()
  static func reduce(value: inout Set<VoiceInputOwner>, nextValue: () -> Set<VoiceInputOwner>) { value.formUnion(nextValue()) }
}

/// One presenter per window/modal scope. Toolbar reflow must not destroy an
/// active recorder or give its result to a replacement conversation.
struct ComposerVoiceHost: ViewModifier {
  @Environment(\.composerVoiceHost) private var inherited
  @Environment(\.scenePhase) private var scenePhase
  @State private var state: ComposerVoiceState
  @State private var presenterID = UUID()
  private let ownsScope: Bool
  init(session: AppSession, state: ComposerVoiceState? = nil) {
    ownsScope = state != nil
    _state = State(initialValue: state ?? ComposerVoiceState(session: session))
  }

  @ViewBuilder func body(content: Content) -> some View {
    if inherited != nil && !ownsScope { content }
    else {
      content.environment(\.composerVoiceHost, state)
        .onPreferenceChange(ComposerVoiceOwners.self) { state.updateOwners($0) }
        // The presenter is a sibling of the workspace's navigation content.
        // Wrapping an editable side-chat navigation tree in another sheet
        // presenter leaves UIKit's rotation animation awaiting completion.
        .background { ComposerVoicePresentation(state: state, presenterID: presenterID) }
        .onAppear {
          state.presenterAppeared(presenterID)
          if let request = state.request {
            let access = state.session?.currentRichChatAccess
            if access?.lease != request.controller.owner.lease || access?.controllerGate(.sessionOperate) != nil {
              state.close(request)
            }
          }
        }
        .onChange(of: state.session?.currentRichChatAccess) { _, access in
          guard let request = state.request else { return }
          if access?.lease != request.controller.owner.lease || access?.controllerGate(.sessionOperate) != nil {
            state.close(request)
          }
        }
        .onChange(of: scenePhase) { _, phase in
          if phase == .background, let request = state.request { state.close(request) }
        }
        .onDisappear { state.presenterDisappeared(presenterID) }
    }
  }
}

private struct ComposerVoicePresentation: View {
  let state: ComposerVoiceState
  let presenterID: UUID
  private var requestBinding: Binding<ComposerVoiceRequest?> {
    let captured = state.request
    return .init(get: { state.presenterID == presenterID ? state.request : nil },
      set: { if $0 == nil, let captured { state.dismiss(captured, from: presenterID) } })
  }
  var body: some View {
    Color.clear.frame(width: 0, height: 0)
      .sheet(item: requestBinding) { request in
        Group {
          if let session = state.session {
            VoiceInputSheet(session: session, controller: request.controller) {
              guard state.presenterID == presenterID, state.request === request, state.owns(request.controller.owner),
                session.currentRichChatAccess?.lease == request.controller.owner.lease else { return }
              request.commit(request.controller.transcript)
              state.close(request)
            }
          }
        }
        .interactiveDismissDisabled(state.canReparent)
      }
  }
}

struct ComposerVoiceButton: View {
  @Environment(\.composerVoiceHost) private var host
  @Bindable private var preferences = VoicePreferencesStore.shared
  let owner: VoiceInputOwner?
  @Binding var text: String
  @Binding var selection: NSRange?
  var isEnabled = true
  var visualSize: CGFloat = 32
  var prepareToRecord: () -> Void = {}
  var inserted: () -> Void = {}
  var keyboardOwnerID: UUID? = nil
  var stateOwnerID: ObjectIdentifier? = nil

  var body: some View {
    if preferences.value.showButton, let owner, let host, let session = host.session {
      Button {
        startRecording(owner: owner, host: host, session: session)
      } label: {
        Image(systemName: "mic")
          .font(.system(size: 15, weight: .medium))
          .frame(width: visualSize, height: visualSize)
          .background(Color.secondary.opacity(0.12), in: Circle())
          .frame(width: 44, height: 44).contentShape(Circle())
      }
      .buttonStyle(.plain).foregroundStyle(.secondary)
      .disabled(!isEnabled || preferences.incompatible || host.request != nil)
      .accessibilityLabel(VoiceStrings.start)
      .accessibilityIdentifier("native-e2e.voice.start")
      .preference(key: ComposerVoiceOwners.self, value: [owner])
      .nativeCommands(identity: "voice:\(owner.lease.connectionID.rawValue):\(owner.lease.generation):\(owner.conversationID)",
        focusOwnerID: keyboardOwnerID, revision: stateOwnerID, actions: [
          "composer.start-dictation": .init(enabled: keyboardOwnerID != nil && isEnabled
            && !preferences.incompatible && host.request == nil) { _ in
            startRecording(owner: owner, host: host, session: session)
          },
        ])
    }
  }

  private func startRecording(owner: VoiceInputOwner, host: ComposerVoiceState, session: AppSession) {
    guard isEnabled, preferences.value.showButton, !preferences.incompatible, host.request == nil,
      session.currentRichChatAccess?.lease == owner.lease else { return }
    prepareToRecord()
    let snapshot = VoiceDraftSnapshot(text: text, selection: selection)
    let hex = VoiceHexTranscriber(gateway: session.makeVoiceHexGateway(lease: owner.lease))
    let transcriber = ComposerVoiceTranscriber(local: WhisperVoiceTranscriber(), hex: hex)
    let controller = VoiceInputController(owner: owner, options: preferences.value, recorder: VoiceCaptureFactory.make(),
      transcriber: transcriber, currentOwner: { [weak host, weak session] in
        guard let host, let session, let access = session.currentRichChatAccess, access.controllerGate(.sessionOperate) == nil,
          host.owns(owner) else { return nil }
        return .init(lease: access.lease, conversationID: owner.conversationID)
      })
    let textBinding = $text, selectionBinding = $selection, didInsert = inserted
    host.request = ComposerVoiceRequest(controller: controller) { spoken in
      let result = snapshot.inserting(spoken, into: textBinding.wrappedValue)
      textBinding.wrappedValue = result.text; selectionBinding.wrappedValue = result.selection
      didInsert()
    }
  }
}
