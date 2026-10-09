import Foundation

/**
 * Composition point for provider session-action panels — the native
 * counterpart of the desktop renderer's provider session-controls registry.
 *
 * The shared UI only consumes the neutral `RichChatSessionActionContributor`
 * capability; this file is the single place provider leaves are registered.
 * Each leaf answers `presents(agentKind:)` itself (its base kind plus every
 * `kind:<instance>` profile), so adding a provider means adding its leaf to
 * the list — no shared panel, runtime, or transport file changes.
 */
enum RichChatSessionActionCatalog {
  private static let leaves: [any RichChatSessionActionContributor] = [
    DevinSessionActionPanels()
  ]

  /// The leaf presenting session actions for `agentKind`, or nil when none does.
  static func contributor(for agentKind: String) -> (any RichChatSessionActionContributor)? {
    leaves.first { $0.presents(agentKind: agentKind) }
  }
}
