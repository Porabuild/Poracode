import Foundation

/// Complete config conversion at the model boundary, shared by new drafts,
/// resumed threads and native lifecycle requests. Optional carriers stay exact.
extension ThreadConfig {
  init(_ configuration: ThreadLaunchConfiguration) {
    self.init(
      model: configuration.model,
      effort: configuration.effort,
      contextSize: configuration.contextSize,
      fast: configuration.fast,
      thinking: configuration.thinking,
      workflows: configuration.workflows,
      mode: configuration.mode,
      approvalPolicy: configuration.approvalPolicy,
      approvalsReviewer: configuration.approvalsReviewer,
      sandboxMode: configuration.sandboxMode,
      browserMcp: configuration.browserMcp,
      crossagentMcp: configuration.crossagentMcp,
      computerUse: configuration.computerUse,
      chromeMcp: configuration.chromeMcp,
      mcpServerOverrides: configuration.mcpServerOverrides,
      pluginOverrides: configuration.pluginOverrides,
      executionEnvironment: configuration.executionEnvironment,
      crew: configuration.crew,
      selectionBinding: configuration.selectionBinding
    )
  }
}

extension ThreadLaunchConfiguration {
  init(_ configuration: ThreadConfig) {
    self.init(
      model: configuration.model,
      effort: configuration.effort,
      contextSize: configuration.contextSize,
      fast: configuration.fast,
      thinking: configuration.thinking,
      workflows: configuration.workflows,
      mode: configuration.mode,
      approvalPolicy: configuration.approvalPolicy,
      approvalsReviewer: configuration.approvalsReviewer,
      sandboxMode: configuration.sandboxMode,
      browserMcp: configuration.browserMcp,
      crossagentMcp: configuration.crossagentMcp,
      computerUse: configuration.computerUse,
      chromeMcp: configuration.chromeMcp,
      executionEnvironment: configuration.executionEnvironment,
      mcpServerOverrides: configuration.mcpServerOverrides,
      pluginOverrides: configuration.pluginOverrides,
      crew: configuration.crew,
      selectionBinding: configuration.selectionBinding
    )
  }
}
