import Foundation

/// The PWA restores an explicit project draft's supported permission choices.
/// A previous conversation is only a model fallback, not a saved permission
/// preference. Empty catalogs retain only defaults/bypass values the host names.
enum HomeQuickComposePermissionDefaults {
  static func resolve(
    _ configuration: ThreadLaunchConfiguration,
    saved: Bool,
    capabilities: [String: JSONValue]
  ) -> ThreadLaunchConfiguration {
    var result = configuration
    let preferredPolicy = saved ? configuration.approvalPolicy : nil
    let preferredSandbox = saved ? configuration.sandboxMode : nil
    let policies = ids(capabilities["approvalPolicies"])
    let sandboxes = ids(capabilities["sandboxModes"])
    let bypass = capabilities["bypassPermissions"]?.objectValue
    let defaultPolicy = capabilities["defaultApprovalPolicy"]?.stringValue
    let defaultSandbox = capabilities["defaultSandboxMode"]?.stringValue
    if policies.isEmpty {
      result.approvalPolicy = declared(preferredPolicy, default: defaultPolicy,
        bypass: bypass?["approvalPolicy"]?.stringValue)
    } else if let preferredPolicy, policies.contains(preferredPolicy) {
      result.approvalPolicy = preferredPolicy
    } else {
      result.approvalPolicy = defaultPolicy.flatMap { policies.contains($0) ? $0 : nil } ?? policies.first
    }
    if sandboxes.isEmpty {
      result.sandboxMode = declared(preferredSandbox, default: defaultSandbox,
        bypass: bypass?["sandboxMode"]?.stringValue)
    } else if let preferredSandbox {
      result.sandboxMode = sandboxes.contains(preferredSandbox) ? preferredSandbox : nil
    } else {
      result.sandboxMode = defaultSandbox.flatMap { sandboxes.contains($0) ? $0 : nil } ?? sandboxes.first
    }
    result.approvalsReviewer = (saved ? configuration.approvalsReviewer : nil)
      ?? capabilities["defaultApprovalsReviewer"]?.stringValue
    return result
  }

  private static func ids(_ value: JSONValue?) -> [String] {
    value?.arrayValue?.compactMap { $0.objectValue?["id"]?.stringValue } ?? []
  }

  private static func declared(_ value: String?, default defaultValue: String?, bypass: String?) -> String? {
    guard let value, value == defaultValue || value == bypass else { return nil }
    return value
  }
}
