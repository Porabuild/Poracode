// GENERATED FILE. Do not edit by hand.
import Foundation
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
  static let schema_a5af9fa380f11a11 = RemoteSchema(type: "string", maxLength: 2048, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a5b7c88e398574a5 = RemoteSchema(type: "string", literals: [.string("agent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a633f9a256d1d0c9 = RemoteSchema(type: "object", required: Set(["reason", "seq", "type"]), properties: ["reason": RemoteSchemas.schema_36fea325bf1aca70, "seq": RemoteSchemas.schema_56aa0e45cbdce0d0, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_d9640543f6c97ed9], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_a6c274420d82c814 = RemoteSchema(type: "array", maxItems: 2, items: RemoteSchemas.schema_97a2308a409b73af, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a6f98c7f485db267 = RemoteSchema(type: "object", required: Set(["projectLocation", "worktreePaths"]), properties: ["detail": RemoteSchemas.schema_15cae388d0cdd5b6, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "worktreePaths": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a76106fec07f8e2b = RemoteSchema(type: "string", literals: [.string("read"), .string("appearance"), .string("textSize"), .string("orientation"), .string("reduceMotion"), .string("network"), .string("location"), .string("permission"), .string("openUrl"), .string("launchApp"), .string("powerOff")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a77c8545896b4c52 = RemoteSchema(type: "string", literals: [.string("move")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a799b0e11ed8f6df = RemoteSchema(type: "string", literals: [.string("usage.spent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8565e7811b17010 = RemoteSchema(type: "string", literals: [.string("h264")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8b4490d4a4f6745 = RemoteSchema(type: "string", literals: [.string("pending"), .string("owned"), .string("removed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8dfb6388d9edb75 = RemoteSchema(type: "object", required: Set(["pulled", "pushed"]), properties: ["pulled": RemoteSchemas.schema_feeb8bb50144d96d, "pushed": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8eb5a0e025da439 = RemoteSchema(type: "object", required: Set(["agentKind", "presentationMode"]), properties: ["agentInstanceId": RemoteSchemas.schema_36fea325bf1aca70, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "presentationMode": RemoteSchemas.schema_6508684ba659826b], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_a8f9536c8e956810 = RemoteSchema(type: "array", items: RemoteSchemas.schema_2e2f445a742056c6, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a90fffdae1680bd2 = RemoteSchema(type: "object", required: Set(["clientConnectionId", "desktopId", "version"]), properties: ["clientConnectionId": RemoteSchemas.schema_53996e5a27a5b0c4, "desktopId": RemoteSchemas.schema_c7e9848de3a346ed, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a9266ff57466f267 = RemoteSchema(type: "object", required: Set(["versions"]), properties: ["versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a93427ae1fb25d32 = RemoteSchema(type: "object", required: Set(["kind", "targetThreadId"]), properties: ["kind": RemoteSchemas.schema_54e79a700cdcdd03, "targetThreadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_aa35b4044d2b1d2c = RemoteSchema(type: "object", required: Set(["childTicket"]), properties: ["childTicket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aa5449703b29a615 = RemoteSchema(type: "string", literals: [.string("never"), .string("running"), .string("waiting-for-approval"), .string("succeeded"), .string("failed"), .string("cancelled"), .string("interrupted"), .string("skipped")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aac2a4e83d2823be = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aaf42afe3bc86594 = RemoteSchema(type: "string", literals: [.string("env_var")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aafcd63530265fa8 = RemoteSchema(type: "object", required: Set(["kind", "record", "revision"]), properties: ["kind": RemoteSchemas.schema_442f4438e0362260, "record": RemoteSchemas.schema_1be5ac91cc4357cb, "revision": RemoteSchemas.schema_36fea325bf1aca70, "rows": RemoteSchemas.schema_a16cb9740d19657e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ab08aad343958c81 = RemoteSchema(type: "object", required: Set(["data", "fromCursor", "generation", "processState", "status", "terminalSize", "toCursor"]), properties: ["data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_df704162f3d15808, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "status": RemoteSchemas.schema_0200f968d21b338b, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.ready-range-utf16"])
}

public extension RemoteSchemas {
  static let schema_ab5271048956dc05 = RemoteSchema(type: "string", literals: [.string("item.completed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ab6b873225f5c96a = RemoteSchema(type: "string", literals: [.string("browser-mirror-status")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ab9af0b233ebeb7d = RemoteSchema(type: "object", required: Set(["device", "inputAdmission", "proxyHelpers", "streamSettings", "url"]), properties: ["device": RemoteSchemas.schema_97d85a5eaee82b97, "inputAdmission": RemoteSchemas.schema_d2dd3595e1b5e5dc, "proxyHelpers": RemoteSchemas.schema_d2dd3595e1b5e5dc, "streamSettings": RemoteSchemas.schema_e0e12d4798687ab0, "url": RemoteSchemas.schema_833ba85e740a223b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aba5d69bfdbd30c9 = RemoteSchema(type: "object", required: Set(["baseModifiedAtMs", "content", "path", "projectLocation"]), properties: ["baseModifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "content": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_abcfe9be3ea6f135 = RemoteSchema(type: "object", required: Set(["initialDelaySeconds", "kind", "maxAttempts", "maxDelaySeconds"]), properties: ["initialDelaySeconds": RemoteSchemas.schema_e9f57f9b4751d6e1, "kind": RemoteSchemas.schema_1dff9447e3354b05, "maxAttempts": RemoteSchemas.schema_f7164d030c9bbeaf, "maxDelaySeconds": RemoteSchemas.schema_e9f57f9b4751d6e1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_abff99d05c43ad4c = RemoteSchema(type: "string", literals: [.string("enabled"), .string("disabled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ac157d37d82304b4 = RemoteSchema(type: "string", minLength: 1, maxLength: 240, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_ac6ea0fc110d7efb = RemoteSchema(type: "string", literals: [.string("global"), .string("project")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ac7865b2a567eb07 = RemoteSchema(type: "object", required: Set(["days", "kind", "time"]), properties: ["days": RemoteSchemas.schema_f7b2db2c4c7fbdd3, "kind": RemoteSchemas.schema_475f91db7d51b153, "time": RemoteSchemas.schema_b61004d40d3caef8, "timeZone": RemoteSchemas.schema_be5d5f9829abefd6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aca97eda78815baa = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_b2a9cad3f0f3b617, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_acccf296d86b4026 = RemoteSchema(type: "object", required: Set(["experiments", "revision"]), properties: ["experiments": RemoteSchemas.schema_2f3c74eaed971b9f, "revision": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_acf85c3d3b25a389 = RemoteSchema(type: "array", items: RemoteSchemas.schema_01e21946e943d3eb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ad1d9fe8b3eda038 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e2d96ee09e9d99a2, RemoteSchemas.schema_d95fd60152159d7a, RemoteSchemas.schema_591e7e71be40d4d4], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ad6bb2de51c0e05f = RemoteSchema(type: "object", required: Set(["amount", "currency"]), properties: ["amount": RemoteSchemas.schema_f696f11685898ba7, "currency": RemoteSchemas.schema_e22de6db69f83369], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ad717b46720997d8 = RemoteSchema(type: "object", required: Set(["activeThreadId", "autoMerge", "blockedReason", "headBranch", "lastCheckKey", "lastCommentCursor", "lastError", "lastReviewCommentCursor", "lastReviewCursor", "prNumber", "projectId", "watchEnabled"]), properties: ["activeThreadId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "blockedReason": RemoteSchemas.schema_7dccd2754fedc801, "config": RemoteSchemas.schema_f69100925fc0e774, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "lastCheckKey": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastError": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_ad7a7271b0f87095 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "project": RemoteSchemas.schema_3bac601a40e32bf3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_adaa80878b467841 = RemoteSchema(type: "object", required: Set(["effort"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_ae26bc52b712b00c = RemoteSchema(type: "string", literals: [.string("7d"), .string("30d"), .string("all")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ae3b637db050db2a = RemoteSchema(type: "array", items: RemoteSchemas.schema_1be1630ac362ee37, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ae4a7605815e4393 = RemoteSchema(type: "object", required: Set(["archivedAt", "changedFiles", "outcome", "severity", "stopReason", "summary", "unread"]), properties: ["archivedAt": RemoteSchemas.schema_595da89b21b7ca56, "changedFiles": RemoteSchemas.schema_3f02a5451ac550c4, "completionEvaluation": RemoteSchemas.schema_b2d5bb9fac49f2fc, "outcome": RemoteSchemas.schema_75fa28583d2c03c2, "severity": RemoteSchemas.schema_2d5efa5a796cb8bd, "stopReason": RemoteSchemas.schema_7bbdba78cb64cd5f, "summary": RemoteSchemas.schema_74b3a4e21747a253, "unread": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_af6b6f72d4304b97 = RemoteSchema(type: "string", literals: [.string("terminal-unwatch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_af9e7187ee39d2c1 = RemoteSchema(type: "object", required: Set(["message", "path", "providerId"]), properties: ["message": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "providerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_afbf6761fa459396 = RemoteSchema(type: "object", required: Set(["existingProjectIds", "existingThreadIds"]), properties: ["existingProjectIds": RemoteSchemas.schema_515482d2104d1efa, "existingThreadIds": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b01e26e0438140cd = RemoteSchema(type: "object", required: Set(["kind", "projectId", "worktreePath"]), properties: ["kind": RemoteSchemas.schema_a1f40266b6e1acfa, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b0304b9d9dfc2690 = RemoteSchema(type: "object", required: Set(["fromCache", "snapshots"]), properties: ["fromCache": RemoteSchemas.schema_feeb8bb50144d96d, "snapshots": RemoteSchemas.schema_c5a10234205e6cd2], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b23ca9582f16c4d7 = RemoteSchema(type: "object", properties: ["browserFocus": RemoteSchemas.schema_f9c97c26b130e744, "conversationSnapshot": RemoteSchemas.schema_8532cee498146283], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2a9cad3f0f3b617 = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "isRepo", "pr", "totalDeletions", "totalInsertions"]), properties: ["ahead": RemoteSchemas.schema_56aa0e45cbdce0d0, "behind": RemoteSchemas.schema_56aa0e45cbdce0d0, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "isRepo": RemoteSchemas.schema_feeb8bb50144d96d, "pr": RemoteSchemas.schema_9d263023fc1dd3de, "totalDeletions": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalInsertions": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2c8fd1712ed6830 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "projectId"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_f69100925fc0e774, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2ca36e3fa7743ad = RemoteSchema(type: "object", properties: ["maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "order": RemoteSchemas.schema_42146530bc4d74c4, "projectLimit": RemoteSchemas.schema_85b777c0c99bbbca, "reads": RemoteSchemas.schema_4659e6d395f41e16, "summaries": RemoteSchemas.schema_feeb8bb50144d96d, "threadLimit": RemoteSchemas.schema_85b777c0c99bbbca], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2d5bb9fac49f2fc = RemoteSchema(type: "object", required: Set(["condition", "confidence", "evaluatedAt", "reason", "stopMatched"]), properties: ["condition": RemoteSchemas.schema_5c6957eaa59e2ae2, "confidence": RemoteSchemas.schema_5d4b39004bf5c532, "evaluatedAt": RemoteSchemas.schema_38adcf16c79023ce, "reason": RemoteSchemas.schema_89c223893a706cf8, "stopMatched": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b305c5dcc2d06cc2 = RemoteSchema(type: "string", pattern: "^gemini:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b3edb6173f3ad581 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "initialSize", "projectLocation"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_2c97b9d429a794cb, "disabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "disabledBuiltInMcpTools": RemoteSchemas.schema_fdad254a8bac8914, "initialInstructions": RemoteSchemas.schema_36fea325bf1aca70, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "mcpServers": RemoteSchemas.schema_7f86e779ad379105, "mentionHandoff": RemoteSchemas.schema_d2dd3595e1b5e5dc, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_38d1a07d3b9b1c82, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "questionAnswer": RemoteSchemas.schema_a22ff042f4e542fc, "segments": RemoteSchemas.schema_4392338ffc80bed7, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["thread.start.provider-switch"])
}

public extension RemoteSchemas {
  static let schema_b3ef93117a9f9f95 = RemoteSchema(type: "string", literals: [.string("portrait"), .string("landscape_left"), .string("portrait_upside_down"), .string("landscape_right")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4441316f1aafac9 = RemoteSchema(type: "object", required: Set(["id", "labelKey", "options"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "labelKey": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_1d53b68fd3881a00], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4a8e17084bc4fba = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b53074e6b68baa67 = RemoteSchema(type: "object", required: Set(["contentType", "expiresAt", "modifiedAtMs", "sizeBytes", "ticket"]), properties: ["contentType": RemoteSchemas.schema_36fea325bf1aca70, "expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "sizeBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "ticket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b588ef57ebadea7a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4ec1d31e87eeb7a4, RemoteSchemas.schema_a93427ae1fb25d32], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5c1f44eaf04477b = RemoteSchema(type: "string", literals: [.string("assistant_text"), .string("reasoning_text"), .string("plan_text"), .string("command_output"), .string("file_change_output")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5e66c2e9667a210 = RemoteSchema(type: "string", literals: [.string("bearer-access-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b61004d40d3caef8 = RemoteSchema(type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6411354a37352f2 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_38754692c8b5ebef, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b664e76046bb1915 = RemoteSchema(type: "object", required: Set(["format", "text", "version"]), properties: ["format": RemoteSchemas.schema_f1ccd99fb2bc2c2f, "text": RemoteSchemas.schema_ee49ed668eec9d78, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b67f4828f001c119 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ca5f8d6782ca9f6b, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6a98d4e6efc4f4c = RemoteSchema(type: "string", literals: [.string("model"), .string("config")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6aaa17d322b8355 = RemoteSchema(type: "object", properties: ["autoRefresh": RemoteSchemas.schema_a6ba34cd39bf30c5, "collapsedProviders": RemoteSchemas.schema_aac2a4e83d2823be, "disabledProviders": RemoteSchemas.schema_aac2a4e83d2823be, "providerOrder": RemoteSchemas.schema_aac2a4e83d2823be, "providerRefreshIntervals": RemoteSchemas.schema_ea08f63f22aa2011, "refreshIntervalMinutes": RemoteSchemas.schema_ea193ab85993872c, "selectedRingGroups": RemoteSchemas.schema_c3ac2139868061bb, "showEstimatedCost": RemoteSchemas.schema_f8b6dd8128e8bfe0, "showInSidebar": RemoteSchemas.schema_a6ba34cd39bf30c5, "sidebarHiddenProviders": RemoteSchemas.schema_aac2a4e83d2823be], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6deccdc9f58eb02 = RemoteSchema(type: "object", required: Set(["events"]), properties: ["events": RemoteSchemas.schema_6227384f8fe3c509], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6f35acff2a3428a = RemoteSchema(type: "object", required: Set(["settings"]), properties: ["settings": RemoteSchemas.schema_5ce0ae73fb12b141], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b9d24da8425fcc77 = RemoteSchema(type: "object", required: Set(["code", "retryable", "status"]), properties: ["code": RemoteSchemas.schema_c8425979fd5d4887, "reason": RemoteSchemas.schema_36fea325bf1aca70, "retryable": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b9dfb5a053707da9 = RemoteSchema(type: "object", required: Set(["expiresAt", "ticket"]), properties: ["expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ba2bb9adae65c07b = RemoteSchema(type: "object", required: Set(["projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"]), properties: ["gitState": RemoteSchemas.schema_4331716fe2cf5702, "gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "projects": RemoteSchemas.schema_45dc1a0b166d686a, "projectsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "threads": RemoteSchemas.schema_1c7f79dcc0e5234b, "threadsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bab85ee50a59610a = RemoteSchema(type: "string", minLength: 3, maxLength: 255, pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", unknownPolicy: .strip)
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
  static let schema_bb479bc5848b9f45 = RemoteSchema(type: "string", literals: [.string("skip"), .string("coalesce"), .string("run-latest")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb755d8d8c6227a7 = RemoteSchema(type: "object", required: Set(["previewId"]), properties: ["device": RemoteSchemas.schema_97d85a5eaee82b97, "previewId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_bc1920595e8cfd89 = RemoteSchema(type: "object", required: Set(["schedules"]), properties: ["schedule": RemoteSchemas.schema_14f6b52f84064da4, "schedules": RemoteSchemas.schema_bc6010db82e83d09], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc6010db82e83d09 = RemoteSchema(type: "array", items: RemoteSchemas.schema_14f6b52f84064da4, unknownPolicy: .strip)
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
  static let schema_bd85a52dd25effae = RemoteSchema(type: "string", minLength: 1, maxLength: 4096, unknownPolicy: .strip)
}
