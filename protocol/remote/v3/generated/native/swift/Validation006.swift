// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_971eac5c1ec68beb = RemoteSchema(type: "array", items: RemoteSchemas.schema_839da5c7aa9ba993, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97d27c4efa52f52a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_fb3dd6021c9a98a4, RemoteSchemas.schema_9c44204b656290c2], unknownPolicy: .strip)
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
  static let schema_98c9ef3e406d69bf = RemoteSchema(type: "object", required: Set(["deviceId", "platform"]), properties: ["activityTokens": RemoteSchemas.schema_b84e449d1a150abf, "alertPreferences": RemoteSchemas.schema_0534fb6201293569, "appVersion": RemoteSchemas.schema_36fea325bf1aca70, "deviceId": RemoteSchemas.schema_212ab189f2321de4, "deviceToken": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_41d0cf68976485ec, "pushToStartToken": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2, "webAppBasePath": RemoteSchemas.schema_25a3e0b2a9eecdfb, "webPushSubscription": RemoteSchemas.schema_fd8574a70c8187db], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["push.registration.platform-fields"])
}

public extension RemoteSchemas {
  static let schema_995ee3e349270afe = RemoteSchema(type: "string", literals: [.string("remote-reachable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9980c767412d708b = RemoteSchema(type: "integer", minimum: 20.0, maximum: 400.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9997128f830ac42e = RemoteSchema(type: "object", required: Set(["cursor", "generation"]), properties: ["cursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9b83e18a93c4ec45 = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a799b0e11ed8f6df, "usage": RemoteSchemas.schema_0fce2ade0199ca1d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ba1e93599d271dc = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bb33af2f649fdd1 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_4cb4c9750289b975, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bc1c08248602f5c = RemoteSchema(type: "string", minLength: 1, maxLength: 255, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bdd26dd832b19ef = RemoteSchema(type: "object", required: Set(["kind", "patch", "projectId"]), properties: ["kind": RemoteSchemas.schema_cbc64d14585e9a92, "patch": RemoteSchemas.schema_cadb9042bbcd8536, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_9cb900aa2dda44d0 = RemoteSchema(type: "object", required: Set(["baseCheckpointItemId", "checkpointItemId", "projectLocation", "threadId"]), properties: ["baseCheckpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d263023fc1dd3de = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1c58197f2405018b, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d72555063ba9bd7 = RemoteSchema(type: "string", literals: [.string("runtime.truncated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d9cbc9ed0e89822 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1c2823e73ee0c1dc, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
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
  static let schema_9ec272a8244847ff = RemoteSchema(type: "object", required: Set(["key", "label"]), properties: ["key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9edd0cfb1cd802d2 = RemoteSchema(type: "object", required: Set(["abbreviatedOid", "authoredDate", "messageHeadline", "oid"]), properties: ["abbreviatedOid": RemoteSchemas.schema_bf0b727f7b1c6d07, "author": RemoteSchemas.schema_a99c73e81a312991, "authoredDate": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageBody": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageHeadline": RemoteSchemas.schema_bf0b727f7b1c6d07, "oid": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9eed5c4959909cfe = RemoteSchema(type: "string", literals: [.string("windows"), .string("wsl"), .string("posix")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f0c1cf2ffaa9f02 = RemoteSchema(type: "object", required: Set(["agentKind", "archived", "attention", "canResumeWithConfig", "config", "createdAt", "done", "id", "projectId", "starred", "status", "title", "updatedAt"]), properties: ["activeTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "archived": RemoteSchemas.schema_f8b6dd8128e8bfe0, "archivedAt": RemoteSchemas.schema_36fea325bf1aca70, "attention": RemoteSchemas.schema_58edfaf9f73b8db4, "canResumeWithConfig": RemoteSchemas.schema_f8b6dd8128e8bfe0, "config": RemoteSchemas.schema_023567f0898d4d6d, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "done": RemoteSchemas.schema_f8b6dd8128e8bfe0, "doneAt": RemoteSchemas.schema_36fea325bf1aca70, "errorMessage": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "lastTurnEndedAt": RemoteSchemas.schema_36fea325bf1aca70, "lastTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "sessionRef": RemoteSchemas.schema_3b70e9f118e13840, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "starred": RemoteSchemas.schema_f8b6dd8128e8bfe0, "status": RemoteSchemas.schema_8c61ed237d0ab3d0, "threadStatusSource": RemoteSchemas.schema_8f739487924008df, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f0df99b7a4b0249 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_1544bc59ff42b21c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f1da8cf549c341e = RemoteSchema(type: "object", required: Set(["additions", "baseBranch", "body", "changedFiles", "checks", "comments", "commits", "deletions", "headBranch", "number", "reviews", "title"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "author": RemoteSchemas.schema_a99c73e81a312991, "baseBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "changedFiles": RemoteSchemas.schema_3d06117798bf5171, "checks": RemoteSchemas.schema_3c115ff749c28304, "closedAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "comments": RemoteSchemas.schema_971eac5c1ec68beb, "commits": RemoteSchemas.schema_19cc91cdde8419f3, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "deletions": RemoteSchemas.schema_3d06117798bf5171, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "mergedAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "mergedBy": RemoteSchemas.schema_da37aeddd0e606ac, "number": RemoteSchemas.schema_23e05d248383ea40, "reviews": RemoteSchemas.schema_1fc25f3569e514e5, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f1edfda198d533d = RemoteSchema(type: "string", literals: [.string("git-state-interests")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f20fb68ee791598 = RemoteSchema(type: "string", literals: [.string("turn.started")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9fe1fe9bbcff3ecd = RemoteSchema(type: "object", required: Set(["count", "key", "label", "percent"]), properties: ["count": RemoteSchemas.schema_80c415b6e27c6ebd, "key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "percent": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9fef93fbe5070566 = RemoteSchema(type: "string", literals: [.string("session-5h"), .string("weekly"), .string("weekly-opus"), .string("weekly-sonnet"), .string("weekly-fable"), .string("monthly"), .string("extra-usage"), .string("cursor-auto"), .string("cursor-api")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ff1236d4782edc7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c04b1452d18edb3f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a023928e20a71a47 = RemoteSchema(type: "string", literals: [.string("warning")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a02c812507215fb8 = RemoteSchema(type: "object", required: Set(["destinationScope", "mode", "sourcePath"]), properties: ["availability": RemoteSchemas.schema_9c8337f42f233534, "destinationScope": RemoteSchemas.schema_ac6ea0fc110d7efb, "mode": RemoteSchemas.schema_aa2d0958d3ec845a, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "replace": RemoteSchemas.schema_f8b6dd8128e8bfe0, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "sourceProjectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceWslDistro": RemoteSchemas.schema_36fea325bf1aca70, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a087b069daed224f = RemoteSchema(type: "object", required: Set(["destination", "kind", "serverId", "source"]), properties: ["destination": RemoteSchemas.schema_dc99757951407418, "kind": RemoteSchemas.schema_a77c8545896b4c52, "serverId": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_dc99757951407418], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a0f4181c86e6e608 = RemoteSchema(type: "object", required: Set(["agentKind", "model"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "approvalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "browserMcp": RemoteSchemas.schema_feeb8bb50144d96d, "chromeMcp": RemoteSchemas.schema_feeb8bb50144d96d, "computerUse": RemoteSchemas.schema_feeb8bb50144d96d, "contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "crossagentMcp": RemoteSchemas.schema_feeb8bb50144d96d, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "executionEnvironment": RemoteSchemas.schema_4cd2587996458d8d, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "mode": RemoteSchemas.schema_01e21946e943d3eb, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "thinking": RemoteSchemas.schema_feeb8bb50144d96d, "worktreeMode": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a1f40266b6e1acfa = RemoteSchema(type: "string", literals: [.string("prepare-worktree")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a20681cb358b7044 = RemoteSchema(type: "object", required: Set(["project", "pullRequestKeys", "refreshedAt"]), properties: ["project": RemoteSchemas.schema_83470ce63973b6e2, "pullRequestKeys": RemoteSchemas.schema_0f732b9fceb2c6ac, "refreshedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "viewerLogin": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a26f77dd4ad13e5b = RemoteSchema(type: "object", required: Set(["targetPort"]), properties: ["targetPort": RemoteSchemas.schema_279eee1efa9da6c8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a399fbc7541223f3 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_5ea95607826c2d23, RemoteSchemas.schema_12ca2594dca47145, RemoteSchemas.schema_43372628accc1dd8, RemoteSchemas.schema_0e036ef4dad9c975, RemoteSchemas.schema_849e43bfc063f1bb, RemoteSchemas.schema_501221cdcb9cd48b, RemoteSchemas.schema_1806ffb1da5fcacb], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a39dd0410456fe31 = RemoteSchema(type: "object", required: Set(["balance"]), properties: ["balance": RemoteSchemas.schema_80c415b6e27c6ebd, "currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "unlimited": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a4457c545e0e0489 = RemoteSchema(type: "object", required: Set(["baseBranch", "isDraft", "number", "state", "title", "updatedAt", "url"]), properties: ["baseBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "checksStatus": RemoteSchemas.schema_bf0b727f7b1c6d07, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "isDraft": RemoteSchemas.schema_feeb8bb50144d96d, "mergeStateStatus": RemoteSchemas.schema_ecf46d016507c672, "mergeable": RemoteSchemas.schema_05ab37f667d37cfc, "number": RemoteSchemas.schema_23e05d248383ea40, "reviewDecision": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_79fd49e14d0e7e17, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "viewerDidAuthor": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a44865d83be28e9f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_36fea325bf1aca70, RemoteSchemas.schema_80c415b6e27c6ebd], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a467b0ed1c0ea208 = RemoteSchema(type: "object", required: Set(["kind", "minute"]), properties: ["kind": RemoteSchemas.schema_6f5933af0336650b, "minute": RemoteSchemas.schema_53f3c1938556e280], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a581e67cd137ad59 = RemoteSchema(type: "number", minimum: 0.0, maximum: 100.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a59d7f7afd3350b1 = RemoteSchema(type: "object", required: Set(["id", "label"]), properties: ["description": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "tooltipDescription": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a5b7c88e398574a5 = RemoteSchema(type: "string", literals: [.string("agent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a656e9f9963686f0 = RemoteSchema(type: "object", required: Set(["groupId", "groupName", "kind"]), properties: ["groupId": RemoteSchemas.schema_36fea325bf1aca70, "groupName": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_f399af5f8dcf6035], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a66324f9a46c480b = RemoteSchema(type: "object", required: Set(["headers", "type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_3120d80990432c9a, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_a6940e107dbdb450 = RemoteSchema(type: "object", required: Set(["fwt"]), properties: ["fwt": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a6ba34cd39bf30c5 = RemoteSchema(type: "boolean", defaultValue: .bool(true), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a6d4c4f03b250194 = RemoteSchema(type: "object", required: Set(["canLinkToGlobal", "effectiveSkillIds", "invocation", "issues", "skills"]), properties: ["canLinkToGlobal": RemoteSchemas.schema_feeb8bb50144d96d, "effectiveSkillIds": RemoteSchemas.schema_0f732b9fceb2c6ac, "invocation": RemoteSchemas.schema_7a20e2f82d6f16d6, "issues": RemoteSchemas.schema_ee5346688873f70f, "skills": RemoteSchemas.schema_bcd368b2fa9950b0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a6f98c7f485db267 = RemoteSchema(type: "object", required: Set(["projectLocation", "worktreePaths"]), properties: ["detail": RemoteSchemas.schema_15cae388d0cdd5b6, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "worktreePaths": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a7161d7f6314fa68 = RemoteSchema(type: "object", properties: ["browserForward": RemoteSchemas.schema_a9266ff57466f267, "pushRouting": RemoteSchemas.schema_a9266ff57466f267, "terminalCursorSync": RemoteSchemas.schema_a9266ff57466f267], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a77c8545896b4c52 = RemoteSchema(type: "string", literals: [.string("move")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a799b0e11ed8f6df = RemoteSchema(type: "string", literals: [.string("usage.spent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8dfb6388d9edb75 = RemoteSchema(type: "object", required: Set(["pulled", "pushed"]), properties: ["pulled": RemoteSchemas.schema_feeb8bb50144d96d, "pushed": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a90fffdae1680bd2 = RemoteSchema(type: "object", required: Set(["clientConnectionId", "desktopId", "version"]), properties: ["clientConnectionId": RemoteSchemas.schema_53996e5a27a5b0c4, "desktopId": RemoteSchemas.schema_c7e9848de3a346ed, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a9266ff57466f267 = RemoteSchema(type: "object", required: Set(["versions"]), properties: ["versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a93ba7bf23f9b121 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_c7bfc39efc965eed], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a99c73e81a312991 = RemoteSchema(type: "object", required: Set(["login"]), properties: ["avatarUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "login": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a9e065ca182491e5 = RemoteSchema(type: "string", literals: [.string("set-done")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aa2d0958d3ec845a = RemoteSchema(type: "string", literals: [.string("copy"), .string("link")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aac2a4e83d2823be = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aaf42afe3bc86594 = RemoteSchema(type: "string", literals: [.string("env_var")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aafa8395560c3ea5 = RemoteSchema(type: "string", literals: [.string("never"), .string("running"), .string("succeeded"), .string("failed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ab08aad343958c81 = RemoteSchema(type: "object", required: Set(["data", "fromCursor", "generation", "processState", "status", "terminalSize", "toCursor"]), properties: ["data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_df704162f3d15808, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "status": RemoteSchemas.schema_0200f968d21b338b, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.ready-range-utf16"])
}

public extension RemoteSchemas {
  static let schema_ab5271048956dc05 = RemoteSchema(type: "string", literals: [.string("item.completed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ab58da84eaa66434 = RemoteSchema(type: "object", required: Set(["id", "label", "usedPercent"]), properties: ["currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_7be168d0c02a30f1, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "limit": RemoteSchemas.schema_f696f11685898ba7, "resetsAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "unit": RemoteSchemas.schema_c263982707afed92, "used": RemoteSchemas.schema_f696f11685898ba7, "usedPercent": RemoteSchemas.schema_a581e67cd137ad59], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ab6b873225f5c96a = RemoteSchema(type: "string", literals: [.string("browser-mirror-status")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aba5d69bfdbd30c9 = RemoteSchema(type: "object", required: Set(["baseModifiedAtMs", "content", "path", "projectLocation"]), properties: ["baseModifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "content": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ac6ea0fc110d7efb = RemoteSchema(type: "string", literals: [.string("global"), .string("project")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aca97eda78815baa = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_b2a9cad3f0f3b617, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_acf85c3d3b25a389 = RemoteSchema(type: "array", items: RemoteSchemas.schema_01e21946e943d3eb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ad1d9fe8b3eda038 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e2d96ee09e9d99a2, RemoteSchemas.schema_d95fd60152159d7a, RemoteSchemas.schema_591e7e71be40d4d4], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ae00c10b95f24c44 = RemoteSchema(type: "object", properties: ["brew": RemoteSchemas.schema_36fea325bf1aca70, "builtIn": RemoteSchemas.schema_685dee710cb094fd, "homebrewCask": RemoteSchemas.schema_36fea325bf1aca70, "installer": RemoteSchemas.schema_540ab9236f8c36ab, "latestVersionUrls": RemoteSchemas.schema_c2e8606952666d2c, "npm": RemoteSchemas.schema_36fea325bf1aca70, "verifyBuiltInVersionChange": RemoteSchemas.schema_feeb8bb50144d96d, "winget": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ae26bc52b712b00c = RemoteSchema(type: "string", literals: [.string("7d"), .string("30d"), .string("all")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_af6b6f72d4304b97 = RemoteSchema(type: "string", literals: [.string("terminal-unwatch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_af9e7187ee39d2c1 = RemoteSchema(type: "object", required: Set(["message", "path", "providerId"]), properties: ["message": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "providerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b01e26e0438140cd = RemoteSchema(type: "object", required: Set(["kind", "projectId", "worktreePath"]), properties: ["kind": RemoteSchemas.schema_a1f40266b6e1acfa, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b03238f5530b04fb = RemoteSchema(type: "object", required: Set(["projectLocation", "shellId"]), properties: ["initialSize": RemoteSchemas.schema_55ee222c096690dc, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "shellId": RemoteSchemas.schema_36fea325bf1aca70, "startInHome": RemoteSchemas.schema_feeb8bb50144d96d, "windowsShellRuntime": RemoteSchemas.schema_9368b22ce42bb60e, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b096158c792e0431 = RemoteSchema(type: "string", literals: [.string("skill"), .string("subagent"), .string("tool"), .string("mcp")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b09b259cd2bbc25d = RemoteSchema(type: "object", properties: ["slashCommands": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b160fc20dd335dc3 = RemoteSchema(type: "string", literals: [.string("workspace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2a9cad3f0f3b617 = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "isRepo", "pr", "totalDeletions", "totalInsertions"]), properties: ["ahead": RemoteSchemas.schema_56aa0e45cbdce0d0, "behind": RemoteSchemas.schema_56aa0e45cbdce0d0, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "isRepo": RemoteSchemas.schema_feeb8bb50144d96d, "pr": RemoteSchemas.schema_9d263023fc1dd3de, "totalDeletions": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalInsertions": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b305c5dcc2d06cc2 = RemoteSchema(type: "string", pattern: "^gemini:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4a8e17084bc4fba = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b50a220194f2fc5b = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_023567f0898d4d6d, "numTurns": RemoteSchemas.schema_56aa0e45cbdce0d0, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5c1f44eaf04477b = RemoteSchema(type: "string", literals: [.string("assistant_text"), .string("reasoning_text"), .string("plan_text"), .string("command_output"), .string("file_change_output")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5c2da7c663c997c = RemoteSchema(type: "object", properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_79608b5eceb792fe, "enabledMcpServers": RemoteSchemas.schema_cda18ebe4af54c5c, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "usage": RemoteSchemas.schema_b6aaa17d322b8355, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5e66c2e9667a210 = RemoteSchema(type: "string", literals: [.string("bearer-access-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b61004d40d3caef8 = RemoteSchema(type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6aaa17d322b8355 = RemoteSchema(type: "object", properties: ["autoRefresh": RemoteSchemas.schema_a6ba34cd39bf30c5, "collapsedProviders": RemoteSchemas.schema_aac2a4e83d2823be, "disabledProviders": RemoteSchemas.schema_aac2a4e83d2823be, "providerOrder": RemoteSchemas.schema_aac2a4e83d2823be, "providerRefreshIntervals": RemoteSchemas.schema_ea08f63f22aa2011, "refreshIntervalMinutes": RemoteSchemas.schema_ea193ab85993872c, "selectedRingGroups": RemoteSchemas.schema_c3ac2139868061bb, "showEstimatedCost": RemoteSchemas.schema_f8b6dd8128e8bfe0, "showInSidebar": RemoteSchemas.schema_a6ba34cd39bf30c5, "sidebarHiddenProviders": RemoteSchemas.schema_aac2a4e83d2823be], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b79d8f64de4f41bd = RemoteSchema(type: "object", required: Set(["kind", "worktreePath"]), properties: ["isNewWorktree": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_49f72e8cc565067e, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b7ac3adaa07b7aa4 = RemoteSchema(type: "string", literals: [.string("session.started")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b7c373d0981a5441 = RemoteSchema(type: "null", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b7cd3e9a86b1e5d2 = RemoteSchema(type: "object", required: Set(["authState", "capabilities", "installed", "kind", "label"]), properties: ["acpSessionEstablished": RemoteSchemas.schema_feeb8bb50144d96d, "authLogoutSupported": RemoteSchemas.schema_feeb8bb50144d96d, "authMethods": RemoteSchemas.schema_cd0a57f27ae4fccb, "authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "capabilities": RemoteSchemas.schema_487902ea64ce9d48, "envDistro": RemoteSchemas.schema_bf0b727f7b1c6d07, "envKind": RemoteSchemas.schema_9eed5c4959909cfe, "executablePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "loginCommand": RemoteSchemas.schema_36fea325bf1aca70, "loginCommandDisplay": RemoteSchemas.schema_36fea325bf1aca70, "preferTerminalLogin": RemoteSchemas.schema_feeb8bb50144d96d, "presentationAuthStates": RemoteSchemas.schema_678d084ee287670a, "presentationAuthUsesProviderLogin": RemoteSchemas.schema_473e9b7f4728cf72, "providerMetadata": RemoteSchemas.schema_197c2b8c01d7f4ed, "runtimeVariants": RemoteSchemas.schema_0c1dc124fd8a964e, "sessionRuntimeRouting": RemoteSchemas.schema_d221b1853eb0ef37, "update": RemoteSchemas.schema_ae00c10b95f24c44, "version": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b7f9b9a51ee842c4 = RemoteSchema(type: "string", literals: [.string("prompts"), .string("tokens")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b84e449d1a150abf = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_36fea325bf1aca70, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b89c357946c21293 = RemoteSchema(type: "string", minLength: 1, maxLength: 120, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_b92447920382853b = RemoteSchema(type: "object", required: Set(["providerId", "providerLabel", "servers", "sourcePath"]), properties: ["providerId": RemoteSchemas.schema_36fea325bf1aca70, "providerLabel": RemoteSchemas.schema_36fea325bf1aca70, "servers": RemoteSchemas.schema_409712bfaed84392, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b99ee3af304513c2 = RemoteSchema(type: "string", literals: [.string("device"), .string("all")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b9d24da8425fcc77 = RemoteSchema(type: "object", required: Set(["code", "retryable", "status"]), properties: ["code": RemoteSchemas.schema_c8425979fd5d4887, "reason": RemoteSchemas.schema_36fea325bf1aca70, "retryable": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b9dfb5a053707da9 = RemoteSchema(type: "object", required: Set(["expiresAt", "ticket"]), properties: ["expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_badd682f3501e022 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_baebb62c82c3979f = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_97f51a15a8f553b2, "terminal": RemoteSchemas.schema_97f51a15a8f553b2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb2e0e6d90c93ccf = RemoteSchema(type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb3534fed407525e = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "prompt"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_023567f0898d4d6d, "focus": RemoteSchemas.schema_feeb8bb50144d96d, "groupId": RemoteSchemas.schema_36fea325bf1aca70, "groupName": RemoteSchemas.schema_36fea325bf1aca70, "isNewWorktree": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_60fc988aefaed4f5, "launchRuntime": RemoteSchemas.schema_feeb8bb50144d96d, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "segments": RemoteSchemas.schema_4392338ffc80bed7, "title": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb3cd72cf9e1b0cc = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_4d34acc64dd77a5d, "result": RemoteSchemas.schema_bea1bdef18933d97], additionalAllowed: true, unknownPolicy: .strip)
}
