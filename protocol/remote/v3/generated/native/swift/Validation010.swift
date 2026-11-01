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
  static let schema_a5ae4ed4358535a0 = RemoteSchema(type: "array", items: RemoteSchemas.schema_83e62a05a75c7bd3, unknownPolicy: .strip)
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
  static let schema_a6807510442919f1 = RemoteSchema(type: "object", required: Set(["completedTurns", "completedTurnsNextCursor", "contextUsage", "reads", "runtimeItems", "snapshotSeq", "thread", "updatedAt"]), properties: ["backgroundTasks": RemoteSchemas.schema_00675d64d428c3d1, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "historyProjection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeItems": RemoteSchemas.schema_5d3ac76d9a521e1d, "runtimeNextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "runtimeResumeCursor": RemoteSchemas.schema_36fea325bf1aca70, "runtimeStateCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalScrollback": RemoteSchemas.schema_bf0b727f7b1c6d07, "terminalSize": RemoteSchemas.schema_55ee222c096690dc, "thread": RemoteSchemas.schema_83e62a05a75c7bd3, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_a7a958b1f69d54ee = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_ea7fc856bb9aa12e, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
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
  static let schema_ac3d09b5c7f361d2 = RemoteSchema(type: "array", items: RemoteSchemas.schema_cb95bf43ec62db01, unknownPolicy: .strip)
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
  static let schema_ad31e0c5f63e1a50 = RemoteSchema(type: "object", properties: ["beforePosition": RemoteSchemas.schema_56aa0e45cbdce0d0, "deferBodies": RemoteSchemas.schema_30a537a9343bcdf7, "limit": RemoteSchemas.schema_be268483fb86810f, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "projection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ad6bb2de51c0e05f = RemoteSchema(type: "object", required: Set(["amount", "currency"]), properties: ["amount": RemoteSchemas.schema_f696f11685898ba7, "currency": RemoteSchemas.schema_e22de6db69f83369], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_ae682752b1c14d17 = RemoteSchema(type: "string", literals: [.string("forge"), .string("host")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_af6b6f72d4304b97 = RemoteSchema(type: "string", literals: [.string("terminal-unwatch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_af80d040598805ef = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1e25c599a64f5b9d, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
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
  static let schema_b03a8b1facfb96ed = RemoteSchema(type: "object", required: Set(["body", "excerpts", "files", "lookClosely", "questions", "title"]), properties: ["body": RemoteSchemas.schema_5c07f5964567e9f0, "excerpts": RemoteSchemas.schema_fece443c82df794e, "files": RemoteSchemas.schema_0c6254245418ba4c, "lookClosely": RemoteSchemas.schema_feeb8bb50144d96d, "questions": RemoteSchemas.schema_4e014bc9e6085564, "title": RemoteSchemas.schema_e7c7f30aecaa99f0], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b176186fb3da3d3b = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_48916cddaaeb3b09, RemoteSchemas.schema_dade9637aede6170, RemoteSchemas.schema_3897f50212cb0b25, RemoteSchemas.schema_a633f9a256d1d0c9, RemoteSchemas.schema_17b50a5a251b31ce, RemoteSchemas.schema_bd23acb1d60bc91b, RemoteSchemas.schema_8f58c1d1acd8bc3c, RemoteSchemas.schema_0ad133ee5894107b, RemoteSchemas.schema_95d0adeb5b1f4c44, RemoteSchemas.schema_4655073d71f8e50b, RemoteSchemas.schema_e65689e97e7d91c3, RemoteSchemas.schema_f1c1581e1729d48e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b202a6626ea9d1ee = RemoteSchema(type: "string", maxLength: 600, unknownPolicy: .strip)
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
  static let schema_b3ef93117a9f9f95 = RemoteSchema(type: "string", literals: [.string("portrait"), .string("landscape_left"), .string("portrait_upside_down"), .string("landscape_right")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4441316f1aafac9 = RemoteSchema(type: "object", required: Set(["id", "labelKey", "options"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "labelKey": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_1d53b68fd3881a00], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b445f14c3106fc97 = RemoteSchema(type: "array", items: RemoteSchemas.schema_288cf32acf26654a, unknownPolicy: .strip)
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
  static let schema_b5ff559bbe30e3ad = RemoteSchema(type: "object", properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_36fea325bf1aca70, "query": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b6f2d95e2bc1e84c = RemoteSchema(type: "object", required: Set(["config", "prompt", "threadId"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_281d24bbbaa46745, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b796d8a8794bf04e = RemoteSchema(type: "object", required: Set(["kind", "snapshot"]), properties: ["kind": RemoteSchemas.schema_9e712b4f87e5beb0, "snapshot": RemoteSchemas.schema_a6807510442919f1], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b85a0330160a5a75 = RemoteSchema(type: "array", items: RemoteSchemas.schema_fff3547caad99f85, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b89c357946c21293 = RemoteSchema(type: "string", minLength: 1, maxLength: 120, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_b8f3bd9de101caa0 = RemoteSchema(type: "array", minItems: 1, maxItems: 500, items: RemoteSchemas.schema_b03a8b1facfb96ed, unknownPolicy: .strip)
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
  static let schema_ba7dfbe6c754d186 = RemoteSchema(type: "string", maxLength: 160, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bab85ee50a59610a = RemoteSchema(type: "string", minLength: 3, maxLength: 255, pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_badd682f3501e022 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_baf4f355dd2fd6ae = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a799b0e11ed8f6df, "usage": RemoteSchemas.schema_4fb4f0ac85464c4a], additionalAllowed: true, unknownPolicy: .strip)
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
