import Foundation

enum HomeNewsNavigation {
  static func destination(_ action: HomeNewsCardAction, project: HomeProjectFilterOption?) -> HomeSheetDestination? {
    switch action {
    case .profile: return .settingsDestination(.profile)
    case .usage: return .usage
    case .whatsNew: return .settingsDestination(.changelog)
    case .external, .tip: return nil
    case .feature(let id):
      switch id {
      case "crews": return .settingsDestination(.crews)
      case "worktrees": return .settingsDestination(.worktrees)
      case "schedules": return .schedules
      case "pull-requests": return .pullRequests
      case "workspaces": return .workspaces
      case "voice-input": return .settingsDestination(.audio)
      case "session-import": return .settingsDestination(.sessionImport)
      case "browser": return .browserMirror
      case "ai-git": return project.map(HomeSheetDestination.newsProjectGit)
      default: return nil
      }
    }
  }
}
