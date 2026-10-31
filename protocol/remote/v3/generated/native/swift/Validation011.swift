// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_c1504401bd291fd1 = RemoteSchema(type: "string", minLength: 1, maxLength: 4096, pattern: "^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s]+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1862c8cf975e3dc = RemoteSchema(type: "string", maxLength: 3145728, pattern: "^data:image\\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c18ccc2aa36fdad0 = RemoteSchema(type: "object", required: Set(["policy", "roles", "version"]), properties: ["crewId": RemoteSchemas.schema_7d62681c6488867d, "name": RemoteSchemas.schema_eef7e0a1ed6691c0, "policy": RemoteSchemas.schema_5e585becfdaebc00, "roles": RemoteSchemas.schema_5994d84d0d782ee0, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c1a108aae42275ff = RemoteSchema(type: "object", required: Set(["distro", "sourceScope"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "sourceScope": RemoteSchemas.schema_86230e1fa3f38188], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c1d4a9f752e166b1 = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "hasRemote", "isRepo", "remoteInfo", "staged", "totalDeletions", "totalInsertions", "tracking", "unstaged"]), properties: ["ahead": RemoteSchemas.schema_3d06117798bf5171, "behind": RemoteSchemas.schema_3d06117798bf5171, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictFiles": RemoteSchemas.schema_1399799a226dcc71, "detail": RemoteSchemas.schema_15cae388d0cdd5b6, "hasRemote": RemoteSchemas.schema_feeb8bb50144d96d, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "isRepo": RemoteSchemas.schema_feeb8bb50144d96d, "mergeInProgress": RemoteSchemas.schema_feeb8bb50144d96d, "mergeMessage": RemoteSchemas.schema_bf0b727f7b1c6d07, "remoteInfo": RemoteSchemas.schema_9d9cbc9ed0e89822, "staged": RemoteSchemas.schema_1399799a226dcc71, "totalDeletions": RemoteSchemas.schema_3d06117798bf5171, "totalInsertions": RemoteSchemas.schema_3d06117798bf5171, "tracking": RemoteSchemas.schema_bf0b727f7b1c6d07, "unstaged": RemoteSchemas.schema_1399799a226dcc71], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1f357f1f88472e8 = RemoteSchema(type: "string", literals: [.string("starting"), .string("active"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c223d7ef6abf4cfd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_e301e52cd3d3ea46, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c263982707afed92 = RemoteSchema(type: "string", literals: [.string("percent"), .string("tokens"), .string("requests"), .string("credits"), .string("usd")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c26b952dfa583dcd = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "title"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_281d24bbbaa46745, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_1f4518886240126e, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c286f4704a09cde8 = RemoteSchema(type: "array", maxItems: 100, items: RemoteSchemas.schema_2e59da965e611892, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c288e6607451a3b8 = RemoteSchema(type: "object", required: Set(["versions"]), properties: ["livePreview": RemoteSchemas.schema_8b16df449d9a1954, "versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2894654f12fb350 = RemoteSchema(type: "string", literals: [.string("browser-frame")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2956fa26ec0467c = RemoteSchema(type: "object", required: Set(["content", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "reacted"]), properties: ["content": RemoteSchemas.schema_7d62681c6488867d, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "reacted": RemoteSchemas.schema_feeb8bb50144d96d, "subjectId": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2bb40b82b330cd4 = RemoteSchema(type: "object", required: Set(["forge", "host", "login"]), properties: ["forge": RemoteSchemas.schema_eaed3cfbf46d5d81, "host": RemoteSchemas.schema_2365fa95161a3294, "login": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2e8606952666d2c = RemoteSchema(type: "array", items: RemoteSchemas.schema_6bb6e13415c8cbba, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c30da54b853babca = RemoteSchema(type: "object", required: Set(["label", "percent", "provider", "tokens"]), properties: ["estimatedCostUsd": RemoteSchemas.schema_80c415b6e27c6ebd, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "provider": RemoteSchemas.schema_bf0b727f7b1c6d07, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3363423bb669510 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_4ec1299a984102e2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c33d76cdf9c7d5d7 = RemoteSchema(type: "object", required: Set(["agentKind", "model"]), properties: ["agentKind": RemoteSchemas.schema_8e43cad70cd70de7, "contextSize": RemoteSchemas.schema_7d62681c6488867d, "effort": RemoteSchemas.schema_7d62681c6488867d, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c37d7c3aee05c236 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_6ddf4b7dc1e0e9e2, RemoteSchemas.schema_2c6061a21fb7aee6, RemoteSchemas.schema_8c04d0a06a161126, RemoteSchemas.schema_83384e1a092392f6, RemoteSchemas.schema_a36830c34a81f248, RemoteSchemas.schema_0b2ba27512e423eb], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c39ba2db208f4f7c = RemoteSchema(type: "string", literals: [.string("activate-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3a4dfd6503d3858 = RemoteSchema(type: "object", required: Set(["notice", "outcome"]), properties: ["notice": RemoteSchemas.schema_1468dfe9a2db9c9d, "outcome": RemoteSchemas.schema_552de755ef856a71], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3ac2139868061bb = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4197e46f3baa871 = RemoteSchema(type: "string", literals: [.string("terminal")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c43cb4446ad9adb3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1168c5b9dd9a5f10, RemoteSchemas.schema_3b92361dc8708ea3], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c44733d5a3f1db00 = RemoteSchema(type: "array", items: RemoteSchemas.schema_efedb06a4d7088a5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4921dbeb36e2b97 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e510e581c4f8b523, RemoteSchemas.schema_77c71c73158736b6], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4ad1400e2e98f57 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["limit": RemoteSchemas.schema_039b848cf1c1ad6c, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "query": RemoteSchemas.schema_38d1a07d3b9b1c82, "searchConfig": RemoteSchemas.schema_cbf78da83a6846d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4d99dd3e3a1ba03 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["detail": RemoteSchemas.schema_15cae388d0cdd5b6, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c51ef8291e597045 = RemoteSchema(type: "object", properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c52c624815ab6ea5 = RemoteSchema(type: "object", required: Set(["archived", "excerpt", "itemId", "projectId", "projectName", "role", "threadId", "title"]), properties: ["archived": RemoteSchemas.schema_feeb8bb50144d96d, "excerpt": RemoteSchemas.schema_ff3b9b0284fcd244, "itemId": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "projectName": RemoteSchemas.schema_e78f40fc5399f7f1, "role": RemoteSchemas.schema_ff05783d57039aa1, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_f7ecfe1017b42566], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c533fb875972ec60 = RemoteSchema(type: "object", required: Set(["result", "version", "watchId"]), properties: ["result": RemoteSchemas.schema_80f7976aee3c4505, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c55a346c739cb16c = RemoteSchema(type: "object", required: Set(["itemId", "payload", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9189c3f251645aa9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c591e31c389e744f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_160c1ab9b7f11a56, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5a10234205e6cd2 = RemoteSchema(type: "array", items: RemoteSchemas.schema_20d7b1e748f886c3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5a25a432208abbf = RemoteSchema(type: "string", literals: [.string("appearance")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c17f76a21e5ff1 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c2ecebbae5cd01 = RemoteSchema(type: "object", required: Set(["modifiedAtMs"]), properties: ["modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c5a6d768bddd81 = RemoteSchema(type: "integer", minimum: 100.0, maximum: 2000.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5efb303b347362f = RemoteSchema(type: "string", literals: [.string("running"), .string("decided")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c62b342ed89c5809 = RemoteSchema(type: "string", literals: [.string("applied")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c641a5324383dc1b = RemoteSchema(type: "object", properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "crews": RemoteSchemas.schema_91181085efd88304, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_79608b5eceb792fe, "enabledMcpServers": RemoteSchemas.schema_cda18ebe4af54c5c, "experimentJudgeSelection": RemoteSchemas.schema_32c3720f649f40a1, "followUpBehavior": RemoteSchemas.schema_49162371ff415b49, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "usage": RemoteSchemas.schema_b6aaa17d322b8355, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c64b38404fc9a1d4 = RemoteSchema(type: "string", literals: [.string("terminal-watch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c65389518caf6991 = RemoteSchema(type: "object", required: Set(["createdAt", "id", "kind"]), properties: ["actor": RemoteSchemas.schema_a99c73e81a312991, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromRef": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_7d62681c6488867d, "label": RemoteSchemas.schema_2e20b523bd887c4e, "reviewer": RemoteSchemas.schema_423ec18ef5ab4596, "text": RemoteSchemas.schema_bf0b727f7b1c6d07, "toRef": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c664f13e067b9fbd = RemoteSchema(type: "integer", maximum: 2048.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c669b4e26b2b7569 = RemoteSchema(type: "string", literals: [.string("mcp")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c66f09c6212330ba = RemoteSchema(type: "object", required: Set(["createdAt", "reason", "refusedBytes", "refusedEvents", "source", "token"]), properties: ["createdAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "reason": RemoteSchemas.schema_9780f521bc1dee38, "refusedBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "refusedEvents": RemoteSchemas.schema_56aa0e45cbdce0d0, "source": RemoteSchemas.schema_77a7dec7edfc464f, "token": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c6b76607f48c889e = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_21c479c8dedbe09d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c6ca4f58c0a3ffa4 = RemoteSchema(type: "object", required: Set(["repairedWorktrees"]), properties: ["repairedWorktrees": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c70a9f86327c7bf7 = RemoteSchema(type: "object", required: Set(["commit", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["commit": RemoteSchemas.schema_ef369ae84db5485c, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c733570a5a247812 = RemoteSchema(type: "string", literals: [.string("command_execution_approval"), .string("file_read_approval"), .string("file_change_approval"), .string("apply_patch_approval"), .string("tool_call_approval"), .string("tool_user_input"), .string("auth_refresh")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7918abeb45791aa = RemoteSchema(type: "object", required: Set(["pullRequests"]), properties: ["pullRequests": RemoteSchemas.schema_f86171557f2ff456, "viewerLogin": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7bfc39efc965eed = RemoteSchema(type: "string", literals: [.string("unarchive")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7d6a559534154dd = RemoteSchema(type: "object", required: Set(["repository"]), properties: ["repository": RemoteSchemas.schema_2e5ddb0a3afed2cb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7e9848de3a346ed = RemoteSchema(type: "string", minLength: 1, maxLength: 512, unknownPolicy: .strip, semanticIds: ["push.routing.identifier-no-controls"])
}

public extension RemoteSchemas {
  static let schema_c8425979fd5d4887 = RemoteSchema(type: "string", literals: [.string("forbidden"), .string("not-found"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8709e27df818d5b = RemoteSchema(type: "string", maxLength: 80, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8aab5b657a17f5e = RemoteSchema(type: "array", items: RemoteSchemas.schema_0dd86a486b36c18a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8c48a1118d06f0b = RemoteSchema(type: "string", literals: [.string("textSize")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8ef822f0af9edc7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_ad6bb2de51c0e05f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c975fc7daa5c30b3 = RemoteSchema(type: "string", literals: [.string("pull-request")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c9a954a3af7049b0 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("gui")], defaultValue: .string("terminal"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca0c8b8a7fbb7b5d = RemoteSchema(type: "object", required: Set(["type", "version"]), properties: ["type": RemoteSchemas.schema_518b8374aca2de65, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca3d163bab055381 = RemoteSchema(unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca5f8d6782ca9f6b = RemoteSchema(type: "object", required: Set(["data", "fromCursor", "generation", "processState", "terminalSize", "toCursor"]), properties: ["data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_2d0b6ec9f2b2decf, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca8d08ed24dcae50 = RemoteSchema(type: "object", required: Set(["entries", "indexing", "nextCursor", "version"]), properties: ["entries": RemoteSchemas.schema_da9e94c933512927, "indexing": RemoteSchemas.schema_feeb8bb50144d96d, "nextCursor": RemoteSchemas.schema_e333e5cd970cf11f, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca98effeead73f13 = RemoteSchema(type: "object", required: Set(["enabled", "type"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "type": RemoteSchemas.schema_3ac0e8087f32acdf], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_cab926bfae4fdbf9 = RemoteSchema(type: "object", properties: ["completedTurnsLimit": RemoteSchemas.schema_be268483fb86810f, "cursor": RemoteSchemas.schema_36fea325bf1aca70, "limit": RemoteSchemas.schema_be268483fb86810f, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cac7783fa7c0ea01 = RemoteSchema(type: "object", required: Set(["fingerprint", "path"]), properties: ["fingerprint": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cadb9042bbcd8536 = RemoteSchema(type: "object", properties: ["disabled": RemoteSchemas.schema_feeb8bb50144d96d, "ghAccount": RemoteSchemas.schema_eb2798e2ccc8bf65, "icon": RemoteSchemas.schema_df704162f3d15808, "mcpServers": RemoteSchemas.schema_637f685cb2418b8c, "name": RemoteSchemas.schema_36fea325bf1aca70, "scripts": RemoteSchemas.schema_3155b0e8649e47af, "searchSettings": RemoteSchemas.schema_3e412d7b328b3f5a, "worktreeLocation": RemoteSchemas.schema_137e14636e0bc235], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb2e3d3519422e78 = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["deleteBranch": RemoteSchemas.schema_f8b6dd8128e8bfe0, "expectedBranch": RemoteSchemas.schema_36fea325bf1aca70, "expectedOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "force": RemoteSchemas.schema_f8b6dd8128e8bfe0, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["git.remove-worktree.owner-requires-branch"])
}

public extension RemoteSchemas {
  static let schema_cb34d50832b1e60d = RemoteSchema(type: "string", literals: [.string("http"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb81a9dbb81a1a63 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("server")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb95bf43ec62db01 = RemoteSchema(type: "object", required: Set(["author", "body", "createdAt", "id"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "reactions": RemoteSchemas.schema_45e52f032f196485, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbad4936b49ad671 = RemoteSchema(type: "array", items: RemoteSchemas.schema_da546ba4a0601e6e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbc64d14585e9a92 = RemoteSchema(type: "string", literals: [.string("update")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbf78da83a6846d0 = RemoteSchema(type: "object", required: Set(["excludePatterns", "useIgnoreFiles"]), properties: ["excludePatterns": RemoteSchemas.schema_0f732b9fceb2c6ac, "useIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cc1f68c41f086183 = RemoteSchema(type: "string", literals: [.string("github")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cc9733aab3f25827 = RemoteSchema(type: "object", required: Set(["body", "commentId", "expectedBody", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_36fea325bf1aca70, "commentId": RemoteSchemas.schema_97d85a5eaee82b97, "expectedBody": RemoteSchemas.schema_bf0b727f7b1c6d07, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cc9f9333ba81f5d3 = RemoteSchema(type: "object", required: Set(["projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"]), properties: ["gitState": RemoteSchemas.schema_edbeeba28e8d2dd8, "gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "projects": RemoteSchemas.schema_77c06377e1bf6e10, "projectsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "snapshotEpoch": RemoteSchemas.schema_8e43cad70cd70de7, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "threads": RemoteSchemas.schema_a5ae4ed4358535a0, "threadsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "workspaces": RemoteSchemas.schema_15fcce03de60030d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ccc27289c741798a = RemoteSchema(type: "object", required: Set(["label", "target"]), properties: ["credentialRef": RemoteSchemas.schema_e301e52cd3d3ea46, "desired": RemoteSchemas.schema_abff99d05c43ad4c, "label": RemoteSchemas.schema_0c5d3d75e4ff2cec, "legacyConnectionId": RemoteSchemas.schema_d855999aed5e6438, "port": RemoteSchemas.schema_279eee1efa9da6c8, "target": RemoteSchemas.schema_a13200e46be7a2e6], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_ccd3eb53d3a096b7 = RemoteSchema(type: "object", required: Set(["directoryPath", "entries"]), properties: ["directoryPath": RemoteSchemas.schema_bf0b727f7b1c6d07, "entries": RemoteSchemas.schema_bdb4eecbb625c500], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ccd4545c11e5d91a = RemoteSchema(type: "object", properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "pluginOverrides": RemoteSchemas.schema_6db96506f253ef73, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd0a57f27ae4fccb = RemoteSchema(type: "array", items: RemoteSchemas.schema_9dee5b496693b179, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd0f41825028e154 = RemoteSchema(type: "object", required: Set(["defaultSerial", "devices"]), properties: ["defaultSerial": RemoteSchemas.schema_97d85a5eaee82b97, "devices": RemoteSchemas.schema_0a18d7dfd6025fad], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd124b21d98c4aa2 = RemoteSchema(type: "object", properties: ["actions": RemoteSchemas.schema_9f0df99b7a4b0249, "cleanupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeCopyPatterns": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd357f47aa772b6a = RemoteSchema(type: "array", items: RemoteSchemas.schema_0288aefad61e0244, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd6770504afebb5a = RemoteSchema(type: "string", literals: [.string("configured"), .string("absent"), .string("missing"), .string("retained"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cda18ebe4af54c5c = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdc4a9f3587d0382 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c0551fbf082fff0f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdc63841ca583c5b = RemoteSchema(type: "object", required: Set(["id", "name", "type", "vars"]), properties: ["description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_36fea325bf1aca70, "link": RemoteSchemas.schema_2d0b6ec9f2b2decf, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_aaf42afe3bc86594, "vars": RemoteSchemas.schema_02f62ff4e29426df], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdcee850f284e657 = RemoteSchema(type: "string", literals: [.string("turn.completed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdd89e732d29ca0e = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_1fbc0e0d793ae9f1, "usage": RemoteSchemas.schema_80ac3a097b3c79c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ce6e21bdeb9c2f10 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_66d66ce0fd3d9001], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cf7eae9345350df4 = RemoteSchema(type: "string", literals: [.string("running"), .string("idle"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cff1242509563941 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_2b4ffb830b606cf1, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d06f3ce55df8317d = RemoteSchema(type: "string", literals: [.string("configured"), .string("none")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0762ef7709479bc = RemoteSchema(type: "object", required: Set(["day", "totals"]), properties: ["day": RemoteSchemas.schema_bf0b727f7b1c6d07, "totals": RemoteSchemas.schema_05af39c3e918ff5a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0b10c04efa78c87 = RemoteSchema(type: "array", items: RemoteSchemas.schema_a59d7f7afd3350b1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0ecd43b5f1b261a = RemoteSchema(type: "object", required: Set(["name", "path", "type"]), properties: ["name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0fa817300598095 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c30da54b853babca, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d12ea655163290cc = RemoteSchema(type: "string", literals: [.string("run")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1624ea0ecc46dc6 = RemoteSchema(type: "object", required: Set(["fast"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_d1beee40ea84d2e9 = RemoteSchema(type: "object", required: Set(["fastModePercent", "mcpToolCalls", "skillsExplored", "subagentRuns", "totalSkillsUsed", "workflowRuns"]), properties: ["fastModePercent": RemoteSchemas.schema_80c415b6e27c6ebd, "mcpToolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0, "mostActiveHour": RemoteSchemas.schema_58f9a3fda2694c76, "skillsExplored": RemoteSchemas.schema_56aa0e45cbdce0d0, "subagentRuns": RemoteSchemas.schema_56aa0e45cbdce0d0, "topModel": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "topProvider": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "topReasoning": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "totalSkillsUsed": RemoteSchemas.schema_56aa0e45cbdce0d0, "workflowRuns": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1c4cb16ae4c331e = RemoteSchema(type: "object", required: Set(["kind", "runAt"]), properties: ["kind": RemoteSchemas.schema_e5ee0a072228c0a3, "runAt": RemoteSchemas.schema_38adcf16c79023ce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1d1696e7dc33885 = RemoteSchema(type: "string", literals: [.string("desktop"), .string("helper")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1d29954f5424dc9 = RemoteSchema(type: "string", literals: [.string("thread-token"), .string("provider-session")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1df243f455504fc = RemoteSchema(type: "object", required: Set(["type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageKey": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1eba06c8a5dc0a7 = RemoteSchema(type: "object", required: Set(["notes"]), properties: ["notes": RemoteSchemas.schema_6df40201d8c95128], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d205867a8963e342 = RemoteSchema(type: "object", required: Set(["appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"]), properties: ["appVersion": RemoteSchemas.schema_36fea325bf1aca70, "auth": RemoteSchemas.schema_2a8bc62fab6ac143, "capabilities": RemoteSchemas.schema_ea00d31cd890ed26, "desktopId": RemoteSchemas.schema_36fea325bf1aca70, "endpoints": RemoteSchemas.schema_17c2b8a25332cd3a, "hostMode": RemoteSchemas.schema_d1d1696e7dc33885, "label": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_7583b8d37fafbf18, "protocolVersion": RemoteSchemas.schema_8d7cbafc0ecc27cb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d221b1853eb0ef37 = RemoteSchema(type: "object", required: Set(["prefixes"]), properties: ["fallbackRuntime": RemoteSchemas.schema_36fea325bf1aca70, "prefixes": RemoteSchemas.schema_b84e449d1a150abf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2299af726097d6c = RemoteSchema(type: "object", required: Set(["interests", "type"]), properties: ["interests": RemoteSchemas.schema_f1666190cd652261, "type": RemoteSchemas.schema_9f1edfda198d533d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2613d4b01184321 = RemoteSchema(type: "array", minItems: 1, maxItems: 6, items: RemoteSchemas.schema_236f000609716d3a, unknownPolicy: .strip)
}
