import Foundation
import Observation

@MainActor
@Observable
final class SettingsIntegrationsComposition {
  private(set) var selection: SettingsIntegrationsSelection?

  let skills: SettingsIntegrationsSkillsController
  let mcp: SettingsIntegrationsMCPController
  let oauth: SettingsIntegrationsOAuthController

  init(
    gateway: any SettingsIntegrationsGateway,
    browser: any SettingsIntegrationsBrowserOpening = SettingsIntegrationsSystemBrowser(),
    oauthWaitLimit: Duration = .seconds(120),
    sleep: @escaping SettingsIntegrationsOAuthController.Sleep = {
      try await Task.sleep(for: $0)
    }
  ) {
    skills = .init(gateway: gateway)
    mcp = .init(gateway: gateway)
    oauth = .init(
      gateway: gateway,
      browser: browser,
      waitLimit: oauthWaitLimit,
      sleep: sleep
    )
  }

  func activate(_ selection: SettingsIntegrationsSelection?) {
    guard self.selection != selection else { return }
    self.selection = selection
    let access = selection?.access
    skills.activate(access)
    mcp.activate(access)
    oauth.activate(access)
  }

  func failure(for scope: SettingsIntegrationsScope) -> SettingsIntegrationsFailure? {
    guard let selection else { return .unavailable }
    return selection.access.gate(scope)
  }

  func suspendForBackground() {
    skills.cancelTransientWork()
    mcp.cancelTransientWork()
    oauth.suspendForBackground()
  }

  func resumeAfterForeground() async {
    guard selection != nil else { return }
    async let skillsRefresh: Void = skills.loadSkills()
    async let oauthRefresh: Void = oauth.resumeAfterForeground()
    _ = await (skillsRefresh, oauthRefresh)
  }

  func deactivateTransientWork() {
    selection = nil
    skills.activate(nil)
    mcp.activate(nil)
    oauth.activate(nil)
  }
}
