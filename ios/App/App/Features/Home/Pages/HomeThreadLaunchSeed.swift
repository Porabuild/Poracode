struct HomeProviderSwitchSource {
  let target: ThreadLifecycleTarget
  let agentKind: String
}

struct HomeThreadLaunchSeed {
  let fixedProjectID: String
  let initialWorktree: HomeComposerBranchSelection?
  let worktreePath: String?
  let worktreeBranch: String?
  let initialAgentKind: String?
  let initialModelID: String?
  let initialPrompt: String
  let defaultPrompt: String?
  let promptPlaceholder: String?
  let promptPrefix: String?
  let presentationMode: ThreadPresentationMode
  let groupID: String?
  let groupName: String?
  let title: String?
  let excludedAgentKind: String?
  let initialConfiguration: ThreadLaunchConfiguration?
  let initialAgentInstanceID: String?
  let parentThreadID: String?
  let locksPresentationMode: Bool
  let autoStart: Bool
  let failureMessage: (@MainActor (ThreadLifecycleFailure) -> String)?
  let providerSwitchSource: HomeProviderSwitchSource?

  init(
    fixedProjectID: String,
    initialWorktree: HomeComposerBranchSelection? = nil,
    worktreePath: String? = nil,
    worktreeBranch: String? = nil,
    initialAgentKind: String? = nil,
    initialModelID: String? = nil,
    initialPrompt: String = "",
    defaultPrompt: String? = nil,
    promptPlaceholder: String? = nil,
    promptPrefix: String? = nil,
    presentationMode: ThreadPresentationMode = .gui,
    groupID: String? = nil,
    groupName: String? = nil,
    title: String? = nil,
    excludedAgentKind: String? = nil,
    initialConfiguration: ThreadLaunchConfiguration? = nil,
    initialAgentInstanceID: String? = nil,
    parentThreadID: String? = nil,
    locksPresentationMode: Bool = false,
    autoStart: Bool = false,
    failureMessage: (@MainActor (ThreadLifecycleFailure) -> String)? = nil,
    providerSwitchSource: HomeProviderSwitchSource? = nil
  ) {
    self.fixedProjectID = fixedProjectID
    self.initialWorktree = initialWorktree
    self.worktreePath = worktreePath
    self.worktreeBranch = worktreeBranch
    self.initialAgentKind = initialAgentKind
    self.initialModelID = initialModelID
    self.initialPrompt = initialPrompt
    self.defaultPrompt = defaultPrompt
    self.promptPlaceholder = promptPlaceholder
    self.promptPrefix = promptPrefix
    self.presentationMode = presentationMode
    self.groupID = groupID
    self.groupName = groupName
    self.title = title
    self.excludedAgentKind = excludedAgentKind
    self.initialConfiguration = initialConfiguration
    self.initialAgentInstanceID = initialAgentInstanceID
    self.parentThreadID = parentThreadID
    self.locksPresentationMode = locksPresentationMode
    self.autoStart = autoStart
    self.failureMessage = failureMessage
    self.providerSwitchSource = providerSwitchSource
  }
}
