// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_274e069cdc933ee1 = RemoteSchema(type: "string", literals: [.string("oauth-status")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_275476f9b6055811 = RemoteSchema(type: "object", required: Set(["repos"]), properties: ["repos": RemoteSchemas.schema_75b702ed8c9f54ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2778fa8937ac1709 = RemoteSchema(type: "object", required: Set(["threadId", "type"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_b7ac3adaa07b7aa4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_27790e6c4216ae5b = RemoteSchema(type: "object", required: Set(["action", "id"]), properties: ["action": RemoteSchemas.schema_482c9282715722ac, "id": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2798cb9d2dca7539 = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_3d1908a6bccf4864, "result": RemoteSchemas.schema_6a2d40d38c4527c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_279eee1efa9da6c8 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 65535.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_27aa97567424846c = RemoteSchema(type: "object", required: Set(["kind", "path", "projectId"]), properties: ["kind": RemoteSchemas.schema_88444d52d400622b, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_27d9340da4120b27 = RemoteSchema(type: "object", required: Set(["rationale", "threadId"]), properties: ["rationale": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_280719966e4ed3aa = RemoteSchema(type: "object", required: Set(["maxActiveAgentSessions", "maxActiveGenerationHelpers", "maxActiveTerminalShells", "overloadRetryAfterMs"]), properties: ["maxActiveAgentSessions": RemoteSchemas.schema_56aa0e45cbdce0d0, "maxActiveGenerationHelpers": RemoteSchemas.schema_56aa0e45cbdce0d0, "maxActiveTerminalShells": RemoteSchemas.schema_56aa0e45cbdce0d0, "overloadRetryAfterMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "refuseNewStarts": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_280ab70e288f77f7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_38754692c8b5ebef, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_281d24bbbaa46745 = RemoteSchema(type: "object", required: Set(["model"]), properties: ["approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "approvalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "browserMcp": RemoteSchemas.schema_feeb8bb50144d96d, "chromeMcp": RemoteSchemas.schema_feeb8bb50144d96d, "computerUse": RemoteSchemas.schema_feeb8bb50144d96d, "contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "crew": RemoteSchemas.schema_46a8742e5750f74f, "crossagentMcp": RemoteSchemas.schema_feeb8bb50144d96d, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "executionEnvironment": RemoteSchemas.schema_4cd2587996458d8d, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "importedFrom": RemoteSchemas.schema_3471186f1398f1d2, "mcpServerOverrides": RemoteSchemas.schema_6db96506f253ef73, "mode": RemoteSchemas.schema_01e21946e943d3eb, "model": RemoteSchemas.schema_36fea325bf1aca70, "pluginOverrides": RemoteSchemas.schema_6db96506f253ef73, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "selectionBinding": RemoteSchemas.schema_a11ab76af3bce730, "thinking": RemoteSchemas.schema_feeb8bb50144d96d, "workflows": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2840caeaedca16a2 = RemoteSchema(type: "object", required: Set(["thinking"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_2843e0996b9986e5 = RemoteSchema(type: "object", required: Set(["capabilities"]), properties: ["capabilities": RemoteSchemas.schema_9be4e34050076f08], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_285bccb254d08f83 = RemoteSchema(type: "array", minItems: 1, maxItems: 64, items: RemoteSchemas.schema_b1ddb87a9b03649a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_28676b8ad2f0d233 = RemoteSchema(type: "string", literals: [.string("check"), .string("command"), .string("git"), .string("install"), .string("list"), .string("package"), .string("search"), .string("view")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_288cf32acf26654a = RemoteSchema(type: "object", required: Set(["downloadBytes", "id", "installed", "languages", "name", "supportsLanguageDetection", "verified"]), properties: ["downloadBytes": RemoteSchemas.schema_78830b3d6ec86f55, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "languages": RemoteSchemas.schema_0f732b9fceb2c6ac, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "supportsLanguageDetection": RemoteSchemas.schema_feeb8bb50144d96d, "verified": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_28ab5341451545c8 = RemoteSchema(type: "string", literals: [.string("desktop"), .string("mobile"), .string("tablet"), .string("browser"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_28b9eff1da2232c5 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_97d27c4efa52f52a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_28f26b87e53ebaef = RemoteSchema(type: "string", literals: [.string("learn"), .string("recall"), .string("incognito")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_290453f28a433311 = RemoteSchema(type: "object", required: Set(["kind", "tabId", "url"]), properties: ["kind": RemoteSchemas.schema_9063020a6c5ad8b3, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_291e0a286efaf880 = RemoteSchema(type: "object", required: Set(["channel", "previewId", "version"]), properties: ["channel": RemoteSchemas.schema_3c702b70b3eb4220, "previewId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_292a46aa733cc748 = RemoteSchema(type: "object", properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "autoArchiveDoneAfterDays": RemoteSchemas.schema_56aa0e45cbdce0d0, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "crews": RemoteSchemas.schema_91181085efd88304, "crossagentHiddenModels": RemoteSchemas.schema_86d5d72e84423420, "crossagentPausedProviders": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_79608b5eceb792fe, "enabledMcpServers": RemoteSchemas.schema_cda18ebe4af54c5c, "experimentJudgeSelection": RemoteSchemas.schema_32c3720f649f40a1, "followUpBehavior": RemoteSchemas.schema_49162371ff415b49, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "installedPlugins": RemoteSchemas.schema_9ec28a7798f0d5fb, "memory": RemoteSchemas.schema_5b89bc4512a529b5, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prCreateMode": RemoteSchemas.schema_bed2580f4ead331e, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "usage": RemoteSchemas.schema_b6aaa17d322b8355, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslCrews": RemoteSchemas.schema_1af2c4430c582e39, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_294ca0c3f20bda2e = RemoteSchema(type: "object", required: Set(["description", "httpsUrl", "isFork", "isPrivate", "name", "nameWithOwner", "owner", "pushedAt", "sshUrl"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "httpsUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "isFork": RemoteSchemas.schema_feeb8bb50144d96d, "isPrivate": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "nameWithOwner": RemoteSchemas.schema_bf0b727f7b1c6d07, "owner": RemoteSchemas.schema_bf0b727f7b1c6d07, "pushedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "sshUrl": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2963caa14efb9573 = RemoteSchema(type: "string", literals: [.string("check"), .string("format-files"), .string("git"), .string("install-packages"), .string("list"), .string("list-packages"), .string("package-config"), .string("package-manager"), .string("run"), .string("search")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_297655ba91f41fa6 = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_49834fb5a406b494], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_29860e4152b5fa24 = RemoteSchema(type: "object", required: Set(["appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"]), properties: ["appVersion": RemoteSchemas.schema_36fea325bf1aca70, "auth": RemoteSchemas.schema_2a8bc62fab6ac143, "capabilities": RemoteSchemas.schema_54d35c19b9d9534c, "desktopId": RemoteSchemas.schema_36fea325bf1aca70, "endpoints": RemoteSchemas.schema_17c2b8a25332cd3a, "hostMode": RemoteSchemas.schema_d1d1696e7dc33885, "label": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_7583b8d37fafbf18, "protocolVersion": RemoteSchemas.schema_8d7cbafc0ecc27cb, "toolPresentation": RemoteSchemas.schema_b5b89821dbf7fe4a], additionalAllowed: true, unknownPolicy: .strip)
}
