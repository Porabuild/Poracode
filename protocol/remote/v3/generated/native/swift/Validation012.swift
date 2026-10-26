// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_d8ae5c3a60a788cd = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_a20681cb358b7044, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8b225d7de9ceec5 = RemoteSchema(type: "string", literals: [.string("terminal-output")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d92866345cd97821 = RemoteSchema(type: "object", required: Set(["environment", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "serverInfo": RemoteSchemas.schema_820293e02a103abf, "status": RemoteSchemas.schema_7ce40fcb9f4c6111, "toolCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "tools": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d92fe09fa7f298ab = RemoteSchema(type: "string", literals: [.string("request.resolved")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d95fd60152159d7a = RemoteSchema(type: "object", required: Set(["kind", "prNumber", "projectId"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "includeReviewBundle": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_c975fc7daa5c30b3, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d9640543f6c97ed9 = RemoteSchema(type: "string", literals: [.string("resync-required")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d9b927ff80c17b5c = RemoteSchema(type: "object", required: Set(["runs"]), properties: ["runs": RemoteSchemas.schema_280ab70e288f77f7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d9ce53289df5afc3 = RemoteSchema(type: "object", required: Set(["deviceId", "sessionId", "threadId"]), properties: ["deviceId": RemoteSchemas.schema_36fea325bf1aca70, "sessionId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da2f0b0d5664d736 = RemoteSchema(type: "object", required: Set(["kind", "record", "threads"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "record": RemoteSchemas.schema_1be5ac91cc4357cb, "threads": RemoteSchemas.schema_123f01d7b38beaff], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da37aeddd0e606ac = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_a99c73e81a312991, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da482300f3faecc5 = RemoteSchema(type: "object", required: Set(["projectId", "projectLocation"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da546ba4a0601e6e = RemoteSchema(type: "object", required: Set(["agentId", "label"]), properties: ["agentId": RemoteSchemas.schema_36fea325bf1aca70, "attempt": RemoteSchemas.schema_56aa0e45cbdce0d0, "chat": RemoteSchemas.schema_1d8def7ed78e9628, "durationMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "label": RemoteSchemas.schema_36fea325bf1aca70, "lastProgressAt": RemoteSchemas.schema_3d06117798bf5171, "lastToolName": RemoteSchemas.schema_bf0b727f7b1c6d07, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "phaseIndex": RemoteSchemas.schema_56aa0e45cbdce0d0, "phaseTitle": RemoteSchemas.schema_bf0b727f7b1c6d07, "promptPreview": RemoteSchemas.schema_bf0b727f7b1c6d07, "queuedAt": RemoteSchemas.schema_3d06117798bf5171, "resultPreview": RemoteSchemas.schema_bf0b727f7b1c6d07, "startedAt": RemoteSchemas.schema_3d06117798bf5171, "state": RemoteSchemas.schema_5a17efba356f5500, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "toolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da6565103c15b143 = RemoteSchema(type: "string", pattern: "^dwp1_[A-Za-z0-9_-]{43}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da66851500474562 = RemoteSchema(type: "object", required: Set(["kind", "name", "parentPath", "source"]), properties: ["kind": RemoteSchemas.schema_8793e380887b215f, "name": RemoteSchemas.schema_36fea325bf1aca70, "parentPath": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_76b2c94b29aad9b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da76232259cbe6bb = RemoteSchema(type: "object", required: Set(["avatarColor", "handle", "name"]), properties: ["avatarColor": RemoteSchemas.schema_8f8e73cb353005a1, "handle": RemoteSchemas.schema_485fa06696a88681, "name": RemoteSchemas.schema_c8709e27df818d5b, "plan": RemoteSchemas.schema_485fa06696a88681], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da9e94c933512927 = RemoteSchema(type: "array", maxItems: 50, items: RemoteSchemas.schema_c52c624815ab6ea5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_db8efd22aa031937 = RemoteSchema(type: "object", required: Set(["url"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dba220fea45f4f88 = RemoteSchema(type: "object", required: Set(["author", "body", "id", "state"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_d2a18aed5ce077b0, "submittedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc69d1c3f1fc465e = RemoteSchema(type: "object", required: Set(["sourceScope"]), properties: ["sourceScope": RemoteSchemas.schema_6a2600edfb55d776], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_dc97711e2c23c867 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d66267c393bb4ec4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc99757951407418 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_ce6e21bdeb9c2f10, RemoteSchemas.schema_3d188d85aa0799fe], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dcb895209e6467d1 = RemoteSchema(type: "object", required: Set(["autoMerge", "headBranch", "prNumber", "projectId", "reviewScope", "watchEnabled"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "config": RemoteSchemas.schema_f69100925fc0e774, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "reviewScope": RemoteSchemas.schema_464dbc5abe96a4c9, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_dcf7bba14632f6b7 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 999.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ddfa380e07db6515 = RemoteSchema(type: "object", required: Set(["notices"]), properties: ["maxBytes": RemoteSchemas.schema_23e05d248383ea40, "maxDecodeBytes": RemoteSchemas.schema_23e05d248383ea40, "notices": RemoteSchemas.schema_f67f6cbe63879b24], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ddfb574eab47db7e = RemoteSchema(type: "object", required: Set(["expiresAt", "ticket", "version"]), properties: ["expiresAt": RemoteSchemas.schema_80c415b6e27c6ebd, "ticket": RemoteSchemas.schema_da6565103c15b143, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_de00765ac7659be8 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_4f84b56b06f60ea1, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_de13949691e24afd = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4545388132b77b29, RemoteSchemas.schema_2130fba9cf5ae781, RemoteSchemas.schema_abcfe9be3ea6f135], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_de21ef9b8d9f6aad = RemoteSchema(type: "object", required: Set(["authState", "capabilities", "installed", "kind", "label"]), properties: ["acpSessionEstablished": RemoteSchemas.schema_feeb8bb50144d96d, "authLogoutSupported": RemoteSchemas.schema_feeb8bb50144d96d, "authMethods": RemoteSchemas.schema_cd0a57f27ae4fccb, "authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "capabilities": RemoteSchemas.schema_66496e59a33f7747, "envDistro": RemoteSchemas.schema_bf0b727f7b1c6d07, "envKind": RemoteSchemas.schema_9eed5c4959909cfe, "executablePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "loginCommand": RemoteSchemas.schema_36fea325bf1aca70, "loginCommandDisplay": RemoteSchemas.schema_36fea325bf1aca70, "preferTerminalLogin": RemoteSchemas.schema_feeb8bb50144d96d, "presentationAuthStates": RemoteSchemas.schema_678d084ee287670a, "presentationAuthUsesProviderLogin": RemoteSchemas.schema_473e9b7f4728cf72, "providerMetadata": RemoteSchemas.schema_197c2b8c01d7f4ed, "runtimeVariants": RemoteSchemas.schema_42cef41d59e9b254, "sessionRuntimeRouting": RemoteSchemas.schema_d221b1853eb0ef37, "update": RemoteSchemas.schema_892eceb2acf00deb, "version": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_deb61378c1ff010b = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_cff1242509563941, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip, transformIds: ["agent-settings.strip-sensitive"])
}

public extension RemoteSchemas {
  static let schema_debc0ac62b48b9e2 = RemoteSchema(type: "number", maximum: 10.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df37d0da6ffc8371 = RemoteSchema(type: "object", required: Set(["title"]), properties: ["title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df704162f3d15808 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_36fea325bf1aca70, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df7fa3d1be8ffbea = RemoteSchema(type: "object", required: Set(["checkpoints", "turns"]), properties: ["checkpoints": RemoteSchemas.schema_12344c6d82d54c6d, "turns": RemoteSchemas.schema_203e1407dc2d843e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df96bd315b4c0dae = RemoteSchema(type: "object", required: Set(["anchorItemId", "endedAt", "startedAt"]), properties: ["anchorItemId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "endedAt": RemoteSchemas.schema_36fea325bf1aca70, "startedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dfbf83bd7409c8d7 = RemoteSchema(type: "object", required: Set(["latitude", "longitude", "type"]), properties: ["latitude": RemoteSchemas.schema_3a762c9b6eacc492, "longitude": RemoteSchemas.schema_f1261de365f15bea, "type": RemoteSchemas.schema_1a0723da99007052], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_dfc3f3726c991dbe = RemoteSchema(type: "string", maxLength: 4096, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e005a5ac28cf7191 = RemoteSchema(type: "array", items: RemoteSchemas.schema_ee4a36083d770366, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e01133268267ec38 = RemoteSchema(type: "object", required: Set(["outcome", "requestId", "threadId", "type"]), properties: ["outcome": RemoteSchemas.schema_506f036707472345, "requestId": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_d92fe09fa7f298ab], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0726fd608f2ab5f = RemoteSchema(type: "array", items: RemoteSchemas.schema_131fd1869b52ef74, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0bc631a257fd15a = RemoteSchema(type: "object", required: Set(["device", "identity"]), properties: ["device": RemoteSchemas.schema_26f96950d20651b3, "identity": RemoteSchemas.schema_da76232259cbe6bb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0da1e0a5e3cd077 = RemoteSchema(type: "object", required: Set(["headers", "type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_4f84b56b06f60ea1, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_e0e12d4798687ab0 = RemoteSchema(type: "object", required: Set(["codec", "transport"]), properties: ["codec": RemoteSchemas.schema_a8565e7811b17010, "transport": RemoteSchemas.schema_4f84b56b06f60ea1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0fc3c3d350deb38 = RemoteSchema(type: "array", items: RemoteSchemas.schema_191ccdb4e41abc75, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e105701b122113cd = RemoteSchema(type: "object", required: Set(["descriptor", "notice", "outcome", "supersededAcceptedEvents"]), properties: ["descriptor": RemoteSchemas.schema_c66f09c6212330ba, "notice": RemoteSchemas.schema_1468dfe9a2db9c9d, "outcome": RemoteSchemas.schema_c62b342ed89c5809, "supersededAcceptedEvents": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e163a1a22234ae4f = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e1a91348d83820fb = RemoteSchema(type: "string", literals: [.string("events")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e213e5cbde87bf9f = RemoteSchema(type: "object", required: Set(["hostKeyFingerprint", "state"]), properties: ["hostKeyFingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "observedFingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "state": RemoteSchemas.schema_eaed5114fa77917e], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_e22de6db69f83369 = RemoteSchema(type: "string", pattern: "^[A-Z]{3}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e25509dad8a191fe = RemoteSchema(type: "string", literals: [.string("empty"), .string("generating"), .string("ready"), .string("failed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e26989c54e256c6f = RemoteSchema(type: "object", properties: ["approvalPolicies": RemoteSchemas.schema_d0b10c04efa78c87, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizeChangeReloadsSession": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_515482d2104d1efa, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_cb81a9dbb81a1a63, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_e163a1a22234ae4f, "modelFamilies": RemoteSchemas.schema_ae3b637db050db2a, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_d0b10c04efa78c87, "modes": RemoteSchemas.schema_acf85c3d3b25a389, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_d0b10c04efa78c87, "settingDefs": RemoteSchemas.schema_113b6f36094df840, "showRuntimeLabelInPicker": RemoteSchemas.schema_feeb8bb50144d96d, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e2d96ee09e9d99a2 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "includePrDetails": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_fc779c522d442c13, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e301e52cd3d3ea46 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, pattern: "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e333e5cd970cf11f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_109baa93f8b988b2, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e37012a6e5cb600d = RemoteSchema(type: "string", literals: [.string("websocket")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3b2f0593652d957 = RemoteSchema(type: "object", required: Set(["available"]), properties: ["available": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3fc8b89f137aafe = RemoteSchema(type: "string", maxLength: 1000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e41b25797ed24d45 = RemoteSchema(type: "object", required: Set(["projectLocation", "sourceBranch", "worktreeBranch", "worktreeLocation"]), properties: ["expectedWorktreeCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e47ad2358cf0df53 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_80ac3a097b3c79c7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e4a434d61cd0f65f = RemoteSchema(type: "string", literals: [.string("minutes"), .string("hours"), .string("days")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e4ed0fc98f59d7f1 = RemoteSchema(type: "array", maxItems: 1000, items: RemoteSchemas.schema_d832acd230fbc919, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e510e581c4f8b523 = RemoteSchema(type: "object", required: Set(["kind", "payload"]), properties: ["kind": RemoteSchemas.schema_ffc64b31e09ad873, "payload": RemoteSchemas.schema_626f8596f7256857], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e51d77fd6734b53a = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e527c3ee29cd639b = RemoteSchema(type: "string", literals: [.string("auth-required")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e56382aee3ea3c7f = RemoteSchema(type: "object", required: Set(["projectLocation", "workflowId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "inputs": RemoteSchemas.schema_fd056ca894e30f21, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "ref": RemoteSchemas.schema_36fea325bf1aca70, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e5bbd3e940039349 = RemoteSchema(type: "string", maxLength: 200, unknownPolicy: .strip, transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_e5ee0a072228c0a3 = RemoteSchema(type: "string", literals: [.string("once")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e65689e97e7d91c3 = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_9dd9855628dd71ae, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_114549e732be9b99], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6958017dac6cd3b = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_ca3d163bab055381, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6bc2fd97be6dec8 = RemoteSchema(type: "string", literals: [.string("none"), .string("view"), .string("control")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6cfd13a746cd290 = RemoteSchema(type: "number", literals: [.int(4)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6da2ef0eeb6a138 = RemoteSchema(type: "object", required: Set(["agentKind", "baseBranch", "branch", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "branch": RemoteSchemas.schema_36fea325bf1aca70, "language": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6f95dbaa32318b7 = RemoteSchema(type: "object", required: Set(["height", "width"]), properties: ["height": RemoteSchemas.schema_1b6b610bba2774d6, "inputUnavailable": RemoteSchemas.schema_feeb8bb50144d96d, "orientation": RemoteSchemas.schema_b3ef93117a9f9f95, "width": RemoteSchemas.schema_1b6b610bba2774d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e70be7a06d8baea6 = RemoteSchema(type: "object", required: Set(["cacheRead", "cacheWrite", "input", "output"]), properties: ["cacheRead": RemoteSchemas.schema_56aa0e45cbdce0d0, "cacheWrite": RemoteSchemas.schema_56aa0e45cbdce0d0, "cacheWrite1h": RemoteSchemas.schema_56aa0e45cbdce0d0, "input": RemoteSchemas.schema_56aa0e45cbdce0d0, "output": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e761211b82c40573 = RemoteSchema(type: "object", required: Set(["servers"]), properties: ["servers": RemoteSchemas.schema_dc97711e2c23c867], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e788b86a30c28e0d = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70, "variant": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e78ddc126c04f09d = RemoteSchema(type: "string", minLength: 1, maxLength: 64000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e78f40fc5399f7f1 = RemoteSchema(type: "string", maxLength: 200, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7c244bd461f7229 = RemoteSchema(type: "array", items: RemoteSchemas.schema_93ea7778107ef974, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7c7f30aecaa99f0 = RemoteSchema(type: "string", minLength: 1, maxLength: 500, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7cab2d2c052144f = RemoteSchema(type: "object", required: Set(["id", "kind"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_4d5989d27d26b612], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e80087031872d26b = RemoteSchema(type: "object", required: Set(["confidenceThreshold", "kind", "stopWhen"]), properties: ["confidenceThreshold": RemoteSchemas.schema_5d4b39004bf5c532, "kind": RemoteSchemas.schema_5bbcf9e4750fbaa3, "stopWhen": RemoteSchemas.schema_5c6957eaa59e2ae2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e82ae39cda9f878d = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_f9e7f90793023053, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e841af2cbd75708d = RemoteSchema(type: "string", literals: [.string("toggle")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e847e321fbb6435b = RemoteSchema(type: "string", maxLength: 120, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e8ae3938f73bbe3d = RemoteSchema(type: "string", maxLength: 16000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e8fbf0f2cbb425a8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_20d706a189398fff, RemoteSchemas.schema_37eeca9f5377b6e4, RemoteSchemas.schema_66021940878f3abc, RemoteSchemas.schema_7a00457b3e3294c1, RemoteSchemas.schema_81440643a0f1796d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e96ebdc8b8af5200 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "rebase": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e987f23b082616d2 = RemoteSchema(type: "string", literals: [.string("A"), .string("B"), .string("C"), .string("D"), .string("F")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9df8b4f3dcc8aae = RemoteSchema(type: "object", required: Set(["flowId"]), properties: ["flowId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9e7b28a3dddd9fd = RemoteSchema(type: "object", required: Set(["enabled", "id", "name", "timeoutMs", "transport"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_23e05d248383ea40, "transport": RemoteSchemas.schema_5296d6b04d46b630, "unsupportedReason": RemoteSchemas.schema_2556bf4896893601], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9f57f9b4751d6e1 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 3600.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea08f63f22aa2011 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_3a38f5dc8038f065, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea193ab85993872c = RemoteSchema(type: "integer", defaultValue: .int(5), minimum: 2.0, maximum: 120.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea3d1d70c1876de4 = RemoteSchema(type: "object", required: Set(["account", "runtime"]), properties: ["account": RemoteSchemas.schema_5646cf57ff3aebe0, "runtime": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea7fc856bb9aa12e = RemoteSchema(type: "object", required: Set(["baseBranch", "isDraft", "number", "state", "title", "updatedAt", "url"]), properties: ["baseBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "checksStatus": RemoteSchemas.schema_bf0b727f7b1c6d07, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "isCrossRepository": RemoteSchemas.schema_feeb8bb50144d96d, "isDraft": RemoteSchemas.schema_feeb8bb50144d96d, "mergeStateStatus": RemoteSchemas.schema_ecf46d016507c672, "mergeable": RemoteSchemas.schema_05ab37f667d37cfc, "number": RemoteSchemas.schema_23e05d248383ea40, "reviewDecision": RemoteSchemas.schema_bf0b727f7b1c6d07, "source": RemoteSchemas.schema_2e68c47efd6e1f9c, "state": RemoteSchemas.schema_79fd49e14d0e7e17, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "viewerDidAuthor": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea993e5b2d87f77f = RemoteSchema(type: "object", required: Set(["detected", "forwards"]), properties: ["detected": RemoteSchemas.schema_58c75b9ad5972758, "forwards": RemoteSchemas.schema_2c93150c89b253f9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaa8e54151cd7fc2 = RemoteSchema(type: "object", required: Set(["expiresAt", "ticket"]), properties: ["expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaed3cfbf46d5d81 = RemoteSchema(type: "string", literals: [.string("github"), .string("gitlab"), .string("forgejo"), .string("gitea"), .string("bitbucket"), .string("azure-devops"), .string("gitcafe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaed5114fa77917e = RemoteSchema(type: "string", literals: [.string("pinned")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaf8a91849801b20 = RemoteSchema(type: "object", required: Set(["status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb12aad2875e1908 = RemoteSchema(type: "object", required: Set(["projectLocation", "runId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "runId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb148d7195a1780a = RemoteSchema(type: "string", literals: [.string("downloaded")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2405f61baf028b = RemoteSchema(type: "object", required: Set(["bytesPerSecond", "percent", "total", "transferred", "type"]), properties: ["bytesPerSecond": RemoteSchemas.schema_80c415b6e27c6ebd, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "total": RemoteSchemas.schema_80c415b6e27c6ebd, "transferred": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_bd136ee4bcce8b07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2798e2ccc8bf65 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_5646cf57ff3aebe0, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2cfe298949fa66 = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_77c646d1a00c89a5, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "questionAnswer": RemoteSchemas.schema_4d59c815dfec80c4, "segments": RemoteSchemas.schema_4392338ffc80bed7, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebd70a208b453fe1 = RemoteSchema(type: "object", required: Set(["kind", "starred"]), properties: ["kind": RemoteSchemas.schema_833ef472e7760fae, "starred": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebfa6f1c64210a5f = RemoteSchema(type: "object", required: Set(["kind", "projectId", "workspaceId"]), properties: ["kind": RemoteSchemas.schema_96cd458fa9bae303, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_df704162f3d15808], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec221fdc1494d0b1 = RemoteSchema(type: "string", pattern: "^[a-f0-9]{64}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec76fa076d16485a = RemoteSchema(type: "object", required: Set(["type", "version"]), properties: ["type": RemoteSchemas.schema_eb148d7195a1780a, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecbd7591c9493c90 = RemoteSchema(type: "object", required: Set(["diff"]), properties: ["diff": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecc6edb6166acda9 = RemoteSchema(type: "object", required: Set(["activeTabId", "tabs"]), properties: ["activeTabId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "tabs": RemoteSchemas.schema_bf3a4ed0e5798352], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecde1f3c1f09bdc0 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1fb6f9ae5f6d1a02, RemoteSchemas.schema_6f5cce5ce127f97f, RemoteSchemas.schema_e213e5cbde87bf9f], unknownPolicy: .strip)
}
