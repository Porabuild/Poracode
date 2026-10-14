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
    excludedAgentKind: String? = nil
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
  }
}
