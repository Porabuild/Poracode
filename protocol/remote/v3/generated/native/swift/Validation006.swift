// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_8103808258c2d166 = RemoteSchema(type: "object", required: Set(["name"]), properties: ["label": RemoteSchemas.schema_2d0b6ec9f2b2decf, "name": RemoteSchemas.schema_36fea325bf1aca70, "optional": RemoteSchemas.schema_feeb8bb50144d96d, "secret": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_81055c9199569630 = RemoteSchema(type: "object", additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_81440643a0f1796d = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_61fc4b3eaedeba13, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_815909fa96d68d7b = RemoteSchema(type: "object", required: Set(["itemId", "threadId"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_820293e02a103abf = RemoteSchema(type: "object", properties: ["name": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82088d0ad1ba613a = RemoteSchema(type: "object", required: Set(["imported"]), properties: ["imported": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_828172bf1752b0f1 = RemoteSchema(type: "object", required: Set(["marketplace"]), properties: ["marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "query": RemoteSchemas.schema_e5bbd3e940039349, "sort": RemoteSchemas.schema_1eaf563a1e9fa631], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_829c74ec0aec2226 = RemoteSchema(type: "string", literals: [.string("desktop-event")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82c3c76b7f06ef87 = RemoteSchema(type: "object", required: Set(["config", "connectionId", "offerSdp", "threadId"]), properties: ["config": RemoteSchemas.schema_023567f0898d4d6d, "connectionId": RemoteSchemas.schema_d855999aed5e6438, "offerSdp": RemoteSchemas.schema_e78ddc126c04f09d, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82e8027595898a28 = RemoteSchema(type: "object", required: Set(["conclusion", "id", "name", "status", "steps"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_3d06117798bf5171, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07, "steps": RemoteSchemas.schema_f1a8832c8ce43a2f, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82fdb789883e6159 = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_6801e053c0220116, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_833ef472e7760fae = RemoteSchema(type: "string", literals: [.string("set-starred")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8345d2f810cef034 = RemoteSchema(type: "object", required: Set(["kind", "scope", "server"]), properties: ["kind": RemoteSchemas.schema_375b3978f669c107, "scope": RemoteSchemas.schema_dc99757951407418, "server": RemoteSchemas.schema_c04b1452d18edb3f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83470ce63973b6e2 = RemoteSchema(type: "object", required: Set(["hostId", "projectId"]), properties: ["hostId": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_835d30ad470a686c = RemoteSchema(type: "string", literals: [.string("posix")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83671e64288686fc = RemoteSchema(type: "object", required: Set(["hash"]), properties: ["appVersion": RemoteSchemas.schema_a016251474d39e0d, "hash": RemoteSchemas.schema_ec221fdc1494d0b1], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_837a60dd43077637 = RemoteSchema(type: "object", required: Set(["agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"]), properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_65899fb957cb9421, "enabledMcpServers": RemoteSchemas.schema_2d677fb04187d46b, "followUpBehavior": RemoteSchemas.schema_6fcb1a55c059e655, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "usage": RemoteSchemas.schema_18dc352c9a615faa, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_838adcbcaff5f551 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_3975ceeb3762f594, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c64b38404fc9a1d4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_839da5c7aa9ba993 = RemoteSchema(type: "object", required: Set(["author", "body", "createdAt", "id"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83c7c01b4046dd13 = RemoteSchema(type: "object", required: Set(["command", "type"]), properties: ["args": RemoteSchemas.schema_aac2a4e83d2823be, "command": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_36fea325bf1aca70, "env": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_01f71c4e26e7ecde], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8428abfcec0a8b32 = RemoteSchema(type: "object", required: Set(["environment"]), properties: ["environment": RemoteSchemas.schema_d832acd230fbc919], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_847ec488263c8777 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "initialSize", "projectLocation", "threadId"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_023567f0898d4d6d, "disabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "disabledBuiltInMcpTools": RemoteSchemas.schema_fdad254a8bac8914, "ensureRunning": RemoteSchemas.schema_d2dd3595e1b5e5dc, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "mcpServers": RemoteSchemas.schema_7f86e779ad379105, "mentionHandoff": RemoteSchemas.schema_d2dd3595e1b5e5dc, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_38d1a07d3b9b1c82, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "segments": RemoteSchemas.schema_4392338ffc80bed7, "sessionRef": RemoteSchemas.schema_3b70e9f118e13840, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_849e43bfc063f1bb = RemoteSchema(type: "object", required: Set(["invocation", "kind", "name", "provider", "scope"]), properties: ["invocation": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2a65cef1bc5905f9, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "provider": RemoteSchemas.schema_36fea325bf1aca70, "scope": RemoteSchemas.schema_ac6ea0fc110d7efb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84af3e97516dc824 = RemoteSchema(type: "object", required: Set(["experimentId"]), properties: ["experimentId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84c6a19f87f29012 = RemoteSchema(type: "array", minItems: 1, maxItems: 8, items: RemoteSchemas.schema_941a12a3ce0aadca, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_858154dd1760868f = RemoteSchema(type: "object", required: Set(["updatedAt", "windows", "wsl"]), properties: ["updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "windows": RemoteSchemas.schema_334a3e37f018e30d, "wsl": RemoteSchemas.schema_334a3e37f018e30d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85b777c0c99bbbca = RemoteSchema(type: "integer", minimum: 1.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85c1db78d5c7dc29 = RemoteSchema(type: "string", minLength: 1, maxLength: 512, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85d2dd31fd2f4872 = RemoteSchema(type: "object", required: Set(["state", "threadId", "turnId", "type"]), properties: ["state": RemoteSchemas.schema_115555b2d2065a65, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_cdcee850f284e657], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86230e1fa3f38188 = RemoteSchema(type: "string", literals: [.string("wsl-user")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_868bf1042a1bbba1 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86b938ce61c1942e = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_d66267c393bb4ec4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86d5d72e84423420 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_0f732b9fceb2c6ac, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_871fe12f7dc5ccf6 = RemoteSchema(type: "object", required: Set(["answerSdp"]), properties: ["answerSdp": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_872dc7babad00cd3 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1709690cf0edf961, RemoteSchemas.schema_2b7b34c95b23bb0d, RemoteSchemas.schema_0e8f58f429bb1135, RemoteSchemas.schema_d550ef9994fd388f, RemoteSchemas.schema_838adcbcaff5f551, RemoteSchemas.schema_5af10e67b405a136, RemoteSchemas.schema_3f58316dbb160752, RemoteSchemas.schema_d2299af726097d6c, RemoteSchemas.schema_93bef3a552bf787e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_875b3bd94059f8e1 = RemoteSchema(type: "object", required: Set(["kind", "position", "tabId", "targetTabId"]), properties: ["kind": RemoteSchemas.schema_ed1865d937c91a50, "position": RemoteSchemas.schema_3512bd687eb85e90, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "targetTabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8793e380887b215f = RemoteSchema(type: "string", literals: [.string("clone")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8795ea0289d608d6 = RemoteSchema(type: "string", literals: [.string("1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_883b3b8a6153aa17 = RemoteSchema(type: "string", literals: [.string("read-error"), .string("missing-file"), .string("too-large"), .string("missing-frontmatter"), .string("missing-name"), .string("invalid-name"), .string("name-mismatch"), .string("missing-description"), .string("description-too-long")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_88444d52d400622b = RemoteSchema(type: "string", literals: [.string("relocate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_88480e7409f5bc30 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("server")], defaultValue: .string("terminal"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89033d459dedce3c = RemoteSchema(type: "object", required: Set(["marketplace", "skills", "total"]), properties: ["marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "skills": RemoteSchemas.schema_2f0b42b84f3f48a0, "total": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8906d017ba691d6f = RemoteSchema(type: "object", required: Set(["kind", "text"]), properties: ["kind": RemoteSchemas.schema_19030914d1c4d410, "text": RemoteSchemas.schema_00876431431924e0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_891e9ab2413a4e77 = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_620971ca171eff87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89a32138dca165c4 = RemoteSchema(type: "object", required: Set(["authorizationUrl", "flowId", "status"]), properties: ["authorizationUrl": RemoteSchemas.schema_36fea325bf1aca70, "flowId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_bd96f28e94e5dff9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89bc4017c2e23cd6 = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_034741cb26a53fe4, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8a0ca790b0047a5e = RemoteSchema(type: "object", required: Set(["definition"]), properties: ["definition": RemoteSchemas.schema_02179e6a4b6545d5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8a62b43ffe3b4668 = RemoteSchema(type: "object", required: Set(["skills"]), properties: ["skills": RemoteSchemas.schema_3cc2bb39a7445b48], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ab3ef50febb54d1 = RemoteSchema(type: "object", required: Set(["id", "name", "type"]), properties: ["args": RemoteSchemas.schema_0f732b9fceb2c6ac, "description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "env": RemoteSchemas.schema_e51d77fd6734b53a, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c4197e46f3baa871], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ace86d01d0cc126 = RemoteSchema(type: "object", required: Set(["environment", "error", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "error": RemoteSchemas.schema_f145218b6dee66b6, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_e527c3ee29cd639b, "toolCount": RemoteSchemas.schema_499c88c1c549e934], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b52512d7a324001 = RemoteSchema(type: "object", required: Set(["projectId", "worktreePaths"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8be1194a627287d7 = RemoteSchema(type: "object", required: Set(["autoMerge", "headBranch", "prNumber", "projectId", "watchEnabled"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "config": RemoteSchemas.schema_048d1517dd77004e, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_8c61ed237d0ab3d0 = RemoteSchema(type: "string", literals: [.string("inactive"), .string("launching"), .string("working"), .string("idle"), .string("finished"), .string("needs_approval"), .string("needs_reply"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c71be0e7fdf9e1a = RemoteSchema(type: "array", items: RemoteSchemas.schema_9137d8707520f367, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d017de5d26dce37 = RemoteSchema(type: "array", items: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d15f7f900e19f14 = RemoteSchema(type: "object", required: Set(["anchor"]), properties: ["anchor": RemoteSchemas.schema_98ef330d70f2e681], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d3732b59a0dd026 = RemoteSchema(type: "string", literals: [.string("file"), .string("directory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8dfc34ff217d09b7 = RemoteSchema(type: "object", required: Set(["filesPhase", "numTurns", "outcome", "providerPhase", "removedCompletedTurnAnchors", "replayed", "truncatePhase"]), properties: ["filesPhase": RemoteSchemas.schema_efc124973b411d28, "numTurns": RemoteSchemas.schema_3d06117798bf5171, "outcome": RemoteSchemas.schema_08ce03e6077b28a9, "providerPhase": RemoteSchemas.schema_11ada4e73a793b0d, "removedCompletedTurnAnchors": RemoteSchemas.schema_0f732b9fceb2c6ac, "replayed": RemoteSchemas.schema_feeb8bb50144d96d, "truncatePhase": RemoteSchemas.schema_35962a43ae5cecce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e43cad70cd70de7 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f483f0889171da1 = RemoteSchema(type: "string", literals: [.string("session:read"), .string("session:operate"), .string("terminal:read"), .string("terminal:operate"), .string("requests:resolve"), .string("projects:manage"), .string("ports:forward")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f58c1d1acd8bc3c = RemoteSchema(type: "object", required: Set(["data", "metadata", "tabId", "type"]), properties: ["data": RemoteSchemas.schema_36fea325bf1aca70, "metadata": RemoteSchemas.schema_7d9e4e8a681070bb, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c2894654f12fb350], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f739487924008df = RemoteSchema(type: "string", literals: [.string("cli_hook"), .string("terminal_parse"), .string("server")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f8e73cb353005a1 = RemoteSchema(type: "string", maxLength: 64, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f934fd77b3e45dd = RemoteSchema(type: "object", required: Set(["deviceId"]), properties: ["deviceId": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_902ee7904a410968 = RemoteSchema(type: "string", literals: [.string("page"), .string("inventory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9063020a6c5ad8b3 = RemoteSchema(type: "string", literals: [.string("navigate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_913674349845fda9 = RemoteSchema(type: "string", literals: [.string("thread-transcript"), .string("context-file")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9137d8707520f367 = RemoteSchema(type: "object", required: Set(["displayName", "kind", "name", "runCount"]), properties: ["displayName": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_b096158c792e0431, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "runCount": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91766049dfdea029 = RemoteSchema(type: "string", literals: [.string("managed"), .string("external"), .string("built-in"), .string("plugin")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9189c3f251645aa9 = RemoteSchema(type: "string", literals: [.string("item.updated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9199b6e9ea61b83e = RemoteSchema(type: "object", required: Set(["comments", "id", "isOutdated", "isResolved"]), properties: ["comments": RemoteSchemas.schema_971eac5c1ec68beb, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isOutdated": RemoteSchemas.schema_feeb8bb50144d96d, "isResolved": RemoteSchemas.schema_feeb8bb50144d96d, "line": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91a5d2d349991a6a = RemoteSchema(type: "string", literals: [.string("cumulative"), .string("per-call")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91dcfb42aac98166 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_0174a8d738e73980, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91e1df4b9542bd01 = RemoteSchema(type: "object", required: Set(["pullRequests"]), properties: ["pullRequests": RemoteSchemas.schema_55a090c12a60cd7e, "viewerLogin": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_920e2e5db293bc41 = RemoteSchema(type: "object", required: Set(["fastForward", "merged"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "conflicting": RemoteSchemas.schema_feeb8bb50144d96d, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastForward": RemoteSchemas.schema_feeb8bb50144d96d, "merged": RemoteSchemas.schema_feeb8bb50144d96d, "needsStash": RemoteSchemas.schema_feeb8bb50144d96d, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashCommit": RemoteSchemas.schema_bf0b727f7b1c6d07, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_922ae6d8b34c9e29 = RemoteSchema(type: "object", required: Set(["activeWorktreePaths", "projectLocation"]), properties: ["activeWorktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9278450827e5f1b3 = RemoteSchema(type: "object", required: Set(["id", "kind", "task"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_cbc64d14585e9a92, "task": RemoteSchemas.schema_452971469565c49c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9358a37bbc89d2ef = RemoteSchema(type: "string", literals: [.string("github"), .string("gitlab"), .string("bitbucket"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9368b22ce42bb60e = RemoteSchema(type: "string", literals: [.string("preferred"), .string("powershell")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_938414fbfa27a773 = RemoteSchema(type: "object", required: Set(["capturedAt", "checkpointItemId", "commit", "ref", "threadId"]), properties: ["capturedAt": RemoteSchemas.schema_36fea325bf1aca70, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "commit": RemoteSchemas.schema_36fea325bf1aca70, "ref": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_939b432562853e88 = RemoteSchema(type: "object", required: Set(["expectedRevision"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_93bef3a552bf787e = RemoteSchema(type: "object", required: Set(["threadIds", "type"]), properties: ["threadIds": RemoteSchemas.schema_39d8d7cbf4384109, "type": RemoteSchemas.schema_25e47114d380c1fb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93de8c66d5d74078 = RemoteSchema(type: "object", required: Set(["kind", "lastDraftConfig", "projectId"]), properties: ["kind": RemoteSchemas.schema_93f8fa8787f246fe, "lastDraftConfig": RemoteSchemas.schema_fadbe22ed908e7c7, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93ea7778107ef974 = RemoteSchema(type: "object", required: Set(["createdAt", "done", "id", "text"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "done": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "text": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93f8fa8787f246fe = RemoteSchema(type: "string", literals: [.string("set-draft-config")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_941a12a3ce0aadca = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_3d06117798bf5171], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_949f0ec1c2b67829 = RemoteSchema(type: "string", literals: [.string("ready"), .string("binary"), .string("too_large"), .string("unsupported"), .string("missing")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_94e04fb40cc1be58 = RemoteSchema(type: "object", required: Set(["branch", "path"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_94eb65eacab30b70 = RemoteSchema(type: "object", required: Set(["entries", "homePath", "parentPath", "path", "truncated"]), properties: ["entries": RemoteSchemas.schema_5da64eb8d698413e, "homePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "parentPath": RemoteSchemas.schema_2d0b6ec9f2b2decf, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_953c573b196de65a = RemoteSchema(type: "string", literals: [.string("global"), .string("project-relative")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_95bca512ea5c155a = RemoteSchema(type: "object", required: Set(["attempt", "conclusion", "createdAt", "event", "headBranch", "headSha", "id", "jobs", "name", "number", "startedAt", "status", "title", "updatedAt", "url", "workflowId", "workflowName"]), properties: ["attempt": RemoteSchemas.schema_3d06117798bf5171, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "event": RemoteSchemas.schema_bf0b727f7b1c6d07, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_3d06117798bf5171, "jobs": RemoteSchemas.schema_48de96c42130e156, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "number": RemoteSchemas.schema_3d06117798bf5171, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "workflowId": RemoteSchemas.schema_3d06117798bf5171, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_95d0adeb5b1f4c44 = RemoteSchema(type: "object", required: Set(["data", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_2cfe911595ad978d, "data": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_d8b225d7de9ceec5], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.output-data-utf16"])
}

public extension RemoteSchemas {
  static let schema_962b214fbc91a2f5 = RemoteSchema(type: "string", literals: [.string("pairing-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9633843f8b51827f = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "routing": RemoteSchemas.schema_fe73ac6ba621dd72], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9645658cf3b0cbb3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_94e04fb40cc1be58, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_965bd4463b1b7307 = RemoteSchema(type: "object", required: Set(["run"]), properties: ["mtimeMs": RemoteSchemas.schema_f696f11685898ba7, "run": RemoteSchemas.schema_74659b54c1ae64b8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96776c817a074e1f = RemoteSchema(type: "string", literals: [.string("thread"), .string("agentSettings")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96967a6998f6cab7 = RemoteSchema(type: "string", minLength: 8, maxLength: 110, pattern: "^[A-Za-z0-9._:-]+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96aaf279dc8f3856 = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "effort": RemoteSchemas.schema_36fea325bf1aca70, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "language": RemoteSchemas.schema_36fea325bf1aca70, "model": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96cd458fa9bae303 = RemoteSchema(type: "string", literals: [.string("set-workspace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_971eac5c1ec68beb = RemoteSchema(type: "array", items: RemoteSchemas.schema_839da5c7aa9ba993, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9780f521bc1dee38 = RemoteSchema(type: "string", literals: [.string("thread-events"), .string("thread-bytes"), .string("global-events"), .string("global-bytes"), .string("oversize"), .string("age"), .string("degraded"), .string("rebase-dropped"), .string("shutdown"), .string("unclean-epoch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97d27c4efa52f52a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_fb3dd6021c9a98a4, RemoteSchemas.schema_9c44204b656290c2], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97d85a5eaee82b97 = RemoteSchema(type: "string", minLength: 1, maxLength: 256, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97dee2d4960c1271 = RemoteSchema(type: "object", properties: ["approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97f51a15a8f553b2 = RemoteSchema(type: "object", properties: ["approvalPolicies": RemoteSchemas.schema_d0b10c04efa78c87, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_515482d2104d1efa, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_cb81a9dbb81a1a63, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_e163a1a22234ae4f, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_d0b10c04efa78c87, "modes": RemoteSchemas.schema_acf85c3d3b25a389, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_d0b10c04efa78c87, "settingDefs": RemoteSchemas.schema_113b6f36094df840, "showRuntimeLabelInPicker": RemoteSchemas.schema_feeb8bb50144d96d, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98139abfca5e2eda = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c1d4a9f752e166b1, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_989c2d06cc986156 = RemoteSchema(type: "object", required: Set(["nextCursor", "runtimeSummariesByThread", "threads"]), properties: ["gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "inventoryFrontier": RemoteSchemas.schema_36fea325bf1aca70, "nextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "threads": RemoteSchemas.schema_db007a8f52596a1a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98c9ef3e406d69bf = RemoteSchema(type: "object", required: Set(["deviceId", "platform"]), properties: ["activityTokens": RemoteSchemas.schema_b84e449d1a150abf, "alertPreferences": RemoteSchemas.schema_0534fb6201293569, "appVersion": RemoteSchemas.schema_36fea325bf1aca70, "deviceId": RemoteSchemas.schema_212ab189f2321de4, "deviceToken": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_41d0cf68976485ec, "pushToStartToken": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2, "webAppBasePath": RemoteSchemas.schema_25a3e0b2a9eecdfb, "webPushSubscription": RemoteSchemas.schema_fd8574a70c8187db], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["push.registration.platform-fields"])
}

public extension RemoteSchemas {
  static let schema_98ef330d70f2e681 = RemoteSchema(type: "object", required: Set(["data", "version"]), properties: ["data": RemoteSchemas.schema_ca3d163bab055381, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_995ee3e349270afe = RemoteSchema(type: "string", literals: [.string("remote-reachable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_996ce1c4e0b82a8b = RemoteSchema(type: "object", required: Set(["delta", "itemId", "stream", "threadId", "type"]), properties: ["delta": RemoteSchemas.schema_bf0b727f7b1c6d07, "itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "replace": RemoteSchemas.schema_feeb8bb50144d96d, "stream": RemoteSchemas.schema_b5c1f44eaf04477b, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_f30731ffd8c57b5c], additionalAllowed: true, unknownPolicy: .strip)
}
