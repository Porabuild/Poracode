// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_9fe1fe9bbcff3ecd = RemoteSchema(type: "object", required: Set(["count", "key", "label", "percent"]), properties: ["count": RemoteSchemas.schema_80c415b6e27c6ebd, "key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "percent": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9fed07fec8050182 = RemoteSchema(type: "string", literals: [.string("user_message"), .string("assistant_message"), .string("reasoning"), .string("plan"), .string("goal"), .string("command_execution"), .string("file_change"), .string("tool_call"), .string("mcp_tool_call"), .string("image_view"), .string("dynamic_tool_call"), .string("web_search"), .string("question_answer"), .string("error")], unknownPolicy: .strip)
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
  static let schema_a1f40266b6e1acfa = RemoteSchema(type: "string", literals: [.string("prepare-worktree")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a20681cb358b7044 = RemoteSchema(type: "object", required: Set(["project", "pullRequestKeys", "refreshedAt"]), properties: ["project": RemoteSchemas.schema_83470ce63973b6e2, "pullRequestKeys": RemoteSchemas.schema_0f732b9fceb2c6ac, "refreshedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "viewerLogin": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a26f77dd4ad13e5b = RemoteSchema(type: "object", required: Set(["targetPort"]), properties: ["targetPort": RemoteSchemas.schema_279eee1efa9da6c8], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_a77c8545896b4c52 = RemoteSchema(type: "string", literals: [.string("move")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a799b0e11ed8f6df = RemoteSchema(type: "string", literals: [.string("usage.spent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a7af012dd26c2f45 = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_3252cdd51930a222, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_07971608588bb2db], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a85bbc4abd9b5411 = RemoteSchema(type: "array", items: RemoteSchemas.schema_99d0ed7b003eaf52, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a87d1660d66bace7 = RemoteSchema(type: "object", required: Set(["events"]), properties: ["events": RemoteSchemas.schema_ab79b5853d26c3e7], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_aa2e4a946a9060bf = RemoteSchema(type: "object", required: Set(["agentKind", "config", "enabled", "name", "prompt", "recurrence"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_048d1517dd77004e, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_b89c357946c21293, "projectId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prompt": RemoteSchemas.schema_30cc89214bd9dffb, "recurrence": RemoteSchemas.schema_d8fa37f0ae821721], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_ab79b5853d26c3e7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c6773b11bd57a846, unknownPolicy: .strip)
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
  static let schema_ad47ba9b42ffac44 = RemoteSchema(type: "object", required: Set(["completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"]), properties: ["completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "runtimeItems": RemoteSchemas.schema_d3749f0d30f56447, "runtimeNextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalScrollback": RemoteSchemas.schema_bf0b727f7b1c6d07, "terminalSize": RemoteSchemas.schema_55ee222c096690dc, "thread": RemoteSchemas.schema_85fe4f2f372c1ac3, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b096158c792e0431 = RemoteSchema(type: "string", literals: [.string("skill"), .string("subagent"), .string("tool"), .string("mcp")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b0c6bfbd3c01430a = RemoteSchema(type: "object", required: Set(["completedAt", "error", "id", "scheduleId", "startedAt", "status", "summary", "threadId"]), properties: ["completedAt": RemoteSchemas.schema_01f7df3e67448982, "error": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_d855999aed5e6438, "scheduleId": RemoteSchemas.schema_d855999aed5e6438, "startedAt": RemoteSchemas.schema_7ba6d49874a01b9e, "status": RemoteSchemas.schema_d21b71d44dcb47ab, "summary": RemoteSchemas.schema_2d0b6ec9f2b2decf, "threadId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b12a7fe10e067771 = RemoteSchema(type: "object", required: Set(["kind", "runAt"]), properties: ["kind": RemoteSchemas.schema_e5ee0a072228c0a3, "runAt": RemoteSchemas.schema_7ba6d49874a01b9e], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b3925744a8258fb7 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_9bb33af2f649fdd1, RemoteSchemas.schema_2b7595c3da8bc0e9, RemoteSchemas.schema_da66851500474562, RemoteSchemas.schema_4c08f56d9358b723, RemoteSchemas.schema_27aa97567424846c, RemoteSchemas.schema_37addcca5b32752c], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b3a47e8838c4a831 = RemoteSchema(type: "object", properties: ["approvalPolicies": RemoteSchemas.schema_d0b10c04efa78c87, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_515482d2104d1efa, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_cb81a9dbb81a1a63, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_e163a1a22234ae4f, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_d0b10c04efa78c87, "modes": RemoteSchemas.schema_acf85c3d3b25a389, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_d0b10c04efa78c87, "settingDefs": RemoteSchemas.schema_113b6f36094df840, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4a8e17084bc4fba = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
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
  static let schema_b9dfb5a053707da9 = RemoteSchema(type: "object", required: Set(["expiresAt", "ticket"]), properties: ["expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_badd682f3501e022 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb2e0e6d90c93ccf = RemoteSchema(type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb3cd72cf9e1b0cc = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_4d34acc64dd77a5d, "result": RemoteSchemas.schema_bea1bdef18933d97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb42560f34ae61e9 = RemoteSchema(type: "object", required: Set(["count", "label", "type"]), properties: ["count": RemoteSchemas.schema_56aa0e45cbdce0d0, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "topModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "topProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_645d18fd9a611f68], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc01786c116784f4 = RemoteSchema(type: "object", required: Set(["projectLocation", "runId"]), properties: ["failedOnly": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "runId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc6c91ba1621863d = RemoteSchema(type: "object", required: Set(["active", "host", "login"]), properties: ["active": RemoteSchemas.schema_feeb8bb50144d96d, "host": RemoteSchemas.schema_bf0b727f7b1c6d07, "login": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc731d8f39fdb4bc = RemoteSchema(type: "object", required: Set(["path", "status"]), properties: ["oldPath": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc92ea89e2de4f6a = RemoteSchema(type: "object", required: Set(["doc", "projectId", "todos", "updatedAt"]), properties: ["doc": RemoteSchemas.schema_6e4ad578250cef79, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "todos": RemoteSchemas.schema_e7c244bd461f7229, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bcd368b2fa9950b0 = RemoteSchema(type: "array", items: RemoteSchemas.schema_e5fb86c01876b803, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bcfa7bac51229113 = RemoteSchema(type: "array", items: RemoteSchemas.schema_b0c6bfbd3c01430a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bcff7a89192b7e6a = RemoteSchema(type: "object", required: Set(["runs"]), properties: ["runs": RemoteSchemas.schema_150828825a4ec4d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd136ee4bcce8b07 = RemoteSchema(type: "string", literals: [.string("downloading")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd23acb1d60bc91b = RemoteSchema(type: "object", required: Set(["state", "type"]), properties: ["state": RemoteSchemas.schema_ecc6edb6166acda9, "type": RemoteSchemas.schema_47e02a8368712956], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd2deb493c08ce37 = RemoteSchema(type: "object", required: Set(["description", "title"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd96f28e94e5dff9 = RemoteSchema(type: "string", literals: [.string("redirect")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bdadccb73a92373f = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bfc0c020a52f85b3, "setUpstream": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bdb4eecbb625c500 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c073582d4fa79e4e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_be268483fb86810f = RemoteSchema(type: "integer", minimum: 1.0, maximum: 500.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bea1bdef18933d97 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_d92866345cd97821, RemoteSchemas.schema_8ace86d01d0cc126, RemoteSchemas.schema_2a43ea36a62fa6ac], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf0b727f7b1c6d07 = RemoteSchema(type: "string", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf3a4ed0e5798352 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7a4831c3c01cfb91, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bfc0c020a52f85b3 = RemoteSchema(type: "string", defaultValue: .string("origin"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c04b1452d18edb3f = RemoteSchema(type: "object", required: Set(["id", "name", "transport"]), properties: ["description": RemoteSchemas.schema_38d1a07d3b9b1c82, "disabledTools": RemoteSchemas.schema_515482d2104d1efa, "enabled": RemoteSchemas.schema_a6ba34cd39bf30c5, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_1da6db5f13bd36e1, "transport": RemoteSchemas.schema_0e40f389d72655d0], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.reserved-name"])
}

public extension RemoteSchemas {
  static let schema_c05447d902cc13c5 = RemoteSchema(type: "object", required: Set(["accounts", "available", "device", "generatedAt", "lifetimeTokens", "models", "peakDayTokens", "providers", "scope", "timezoneOffsetMinutes", "tokenHeatmap", "unavailableProviders", "windowDays"]), properties: ["accounts": RemoteSchemas.schema_d0fa817300598095, "available": RemoteSchemas.schema_feeb8bb50144d96d, "device": RemoteSchemas.schema_26f96950d20651b3, "generatedAt": RemoteSchemas.schema_3d06117798bf5171, "lifetimeTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "models": RemoteSchemas.schema_195974ed118a4217, "peakDay": RemoteSchemas.schema_bf0b727f7b1c6d07, "peakDayTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "providers": RemoteSchemas.schema_d0fa817300598095, "scope": RemoteSchemas.schema_b99ee3af304513c2, "timezoneOffsetMinutes": RemoteSchemas.schema_3d06117798bf5171, "tokenHeatmap": RemoteSchemas.schema_c1094a243b47f83c, "unavailableProviders": RemoteSchemas.schema_0f732b9fceb2c6ac, "windowDays": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c0551fbf082fff0f = RemoteSchema(type: "string", literals: [.string("approve"), .string("request-changes"), .string("comment")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c073582d4fa79e4e = RemoteSchema(type: "object", required: Set(["name", "path", "type"]), properties: ["hasChildren": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c086073e61ba1068 = RemoteSchema(type: "string", literals: [.string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1094a243b47f83c = RemoteSchema(type: "object", required: Set(["cells", "max", "metric", "windowDays"]), properties: ["cells": RemoteSchemas.schema_08654ec33ed5db02, "max": RemoteSchemas.schema_56aa0e45cbdce0d0, "metric": RemoteSchemas.schema_b7f9b9a51ee842c4, "windowDays": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1417bffe520aa1c = RemoteSchema(type: "object", properties: ["mcpServers": RemoteSchemas.schema_86b938ce61c1942e], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_c263982707afed92 = RemoteSchema(type: "string", literals: [.string("percent"), .string("tokens"), .string("requests"), .string("credits"), .string("usd")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2894654f12fb350 = RemoteSchema(type: "string", literals: [.string("browser-frame")], unknownPolicy: .strip)
}
