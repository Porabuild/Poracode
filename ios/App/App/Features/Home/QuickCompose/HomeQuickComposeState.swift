import Foundation
import Observation
import PhotosUI
import SwiftUI

/// Window-owned UI state. Layout changes may replace an editor without replacing
/// its draft, upload owner, command identity or control selections.
@MainActor @Observable
final class HomeQuickComposeState {
  let connectionID: ClientConnectionID?
  let preferences: ComposerPreferencesStore
  private let projectDefaultsAreAuthoritative: () -> Bool
  private(set) var restoredSelection: ComposerProjectPreference?
  private(set) var selectedAgentInstanceID: String?
  let launchSeed: HomeThreadLaunchSeed?
  let lifecycle: ThreadLifecycleController
  let mediaSuite: RichChatControllerSuite
  let fileMentionController: RichChatFileMentionController
  var projectID: String {
    didSet { if oldValue != projectID { resetProjectSelection() } }
  }
  var threadID = UUID().uuidString.lowercased()
  var prompt = ""
  var promptSelection: NSRange?
  private(set) var selectedAgentKind: String?
  var selectedModel: String? { configuredConfiguration?.model ?? launchSeed?.initialModelID ?? restoredSelection?.configuration.model }
  /// The complete user-edited selection. Keeping its optional carriers together
  /// avoids reconstructing explicit false, empty or absent choices from defaults.
  var configuredConfiguration: ThreadLaunchConfiguration?
  var presentationMode = ThreadPresentationMode.gui
  var worktreeSelection = HomeComposerWorktree.branch
  var worktreeBranchName =
    "poracode/mobile-\(String(UUID().uuidString.lowercased().prefix(6)))"
  var branchSelection: HomeComposerBranchSelection?
  var branchProjectID: String?
  var branchOptions: [ProjectGitBranchInfo] = []
  var worktreeOptions: [ProjectGitWorktreeInfo] = []
  var loadingBranches = false
  var switchingBranch: String?
  var branchSearch = ""
  var creatingBranch = false
  var newBranchName = ""
  var modelSearch = ""
  var photoItem: PhotosPickerItem?
  var screenshotItem: PhotosPickerItem?
  var showingCamera = false
  var attachments: [RichChatUploadedAttachment] = []
  var skills: [RichChatSelectedSkill] = []
  var fileMentions: [String] = []
  var mentionedMCPs: [RichChatSelectedMCP] = []
  var additionalSegments: [RichPromptSegment] = []
  var didAutoStart = false
  var selectorPath: [HomeComposerDestination] = []
  var selector: HomeComposerSelector? {
    didSet {
      // Keep the current stack intact while UIKit dismisses its sheet. Reset
      // before a new selector opens, avoiding a simultaneous pop and dismissal.
      if selector != nil, oldValue != selector { selectorPath = [] }
    }
  }
  /// User-saved per-agent visibility lists (see `loadVisibilityOverrides`).
  var hiddenModels: [String: [String]] = [:]
  let visibilityDocument: SettingsDocumentController
  let tools: ComposerToolsController
  let crews: SavedCrewsController
  var crewRoster: CrewRosterDraft?
  var showingImporter = false
  var importing = false
  var preparingWorktree = false
  var failureMessage: String?
  var promptFocused = false

  @ObservationIgnored private var activePresentation: UUID?

  init(session: AppSession, initialProjectID: String? = nil,
    initialWorktree: HomeComposerBranchSelection? = nil, launchSeed: HomeThreadLaunchSeed? = nil
  ) {
    connectionID = session.selectedConnectionId
    preferences = session.composerPreferences
    projectDefaultsAreAuthoritative = { [weak session] in session?.state.catalogMutationsSupported == true }
    self.launchSeed = launchSeed
    lifecycle = session.makeThreadLifecycleController()
    mediaSuite = session.makeRichChatControllerSuite()
    fileMentionController = RichChatFileMentionController(session: session)
    tools = ComposerToolsController(session: session)
    visibilityDocument = tools.document
    crews = SavedCrewsController(gateway: session.makeSettingsSessionGateway())
    let latestProjectID = (session.state.snapshot?.threads ?? [])
      .filter { !$0.isArchived && ThreadPresentationFilter.isVisibleInNativeList($0) }
      .max(by: { $0.updatedAt < $1.updatedAt })?.projectId
    let initialProject = launchSeed?.fixedProjectID ?? initialProjectID ?? latestProjectID
      ?? session.projects.first?.id ?? ""
    projectID = initialProject
    let statuses = ComposerProviderCatalog.inEnvironment(session.state.replay.agentStatuses.ordered,
      location: session.projects.first { $0.id == initialProject }?.location)
    let seededWorktree = launchSeed?.initialWorktree ?? initialWorktree
    worktreeSelection = seededWorktree == nil ? .branch : .worktree
    branchSelection = seededWorktree
    selectedAgentKind = launchSeed?.initialAgentKind
    prompt = launchSeed?.initialPrompt ?? ""
    let initialPresentationMode =
      launchSeed?.presentationMode
      ?? HomeComposerCatalog.preferredPresentationMode(
        from: statuses
      )
    presentationMode = initialPresentationMode
    configuredConfiguration = launchSeed?.initialConfiguration
    restoreClientSelection()
    if launchSeed == nil, restoredSelection == nil {
      let kind = session.projects.first(where: { $0.id == projectID })?.lastDraftConfig?.objectValue?["agentKind"]?.stringValue
      let agent = statuses.first(where: { $0.kind == kind })
        ?? HomeComposerCatalog.availableAgents(from: statuses, presentationMode: .gui).first
        ?? HomeComposerCatalog.availableAgents(from: statuses, presentationMode: .terminal).first
      if let agent, let mode = preferences.preferredPresentation(for: .init(agentKind: agent.kind, presentationMode: .gui)),
        HomeComposerCatalog.supportsPresentation(agent, mode: mode) { presentationMode = mode }
    }
  }

  private func resetProjectSelection() {
    selectorPath = []
    selectedAgentKind = nil
    configuredConfiguration = nil
    restoredSelection = nil
    selectedAgentInstanceID = nil
    worktreeSelection = .branch
    branchSelection = nil
    branchProjectID = nil
    branchOptions = []
    worktreeOptions = []
    branchSearch = ""
    creatingBranch = false
    newBranchName = ""
    attachments = []
    skills = []
    fileMentions = []
    mentionedMCPs = []
    additionalSegments = []
    restoreClientSelection()
  }

  func clearSubmittedContent() {
    prompt = ""
    attachments = []
    skills = []
    fileMentions = []
    mentionedMCPs = []
    additionalSegments = []
  }

  func selectAgent(_ kind: String?, preservingContext: Bool = false) {
    guard selectedAgentKind != kind else { return }
    selectedAgentKind = kind
    selectedAgentInstanceID = nil
    if !preservingContext {
      skills = []
      configuredConfiguration = nil
    }
  }

  func restoreClientSelection() {
    guard launchSeed == nil, let connectionID,
      let saved = preferences.projectSelection(connectionID: connectionID, projectID: projectID) else { return }
    // Current project wire records cannot name an independent provider
    // instance. Such explicit selections remain exact and device-owned.
    guard !projectDefaultsAreAuthoritative() || saved.owner.agentInstanceID != nil else { return }
    restoredSelection = saved
    selectedAgentKind = saved.owner.agentKind
    selectedAgentInstanceID = saved.owner.agentInstanceID
    if projectID != RemoteProject.homeScopeID, saved.worktreeMode { worktreeSelection = .worktree }
    presentationMode = preferences.preferredPresentation(for: saved.owner) ?? saved.owner.presentationMode
  }

  func reconcileProjectPreferenceAuthority(worktreeMode: Bool) {
    guard launchSeed == nil, projectDefaultsAreAuthoritative(), configuredConfiguration == nil else { return }
    guard restoredSelection?.owner.agentInstanceID == nil else { return }
    if restoredSelection != nil {
      restoredSelection = nil
      selectedAgentKind = nil
      selectedAgentInstanceID = nil
    }
    if branchSelection == nil { worktreeSelection = worktreeMode ? .worktree : .branch }
  }

  func beginPresentation(_ id: UUID) {
    activePresentation = id
  }

  func isPresented(_ id: UUID) -> Bool { activePresentation == id }

  func endPresentation(_ id: UUID) {
    guard activePresentation == id else { return }
    activePresentation = nil
    // The window draft owns uploads and launches, including while collapsed.
    // A replacement view may arrive in a later update; visibility cannot cancel
    // an operation the server may already have accepted.
  }

  func synchronizeMedia(access: RichChatSessionAccess?, presentation: UUID) {
    guard isPresented(presentation) else { return }
    guard let access, access.lease.connectionID == connectionID else {
      mediaSuite.deselect()
      return
    }
    mediaSuite.select(access: access, threadID: threadID)
  }
}

/// One in-memory draft per window workspace and connection, with no disk or
/// protocol boundary. The store is deliberately not observable: leaf editors
/// observe their own draft rather than invalidating Home on each keystroke.
@MainActor
final class HomeQuickComposeStore {
  struct Context: Hashable {
    let connectionID: ClientConnectionID?
    let workspaceID: String?
  }
  private var drafts: [Context: HomeQuickComposeState] = [:]

  func existing(_ context: Context) -> HomeQuickComposeState? { drafts[context] }

  func state(for context: Context, session: AppSession, initialProjectID: String? = nil) -> HomeQuickComposeState {
    if let draft = drafts[context] { return draft }
    let draft = HomeQuickComposeState(session: session, initialProjectID: initialProjectID)
    drafts[context] = draft
    return draft
  }

  func discard(_ context: Context, matching draft: HomeQuickComposeState) {
    if drafts[context] === draft { drafts[context] = nil }
  }
}
