import Foundation

enum ThreadPresentationMode: String, Codable, Hashable, Sendable {
  case terminal
  case gui
}

struct ThreadTerminalSize: Codable, Hashable, Sendable {
  var cols: Int
  var rows: Int

  static let standard = ThreadTerminalSize(cols: 80, rows: 24)
}

struct ThreadLaunchConfiguration: Codable, Hashable, Sendable {
  var model: String
  var effort: String?
  var contextSize: String?
  var fast: Bool?
  var thinking: Bool?
  var mode: String?
  var approvalPolicy: String?
  var approvalsReviewer: String?
  var sandboxMode: String?
  var browserMcp: Bool?
  var crossagentMcp: Bool?
  var computerUse: Bool?
  var chromeMcp: Bool?

  init(
    model: String,
    effort: String? = nil,
    contextSize: String? = nil,
    fast: Bool? = nil,
    thinking: Bool? = nil,
    mode: String? = nil,
    approvalPolicy: String? = nil,
    approvalsReviewer: String? = nil,
    sandboxMode: String? = nil,
    browserMcp: Bool? = nil,
    crossagentMcp: Bool? = nil,
    computerUse: Bool? = nil,
    chromeMcp: Bool? = nil
  ) {
    self.model = model
    self.effort = effort
    self.contextSize = contextSize
    self.fast = fast
    self.thinking = thinking
    self.mode = mode
    self.approvalPolicy = approvalPolicy
    self.approvalsReviewer = approvalsReviewer
    self.sandboxMode = sandboxMode
    self.browserMcp = browserMcp
    self.crossagentMcp = crossagentMcp
    self.computerUse = computerUse
    self.chromeMcp = chromeMcp
  }
}

enum ThreadProjectLocation: Codable, Hashable, Sendable {
  case windows(path: String, remoteServerID: String? = nil)
  case wsl(distro: String, linuxPath: String, uncPath: String, remoteServerID: String? = nil)
  case posix(path: String, remoteServerID: String? = nil)

  private enum CodingKeys: String, CodingKey {
    case kind
    case path
    case distro
    case linuxPath
    case uncPath
    case remoteServerID = "remoteServerId"
  }

  private enum Kind: String, Codable {
    case windows
    case wsl
    case posix
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    let remoteServerID = try values.decodeIfPresent(String.self, forKey: .remoteServerID)
    switch try values.decode(Kind.self, forKey: .kind) {
    case .windows:
      self = .windows(
        path: try values.decode(String.self, forKey: .path), remoteServerID: remoteServerID)
    case .wsl:
      self = .wsl(
        distro: try values.decode(String.self, forKey: .distro),
        linuxPath: try values.decode(String.self, forKey: .linuxPath),
        uncPath: try values.decode(String.self, forKey: .uncPath),
        remoteServerID: remoteServerID
      )
    case .posix:
      self = .posix(
        path: try values.decode(String.self, forKey: .path), remoteServerID: remoteServerID)
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .windows(let path, let remoteServerID):
      try values.encode(Kind.windows, forKey: .kind)
      try values.encode(path, forKey: .path)
      try values.encodeIfPresent(remoteServerID, forKey: .remoteServerID)
    case .wsl(let distro, let linuxPath, let uncPath, let remoteServerID):
      try values.encode(Kind.wsl, forKey: .kind)
      try values.encode(distro, forKey: .distro)
      try values.encode(linuxPath, forKey: .linuxPath)
      try values.encode(uncPath, forKey: .uncPath)
      try values.encodeIfPresent(remoteServerID, forKey: .remoteServerID)
    case .posix(let path, let remoteServerID):
      try values.encode(Kind.posix, forKey: .kind)
      try values.encode(path, forKey: .path)
      try values.encodeIfPresent(remoteServerID, forKey: .remoteServerID)
    }
  }
}

enum ThreadMCPTransport: Codable, Hashable, Sendable {
  case stdio(
    command: String, args: [String]? = nil, env: [String: String]? = nil, cwd: String? = nil)
  case http(url: String, headers: [String: String]? = nil)
  case sse(url: String, headers: [String: String]? = nil)

  private enum CodingKeys: String, CodingKey {
    case type
    case command
    case args
    case env
    case cwd
    case url
    case headers
  }

  private enum Kind: String, Codable {
    case stdio
    case http
    case sse
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(Kind.self, forKey: .type) {
    case .stdio:
      self = .stdio(
        command: try values.decode(String.self, forKey: .command),
        args: try values.decodeIfPresent([String].self, forKey: .args),
        env: try values.decodeIfPresent([String: String].self, forKey: .env),
        cwd: try values.decodeIfPresent(String.self, forKey: .cwd)
      )
    case .http:
      self = .http(
        url: try values.decode(String.self, forKey: .url),
        headers: try values.decodeIfPresent([String: String].self, forKey: .headers)
      )
    case .sse:
      self = .sse(
        url: try values.decode(String.self, forKey: .url),
        headers: try values.decodeIfPresent([String: String].self, forKey: .headers)
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .stdio(let command, let args, let env, let cwd):
      try values.encode(Kind.stdio, forKey: .type)
      try values.encode(command, forKey: .command)
      try values.encodeIfPresent(args, forKey: .args)
      try values.encodeIfPresent(env, forKey: .env)
      try values.encodeIfPresent(cwd, forKey: .cwd)
    case .http(let url, let headers):
      try values.encode(Kind.http, forKey: .type)
      try values.encode(url, forKey: .url)
      try values.encodeIfPresent(headers, forKey: .headers)
    case .sse(let url, let headers):
      try values.encode(Kind.sse, forKey: .type)
      try values.encode(url, forKey: .url)
      try values.encodeIfPresent(headers, forKey: .headers)
    }
  }
}

struct ThreadMCPServer: Codable, Hashable, Sendable {
  var id: String
  var name: String
  var description: String?
  var enabled: Bool?
  var timeoutMs: Int?
  var disabledTools: [String]?
  var transport: ThreadMCPTransport
}

enum ThreadBuiltInMCPServerID: String, Codable, Hashable, Sendable {
  case browser
  case crossagents
  case chrome
  case computerUse = "computer-use"
  case appControls = "app-controls"
}

struct ThreadSessionReference: Codable, Hashable, Sendable {
  var providerSessionID: String
  var discoveredAt: String

  private enum CodingKeys: String, CodingKey {
    case providerSessionID = "providerSessionId"
    case discoveredAt
  }
}

enum ThreadPromptSegment: Encodable, Hashable, Sendable {
  case text(content: String)
  case file(path: String)
  case attachment(path: String, mimeType: String? = nil)
  case diffComment(path: String, lineNumber: Int, side: Side, staged: Bool, body: String)
  case skill(
    name: String,
    path: String?,
    invocation: String,
    provider: String,
    scope: Scope,
    pluginID: String? = nil,
    pluginName: String? = nil
  )
  case mcp(id: String, name: String)

  enum Side: String, Encodable, Hashable, Sendable {
    case old
    case new
  }

  enum Scope: String, Encodable, Hashable, Sendable {
    case global
    case project
  }

  private enum CodingKeys: String, CodingKey {
    case kind
    case content
    case path
    case mimeType
    case lineNumber
    case side
    case staged
    case body
    case name
    case invocation
    case provider
    case scope
    case pluginID = "pluginId"
    case pluginName
    case id
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .text(let content):
      try values.encode("text", forKey: .kind)
      try values.encode(content, forKey: .content)
    case .file(let path):
      try values.encode("file", forKey: .kind)
      try values.encode(path, forKey: .path)
    case .attachment(let path, let mimeType):
      try values.encode("attachment", forKey: .kind)
      try values.encode(path, forKey: .path)
      try values.encodeIfPresent(mimeType, forKey: .mimeType)
    case .diffComment(let path, let lineNumber, let side, let staged, let body):
      try values.encode("diff_comment", forKey: .kind)
      try values.encode(path, forKey: .path)
      try values.encode(lineNumber, forKey: .lineNumber)
      try values.encode(side, forKey: .side)
      try values.encode(staged, forKey: .staged)
      try values.encode(body, forKey: .body)
    case .skill(
      let name, let path, let invocation, let provider, let scope, let pluginID, let pluginName):
      try values.encode("skill", forKey: .kind)
      try values.encode(name, forKey: .name)
      try values.encodeIfPresent(path, forKey: .path)
      try values.encode(invocation, forKey: .invocation)
      try values.encode(provider, forKey: .provider)
      try values.encode(scope, forKey: .scope)
      try values.encodeIfPresent(pluginID, forKey: .pluginID)
      try values.encodeIfPresent(pluginName, forKey: .pluginName)
    case .mcp(let id, let name):
      try values.encode("mcp", forKey: .kind)
      try values.encode(id, forKey: .id)
      try values.encode(name, forKey: .name)
    }
  }
}

struct ThreadStartExistingRequest: Encodable, Hashable, Sendable {
  var threadID: String
  var projectLocation: ThreadProjectLocation
  var agentKind: String
  var config: ThreadLaunchConfiguration
  var initialSize: ThreadTerminalSize = .standard
  var agentInstanceID: String?
  var prompt: String?
  var segments: [ThreadPromptSegment]?
  var userMessageItemID: String?
  var presentationMode: ThreadPresentationMode?
  var sessionReference: ThreadSessionReference?
  var mcpServers: [ThreadMCPServer]?
  var disabledBuiltInMCPServerIDs: [ThreadBuiltInMCPServerID]?
  var invariantDisabledBuiltInMCPServerIDs: [ThreadBuiltInMCPServerID]?
  var disabledBuiltInMCPTools: [String: [String]]?

  private enum CodingKeys: String, CodingKey {
    case threadID = "threadId"
    case projectLocation
    case agentKind
    case config
    case initialSize
    case agentInstanceID = "agentInstanceId"
    case prompt
    case segments
    case userMessageItemID = "userMessageItemId"
    case presentationMode
    case sessionReference = "sessionRef"
    case mcpServers
    case disabledBuiltInMCPServerIDs = "disabledBuiltInMcpServerIds"
    case invariantDisabledBuiltInMCPServerIDs = "invariantDisabledBuiltInMcpServerIds"
    case disabledBuiltInMCPTools = "disabledBuiltInMcpTools"
  }
}

struct ThreadRelaunchRequest: Encodable, Hashable, Sendable {
  var projectID: String
  var agentKind: String
  var config: ThreadLaunchConfiguration
  var prompt: String
  var agentInstanceID: String?
  var focus: Bool?
  var groupID: String?
  var groupName: String?
  var isNewWorktree: Bool?
  var launchRuntime: Bool?
  var parentThreadID: String?
  var pullRequestNumber: Int?
  var presentationMode: ThreadPresentationMode?
  var segments: [ThreadPromptSegment]?
  var title: String?
  var userMessageItemID: String?
  var worktreeBranch: String?
  var worktreePath: String?

  private enum CodingKeys: String, CodingKey {
    case projectID = "projectId"
    case agentKind
    case config
    case prompt
    case agentInstanceID = "agentInstanceId"
    case focus
    case groupID = "groupId"
    case groupName
    case isNewWorktree
    case launchRuntime
    case parentThreadID = "parentThreadId"
    case pullRequestNumber = "prNumber"
    case presentationMode
    case segments
    case title
    case userMessageItemID = "userMessageItemId"
    case worktreeBranch
    case worktreePath
  }
}

enum ThreadRemoteCommand: Encodable, Hashable, Sendable {
  case prepareWorktree(projectID: String, worktreePath: String)
  case start(ThreadRelaunchRequest)
  case setGroup(groupID: String, groupName: String)
  case clearGroup
  case rename(title: String)
  case acknowledge
  case setDone(Bool)
  case setStarred(Bool)
  case setWorktree(path: String, branch: String? = nil, isNew: Bool? = nil)
  case deleteWorktreeGroup(projectID: String, worktreePath: String, threadIDs: [String])
  case archive
  case unarchive
  case delete

  var permitsCommandID: Bool {
    if case .start = self { return true }
    return false
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .prepareWorktree(let projectID, let worktreePath):
      try values.encode("prepare-worktree", forKey: .kind)
      try values.encode(projectID, forKey: .projectID)
      try values.encode(worktreePath, forKey: .worktreePath)
    case .start(let request):
      try request.encode(to: encoder)
      var startValues = encoder.container(keyedBy: CodingKeys.self)
      try startValues.encode("start", forKey: .kind)
    case .setGroup(let groupID, let groupName):
      try values.encode("set-group", forKey: .kind)
      try values.encode(groupID, forKey: .groupID)
      try values.encode(groupName, forKey: .groupName)
    case .clearGroup:
      try values.encode("clear-group", forKey: .kind)
    case .rename(let title):
      try values.encode("rename", forKey: .kind)
      try values.encode(title, forKey: .title)
    case .acknowledge:
      try values.encode("acknowledge", forKey: .kind)
    case .setDone(let done):
      try values.encode("set-done", forKey: .kind)
      try values.encode(done, forKey: .done)
    case .setStarred(let starred):
      try values.encode("set-starred", forKey: .kind)
      try values.encode(starred, forKey: .starred)
    case .setWorktree(let path, let branch, let isNew):
      try values.encode("set-worktree", forKey: .kind)
      try values.encode(path, forKey: .worktreePath)
      try values.encodeIfPresent(branch, forKey: .worktreeBranch)
      try values.encodeIfPresent(isNew, forKey: .isNewWorktree)
    case .deleteWorktreeGroup(let projectID, let worktreePath, let threadIDs):
      try values.encode("delete-worktree-group", forKey: .kind)
      try values.encode(projectID, forKey: .projectID)
      try values.encode(worktreePath, forKey: .worktreePath)
      try values.encode(threadIDs, forKey: .threadIDs)
    case .archive:
      try values.encode("archive", forKey: .kind)
    case .unarchive:
      try values.encode("unarchive", forKey: .kind)
    case .delete:
      try values.encode("delete", forKey: .kind)
    }
  }

  private enum CodingKeys: String, CodingKey {
    case kind
    case projectID = "projectId"
    case worktreePath
    case groupID = "groupId"
    case groupName
    case title
    case done
    case starred
    case worktreeBranch
    case isNewWorktree
    case threadIDs = "threadIds"
  }
}
