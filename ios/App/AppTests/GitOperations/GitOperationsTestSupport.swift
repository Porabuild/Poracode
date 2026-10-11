import Foundation

@testable import App

enum GitOperationsSamples {
  static let posix = ProjectLocation.posix(path: "/repo", remoteServerId: "posix-host")
  static let windows = ProjectLocation.windows(
    path: #"C:\src\repo"#,
    remoteServerId: "windows-host"
  )
  static let wsl = ProjectLocation.wsl(
    distro: "Ubuntu-24.04",
    linuxPath: "/home/dev/repo",
    uncPath: #"\\wsl.localhost\Ubuntu-24.04\home\dev\repo"#,
    remoteServerId: "wsl-host"
  )

  static let requests: [GitOperationRequest] = [
    .gitAbortMerge(.init(worktreeLocation: wsl)),
    .gitAddRemote(.init(projectLocation: posix, remote: "origin", url: "git@example/repo")),
    .gitAddWorktree(.init(projectLocation: posix, branch: "feature", path: "/work/feature")),
    .gitCommit(.init(projectLocation: posix, message: "Subject")),
    .gitDeleteBranch(.init(projectLocation: posix, branch: "old")),
    .gitFetch(.init(projectLocation: windows, prune: true, remote: "origin")),
    .gitFinishMerge(.init(worktreeLocation: wsl)),
    .gitGetWorktreeOwner(.init(projectLocation: posix, branch: "feature")),
    .gitGetWorktreeSourceBranch(
      .init(projectLocation: posix, branch: "feature", sourceBranchOverride: "main")
    ),
    .gitInit(.init(projectLocation: windows)),
    .gitListBranches(.init(projectLocation: posix, includeRemote: true)),
    .gitListWorktrees(.init(projectLocation: wsl)),
    .gitMergeToSource(
      .init(
        projectLocation: posix,
        worktreeLocation: .posix(path: "/work/feature"),
        worktreeBranch: "feature",
        sourceBranch: "main"
      )
    ),
    .gitPruneWorktrees(.init(projectLocation: posix, activeWorktreePaths: ["/work/feature"])),
    .gitPull(.init(projectLocation: posix, preserveLocalChanges: true, remote: "origin")),
    .gitPullFromSource(
      .init(worktreeLocation: wsl, sourceBranch: "main", preserveLocalChanges: true)
    ),
    .gitPullRebase(.init(projectLocation: posix, remote: "origin")),
    .gitPush(.init(projectLocation: posix, branch: "main", remote: "origin")),
    .gitRemoveWorktree(
      .init(projectLocation: posix, path: "/work/feature", expectedBranch: "feature")
    ),
    .gitRevert(.init(projectLocation: posix, filePath: "README.md")),
    .gitRevertAll(.init(projectLocation: posix)),
    .gitStage(.init(projectLocation: posix, filePath: "README.md")),
    .gitStageAll(.init(projectLocation: posix)),
    .gitSwitchBranch(.init(projectLocation: posix, branch: "main")),
    .gitSync(.init(projectLocation: posix, remote: "origin")),
    .gitSyncRebase(.init(projectLocation: posix, remote: "origin")),
    .gitUnstage(.init(projectLocation: posix, filePath: "README.md")),
    .gitUnstageAll(.init(projectLocation: posix)),
    .gitWorktreeStatusBatch(
      .init(projectLocation: wsl, worktreePaths: ["/home/dev/repo"], detail: .full)
    ),
  ]

  static func response(for procedure: GitOperationProcedure) -> Data {
    let result: Any
    switch procedure {
    case .gitAbortMerge:
      result = ["stashPreserved": true]
    case .gitAddWorktree:
      result = ["path": "/work/feature", "changesTransferred": false]
    case .gitCommit:
      result = ["hash": String(repeating: "a", count: 40), "message": "Subject"]
    case .gitFinishMerge:
      result = ["success": true]
    case .gitGetWorktreeOwner:
      result = ["ownerToken": NSNull()]
    case .gitGetWorktreeSourceBranch:
      result = ["sourceBranch": "main", "commitsAhead": 1, "sourceAhead": 0]
    case .gitListBranches:
      result = [
        "current": "main",
        "branches": [
          [
            "name": "main", "current": true, "commit": "abc", "isRemote": false,
          ]
        ],
      ]
    case .gitListWorktrees:
      result = [
        "worktrees": [
          [
            "path": "/repo", "branch": "main", "commit": "abc", "isMain": true,
          ]
        ]
      ]
    case .gitMergeToSource:
      result = [
        "merged": true, "fastForward": true,
        "newSourceCommit": String(repeating: "b", count: 40),
      ]
    case .gitPullFromSource:
      result = ["merged": true, "fastForward": false]
    case .gitSwitchBranch:
      result = [
        "branch": "main", "created": false, "tracking": "origin/main",
        "ahead": 0, "behind": 0,
      ]
    case .gitSync, .gitSyncRebase:
      result = ["pulled": true, "pushed": true]
    case .gitWorktreeStatusBatch:
      result = ["statuses": ["/repo": status()]]
    default:
      return Data("{}".utf8)
    }
    let data = try! JSONSerialization.data(withJSONObject: ["result": result])
    return data
  }

  private static func status() -> [String: Any] {
    [
      "detail": "full", "isRepo": true, "branch": "main", "tracking": "origin/main",
      "hasRemote": true, "remoteInfo": NSNull(), "ahead": 0, "behind": 0,
      "staged": [], "unstaged": [], "totalInsertions": 0, "totalDeletions": 0,
    ]
  }
}

@MainActor
func makeGitOperationsContext(
  location: ProjectLocation = GitOperationsSamples.posix,
  connectionID: ClientConnectionID = ClientConnectionID(
    UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
  ),
  generation: UInt64 = 1,
  projectGeneration: UInt64 = 1,
  capabilities: Set<ProjectControllerCapability> = [.sessionRead, .sessionOperate]
) -> ProjectWorkspaceContext {
  let hostLease = ProjectControllerHostLease(connectionId: connectionID, generation: generation)
  return ProjectWorkspaceContext(
    session: .init(
      lease: hostLease,
      isOnline: true,
      isReady: true,
      capabilities: capabilities
    ),
    lease: .init(
      hostLease: hostLease,
      project: .init(connectionId: connectionID, projectId: "project-1"),
      location: location,
      projectGeneration: projectGeneration
    )
  )
}
