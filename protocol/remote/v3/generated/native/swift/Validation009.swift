// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_8ce7154e450128c7 = RemoteSchema(type: "object", properties: ["approvalPolicies": RemoteSchemas.schema_d0b10c04efa78c87, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizeChangeReloadsSession": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_515482d2104d1efa, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_cb81a9dbb81a1a63, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_e163a1a22234ae4f, "modelFamilies": RemoteSchemas.schema_ae3b637db050db2a, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_d0b10c04efa78c87, "modes": RemoteSchemas.schema_acf85c3d3b25a389, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_d0b10c04efa78c87, "settingDefs": RemoteSchemas.schema_113b6f36094df840, "showRuntimeLabelInPicker": RemoteSchemas.schema_feeb8bb50144d96d, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa, "workflowLabel": RemoteSchemas.schema_36fea325bf1aca70, "workflowModels": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8cec6a74a97374d7 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 9600044.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d017de5d26dce37 = RemoteSchema(type: "array", items: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d030d3e3d2256ff = RemoteSchema(type: "string", literals: [.string("setup")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d15f7f900e19f14 = RemoteSchema(type: "object", required: Set(["anchor"]), properties: ["anchor": RemoteSchemas.schema_98ef330d70f2e681], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d3732b59a0dd026 = RemoteSchema(type: "string", literals: [.string("file"), .string("directory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d7cbafc0ecc27cb = RemoteSchema(type: "number", literals: [.int(14)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d889103a9834b21 = RemoteSchema(type: "object", required: Set(["kind", "sourceThreadId", "title"]), properties: ["kind": RemoteSchemas.schema_587e72c508e2943a, "sourceThreadId": RemoteSchemas.schema_36fea325bf1aca70, "throughItemId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8dfc34ff217d09b7 = RemoteSchema(type: "object", required: Set(["filesPhase", "numTurns", "outcome", "providerPhase", "removedCompletedTurnAnchors", "replayed", "truncatePhase"]), properties: ["filesPhase": RemoteSchemas.schema_efc124973b411d28, "numTurns": RemoteSchemas.schema_3d06117798bf5171, "outcome": RemoteSchemas.schema_08ce03e6077b28a9, "providerPhase": RemoteSchemas.schema_11ada4e73a793b0d, "removedCompletedTurnAnchors": RemoteSchemas.schema_0f732b9fceb2c6ac, "replayed": RemoteSchemas.schema_feeb8bb50144d96d, "truncatePhase": RemoteSchemas.schema_35962a43ae5cecce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e2e8bbf081abcf9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_056e1da676eab3d9, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e43cad70cd70de7 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e7b4d097aa71417 = RemoteSchema(type: "string", literals: [.string("reorder-flat")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e9c16e558778bd4 = RemoteSchema(type: "string", literals: [.string("light"), .string("dark")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8edde8b52fa98394 = RemoteSchema(type: "object", required: Set(["contextStrategy", "inheritedTurnCount", "threadId", "throughItemId", "title", "version"]), properties: ["contextStrategy": RemoteSchemas.schema_38041bf5caec6644, "inheritedTurnCount": RemoteSchemas.schema_23e05d248383ea40, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "throughItemId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_8fa99a81fa4d20fb = RemoteSchema(type: "object", required: Set(["id", "state", "streams", "type"]), properties: ["detailsDeferred": RemoteSchemas.schema_d2dd3595e1b5e5dc, "id": RemoteSchemas.schema_36fea325bf1aca70, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "state": RemoteSchemas.schema_2472eab79ad4b307, "streams": RemoteSchemas.schema_e51d77fd6734b53a, "type": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_902ee7904a410968 = RemoteSchema(type: "string", literals: [.string("page"), .string("inventory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9040d7586304950d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_9d4f8a22a3e1fa05, RemoteSchemas.schema_0b5555e2ca059ee2, RemoteSchemas.schema_72a4809a8d48dab8, RemoteSchemas.schema_feff20c88bde0c4c, RemoteSchemas.schema_ca98effeead73f13, RemoteSchemas.schema_596b826e9125183e, RemoteSchemas.schema_dfbf83bd7409c8d7, RemoteSchemas.schema_861b7e521ad93c4b, RemoteSchemas.schema_3935a65be87f52c2, RemoteSchemas.schema_14f3c332d545bff0, RemoteSchemas.schema_fd4fd2eb416ae002], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_904af6fabc0dbf35 = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_85c1db78d5c7dc29, "team": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9063020a6c5ad8b3 = RemoteSchema(type: "string", literals: [.string("navigate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9108deb639290751 = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_281d24bbbaa46745, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "questionAnswer": RemoteSchemas.schema_4d59c815dfec80c4, "segments": RemoteSchemas.schema_4392338ffc80bed7, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91181085efd88304 = RemoteSchema(type: "array", maxItems: 24, items: RemoteSchemas.schema_261c25778789d884, unknownPolicy: .strip)
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
  static let schema_91a5d2d349991a6a = RemoteSchema(type: "string", literals: [.string("cumulative"), .string("per-call")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91b38b813d4e4091 = RemoteSchema(type: "string", literals: [.string("unsupported")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91dcfb42aac98166 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_0174a8d738e73980, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_920e2e5db293bc41 = RemoteSchema(type: "object", required: Set(["fastForward", "merged"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "conflicting": RemoteSchemas.schema_feeb8bb50144d96d, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastForward": RemoteSchemas.schema_feeb8bb50144d96d, "merged": RemoteSchemas.schema_feeb8bb50144d96d, "needsStash": RemoteSchemas.schema_feeb8bb50144d96d, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashCommit": RemoteSchemas.schema_bf0b727f7b1c6d07, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_921834989f2485e5 = RemoteSchema(type: "string", literals: [.string("openUrl")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_922ae6d8b34c9e29 = RemoteSchema(type: "object", required: Set(["activeWorktreePaths", "projectLocation"]), properties: ["activeWorktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_929ff57e1355048a = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_8d030d3e3d2256ff], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_92ee84dadabef210 = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_55bad6da24b769c6], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_938eaedae89e4e2f = RemoteSchema(type: "object", required: Set(["problem", "status"]), properties: ["problem": RemoteSchemas.schema_a663eabb01251186, "status": RemoteSchemas.schema_45cf23babef96be9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_939b432562853e88 = RemoteSchema(type: "object", required: Set(["expectedRevision"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_93bef3a552bf787e = RemoteSchema(type: "object", required: Set(["threadIds", "type"]), properties: ["threadIds": RemoteSchemas.schema_39d8d7cbf4384109, "type": RemoteSchemas.schema_25e47114d380c1fb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93cbcfd8dc76a545 = RemoteSchema(type: "object", required: Set(["currentValue", "id", "type"]), properties: ["category": RemoteSchemas.schema_bf0b727f7b1c6d07, "currentValue": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "role": RemoteSchemas.schema_09201de15f15ed50, "type": RemoteSchemas.schema_2c671d62fd5c98a8], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_94dda13e1cf59dea = RemoteSchema(type: "object", required: Set(["contextSize"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_94e04fb40cc1be58 = RemoteSchema(type: "object", required: Set(["branch", "path"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_94eb65eacab30b70 = RemoteSchema(type: "object", required: Set(["entries", "homePath", "parentPath", "path", "truncated"]), properties: ["entries": RemoteSchemas.schema_5da64eb8d698413e, "homePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "parentPath": RemoteSchemas.schema_2d0b6ec9f2b2decf, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9501e4a8a718d07b = RemoteSchema(type: "object", required: Set(["action", "id", "language", "model"]), properties: ["action": RemoteSchemas.schema_236e9131b013f10b, "id": RemoteSchemas.schema_d855999aed5e6438, "language": RemoteSchemas.schema_f4e43b71651c06ad, "model": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_953c573b196de65a = RemoteSchema(type: "string", literals: [.string("global"), .string("project-relative")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_956459f749459347 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["entryType": RemoteSchemas.schema_8d3732b59a0dd026, "limit": RemoteSchemas.schema_039b848cf1c1ad6c, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "query": RemoteSchemas.schema_38d1a07d3b9b1c82, "searchConfig": RemoteSchemas.schema_cbf78da83a6846d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_95bca512ea5c155a = RemoteSchema(type: "object", required: Set(["attempt", "conclusion", "createdAt", "event", "headBranch", "headSha", "id", "jobs", "name", "number", "startedAt", "status", "title", "updatedAt", "url", "workflowId", "workflowName"]), properties: ["attempt": RemoteSchemas.schema_3d06117798bf5171, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "event": RemoteSchemas.schema_bf0b727f7b1c6d07, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_3d06117798bf5171, "jobs": RemoteSchemas.schema_48de96c42130e156, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "number": RemoteSchemas.schema_3d06117798bf5171, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "workflowId": RemoteSchemas.schema_3d06117798bf5171, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_95d0adeb5b1f4c44 = RemoteSchema(type: "object", required: Set(["data", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_2cfe911595ad978d, "data": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_d8b225d7de9ceec5], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.output-data-utf16"])
}

public extension RemoteSchemas {
  static let schema_95e237e57720296e = RemoteSchema(type: "string", literals: [.string("agent-unavailable"), .string("worktree-unavailable"), .string("duplicate-project-watches")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_962b214fbc91a2f5 = RemoteSchema(type: "string", literals: [.string("pairing-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9633843f8b51827f = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "routing": RemoteSchemas.schema_fe73ac6ba621dd72], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_963874114b1e0922 = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation", "sessionRef", "threadId"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_96cd458fa9bae303 = RemoteSchema(type: "string", literals: [.string("set-workspace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9751de90fd8644d6 = RemoteSchema(type: "object", required: Set(["key", "label", "totals"]), properties: ["key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "totals": RemoteSchemas.schema_05af39c3e918ff5a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9780f521bc1dee38 = RemoteSchema(type: "string", literals: [.string("thread-events"), .string("thread-bytes"), .string("global-events"), .string("global-bytes"), .string("oversize"), .string("age"), .string("degraded"), .string("rebase-dropped"), .string("shutdown"), .string("unclean-epoch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97a2308a409b73af = RemoteSchema(type: "object", required: Set(["platform", "status"]), properties: ["diagnostic": RemoteSchemas.schema_d3abf2cfac530357, "platform": RemoteSchemas.schema_61e54b5f6751c7a6, "status": RemoteSchemas.schema_9ab386636c31e53c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97a8dc6944322187 = RemoteSchema(type: "object", properties: ["binary": RemoteSchemas.schema_c4f6ed0673387892, "npx": RemoteSchemas.schema_a987d8a0eb988f36, "uvx": RemoteSchemas.schema_a987d8a0eb988f36], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_98139abfca5e2eda = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c1d4a9f752e166b1, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98473b8b464036a4 = RemoteSchema(type: "object", required: Set(["agentKind", "cwdExists", "id", "path", "preview", "providerSessionId", "updatedAt"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_bf0b727f7b1c6d07, "cwdExists": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "model": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "preview": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerSessionId": RemoteSchemas.schema_36fea325bf1aca70, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98c9ef3e406d69bf = RemoteSchema(type: "object", required: Set(["deviceId", "platform"]), properties: ["activityTokens": RemoteSchemas.schema_b84e449d1a150abf, "alertPreferences": RemoteSchemas.schema_0534fb6201293569, "appVersion": RemoteSchemas.schema_36fea325bf1aca70, "deviceId": RemoteSchemas.schema_212ab189f2321de4, "deviceToken": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_41d0cf68976485ec, "pushToStartToken": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2, "webAppBasePath": RemoteSchemas.schema_25a3e0b2a9eecdfb, "webPushSubscription": RemoteSchemas.schema_fd8574a70c8187db], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["push.registration.platform-fields"])
}

public extension RemoteSchemas {
  static let schema_98d52bd55e800515 = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_137445efd1582c7a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98ef330d70f2e681 = RemoteSchema(type: "object", required: Set(["data", "version"]), properties: ["data": RemoteSchemas.schema_ca3d163bab055381, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98f590cc4ee5bfd9 = RemoteSchema(type: "string", literals: [.string("preparing"), .string("done"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_995ee3e349270afe = RemoteSchema(type: "string", literals: [.string("remote-reachable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_996ce1c4e0b82a8b = RemoteSchema(type: "object", required: Set(["delta", "itemId", "stream", "threadId", "type"]), properties: ["delta": RemoteSchemas.schema_bf0b727f7b1c6d07, "itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "replace": RemoteSchemas.schema_feeb8bb50144d96d, "stream": RemoteSchemas.schema_b5c1f44eaf04477b, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_f30731ffd8c57b5c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9980c767412d708b = RemoteSchema(type: "integer", minimum: 20.0, maximum: 400.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9997128f830ac42e = RemoteSchema(type: "object", required: Set(["cursor", "generation"]), properties: ["cursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_99cf08bb5da33962 = RemoteSchema(type: "object", required: Set(["activeWebSocketClients", "eventBufferEntries", "lastEventSeq"]), properties: ["activeWebSocketClients": RemoteSchemas.schema_56aa0e45cbdce0d0, "eventBufferEntries": RemoteSchemas.schema_56aa0e45cbdce0d0, "lastEventSeq": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9a8b3412f7d55317 = RemoteSchema(type: "string", literals: [.string("webrtc")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ab386636c31e53c = RemoteSchema(type: "string", literals: [.string("ready"), .string("unsupported_host"), .string("missing_sdk"), .string("missing_xcode"), .string("missing_idb"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9addfc34d28f29dc = RemoteSchema(type: "string", literals: [.string("browser"), .string("chrome"), .string("computer")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9b050dd4848ae8c2 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_304430ceb5560696, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9b963a4b704c492d = RemoteSchema(type: "object", required: Set(["expectedHeadSha", "prNumber", "projectLocation"]), properties: ["admin": RemoteSchemas.schema_f8b6dd8128e8bfe0, "expectedHeadSha": RemoteSchemas.schema_89303c6cbb3ecd9a, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "method": RemoteSchemas.schema_72373308389f2027, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ba1e93599d271dc = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bc1c08248602f5c = RemoteSchema(type: "string", minLength: 1, maxLength: 255, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9be4e34050076f08 = RemoteSchema(type: "object", required: Set(["autoUpdate", "browserPanel", "chromeBridge", "computerUse", "nativeSecrets", "osNotifications", "portForward", "ssh"]), properties: ["autoUpdate": RemoteSchemas.schema_f8b6dd8128e8bfe0, "browserPanel": RemoteSchemas.schema_f8b6dd8128e8bfe0, "chromeBridge": RemoteSchemas.schema_f8b6dd8128e8bfe0, "computerUse": RemoteSchemas.schema_f8b6dd8128e8bfe0, "nativeSecrets": RemoteSchemas.schema_f8b6dd8128e8bfe0, "osNotifications": RemoteSchemas.schema_f8b6dd8128e8bfe0, "portForward": RemoteSchemas.schema_f8b6dd8128e8bfe0, "ssh": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_9bf3994f2546a7d6 = RemoteSchema(type: "string", literals: [.string("install")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c01de6b080eca40 = RemoteSchema(type: "string", literals: [.string("merge"), .string("squash"), .string("rebase")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c44204b656290c2 = RemoteSchema(type: "object", required: Set(["default", "description", "envVar", "key", "label", "options", "type"]), properties: ["default": RemoteSchemas.schema_bf0b727f7b1c6d07, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "envVar": RemoteSchemas.schema_36fea325bf1aca70, "key": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_d0b10c04efa78c87, "platforms": RemoteSchemas.schema_0f732b9fceb2c6ac, "type": RemoteSchemas.schema_36b9fe91ec45bcd5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c8337f42f233534 = RemoteSchema(type: "string", literals: [.string("shared"), .string("poracode")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ca4aec6d46ade2e = RemoteSchema(type: "string", literals: [.string("view"), .string("control")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9cb900aa2dda44d0 = RemoteSchema(type: "object", required: Set(["baseCheckpointItemId", "checkpointItemId", "projectLocation", "threadId"]), properties: ["baseCheckpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ced215a757add76 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_209f7faf00cb863e, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d263023fc1dd3de = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1c58197f2405018b, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d4f8a22a3e1fa05 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_6f5fd1f7837ee8fe], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_9d72555063ba9bd7 = RemoteSchema(type: "string", literals: [.string("runtime.truncated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d9cbc9ed0e89822 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1c2823e73ee0c1dc, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9da23fadb81a50e3 = RemoteSchema(type: "object", required: Set(["message", "threadId", "type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "presentation": RemoteSchemas.schema_4886facc92937666, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a023928e20a71a47], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9dd9855628dd71ae = RemoteSchema(type: "object", required: Set(["chunkCount", "chunkIndex", "data", "fromCursor", "generation", "processState", "resumeServed", "terminalSize", "toCursor", "version", "watchId"]), properties: ["chunkCount": RemoteSchemas.schema_23e05d248383ea40, "chunkIndex": RemoteSchemas.schema_56aa0e45cbdce0d0, "data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_df704162f3d15808, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "resumeServed": RemoteSchemas.schema_feeb8bb50144d96d, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_f8ba039a2f32fad1, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.baseline-chunk-utf16"])
}

public extension RemoteSchemas {
  static let schema_9dee5b496693b179 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cdc63841ca583c5b, RemoteSchemas.schema_8ab3ef50febb54d1, RemoteSchemas.schema_0fd7e0ac403d7916], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9e169df36e4e41f6 = RemoteSchema(type: "object", required: Set(["key", "kind"]), properties: ["key": RemoteSchemas.schema_7df0b39f181cc45b, "kind": RemoteSchemas.schema_14221269d858a2f5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9e2c34c2585a7941 = RemoteSchema(type: "object", properties: ["native": RemoteSchemas.schema_e1b186e0802b07d2, "wsl": RemoteSchemas.schema_e374b6098906e936], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9e712b4f87e5beb0 = RemoteSchema(type: "string", literals: [.string("snapshot")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9e8cac9740f0f3da = RemoteSchema(type: "object", required: Set(["agents", "version"]), properties: ["agents": RemoteSchemas.schema_8e2e8bbf081abcf9, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ea58f9bfc61ade7 = RemoteSchema(type: "string", literals: [.string("light"), .string("dark"), .string("system")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9eaa25e68d8e4cf4 = RemoteSchema(type: "object", required: Set(["threadId", "type", "version", "watchId"]), properties: ["threadId": RemoteSchemas.schema_97d85a5eaee82b97, "type": RemoteSchemas.schema_9f6b436502c63c75, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}
