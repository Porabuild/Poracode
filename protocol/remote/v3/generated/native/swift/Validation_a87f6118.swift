// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_11ada4e73a793b0d = RemoteSchema(type: "string", literals: [.string("pending"), .string("completed"), .string("failed"), .string("ambiguous"), .string("skipped_no_turns"), .string("skipped_missing_checkpoint")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_11da754926e41b05 = RemoteSchema(type: "string", literals: [.string("append")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_11e04e93bdeaf95b = RemoteSchema(type: "object", required: Set(["access", "agentAccess", "device", "expiresAt", "generation", "id", "threadId", "version"]), properties: ["access": RemoteSchemas.schema_9ca4aec6d46ade2e, "agentAccess": RemoteSchemas.schema_e6bc2fd97be6dec8, "device": RemoteSchemas.schema_4b43828b172de36c, "expiresAt": RemoteSchemas.schema_80c415b6e27c6ebd, "generation": RemoteSchemas.schema_d855999aed5e6438, "id": RemoteSchemas.schema_d855999aed5e6438, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_11f20430355ec49c = RemoteSchema(type: "object", required: Set(["additions", "deletions", "headBranch", "pr", "repository", "reviewRequested"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "author": RemoteSchemas.schema_a99c73e81a312991, "deletions": RemoteSchemas.schema_3d06117798bf5171, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "labels": RemoteSchemas.schema_0e31d5342d99e6b9, "pr": RemoteSchemas.schema_ea7fc856bb9aa12e, "repository": RemoteSchemas.schema_bf0b727f7b1c6d07, "reviewRequested": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_12344c6d82d54c6d = RemoteSchema(type: "array", items: RemoteSchemas.schema_938414fbfa27a773, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_12ca2594dca47145 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_15838a9e80c7867f, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_12f751ee47b47fbd = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_a467b0ed1c0ea208, RemoteSchemas.schema_ac7865b2a567eb07, RemoteSchemas.schema_d1c4cb16ae4c331e, RemoteSchemas.schema_84ccfb83d8334510, RemoteSchemas.schema_0a49efe270718ab9], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_13324e3fec19e623 = RemoteSchema(type: "object", required: Set(["location", "manifestPath"]), properties: ["includeAgentChats": RemoteSchemas.schema_feeb8bb50144d96d, "location": RemoteSchemas.schema_080f9cc154af9e27, "manifestPath": RemoteSchemas.schema_36fea325bf1aca70, "transcriptDir": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_135288c0feeec2fc = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_a76106fec07f8e2b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_135f7ef79d6fe306 = RemoteSchema(type: "number", literals: [.int(3)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1371f7bedcffbc2e = RemoteSchema(type: "object", required: Set(["itemId", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_ab5271048956dc05], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_137445efd1582c7a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_66504fdb436f3b0e, RemoteSchemas.schema_8b72b09d5cbe1e7f, RemoteSchemas.schema_8850f6c7f12f8eb8], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_137e14636e0bc235 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7eb7e8f44a304273, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1399799a226dcc71 = RemoteSchema(type: "array", items: RemoteSchemas.schema_00b1d6328e3a57b5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_13f43aaaf56911fa = RemoteSchema(type: "string", literals: [.string("browser"), .string("crossagents"), .string("chrome"), .string("computer-use"), .string("app-controls")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_14221269d858a2f5 = RemoteSchema(type: "string", literals: [.string("key")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_14377f176c4dfd2a = RemoteSchema(type: "string", minLength: 1, maxLength: 500, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_1468dfe9a2db9c9d = RemoteSchema(type: "object", required: Set(["acknowledgedCount", "firstAcknowledgedAt", "kind", "lastAcknowledgedAt", "reason", "refusedBytes", "refusedEvents", "source"]), properties: ["acknowledgedCount": RemoteSchemas.schema_23e05d248383ea40, "firstAcknowledgedAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "kind": RemoteSchemas.schema_f8afe6df005d2978, "lastAcknowledgedAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "reason": RemoteSchemas.schema_9780f521bc1dee38, "refusedBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "refusedEvents": RemoteSchemas.schema_56aa0e45cbdce0d0, "source": RemoteSchemas.schema_77a7dec7edfc464f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_149c9d9dd2191aa3 = RemoteSchema(type: "object", required: Set(["environmentId"]), properties: ["environmentId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_14ac0689f2cc3ba8 = RemoteSchema(type: "object", required: Set(["accounts", "aiActions", "availableAccounts", "device", "generatedAt", "identity", "insights", "mcps", "models", "modes", "promptHeatmap", "providers", "scope", "skills", "timezoneOffsetMinutes", "totals"]), properties: ["accounts": RemoteSchemas.schema_195974ed118a4217, "aiActions": RemoteSchemas.schema_62392c6d6ccb4368, "availableAccounts": RemoteSchemas.schema_2c4b8c74e6940159, "device": RemoteSchemas.schema_26f96950d20651b3, "generatedAt": RemoteSchemas.schema_3d06117798bf5171, "identity": RemoteSchemas.schema_da76232259cbe6bb, "insights": RemoteSchemas.schema_d1beee40ea84d2e9, "mcps": RemoteSchemas.schema_8c71be0e7fdf9e1a, "models": RemoteSchemas.schema_195974ed118a4217, "modes": RemoteSchemas.schema_195974ed118a4217, "promptHeatmap": RemoteSchemas.schema_c1094a243b47f83c, "providers": RemoteSchemas.schema_195974ed118a4217, "scope": RemoteSchemas.schema_b99ee3af304513c2, "skills": RemoteSchemas.schema_8c71be0e7fdf9e1a, "timezoneOffsetMinutes": RemoteSchemas.schema_3d06117798bf5171, "totals": RemoteSchemas.schema_22f3597ef077b931], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_14ca57bfe938f3d4 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_9eaa25e68d8e4cf4, RemoteSchemas.schema_107db71e1696908a, RemoteSchemas.schema_1709690cf0edf961, RemoteSchemas.schema_2b7b34c95b23bb0d, RemoteSchemas.schema_0e8f58f429bb1135, RemoteSchemas.schema_d550ef9994fd388f, RemoteSchemas.schema_838adcbcaff5f551, RemoteSchemas.schema_5af10e67b405a136, RemoteSchemas.schema_3f58316dbb160752, RemoteSchemas.schema_d2299af726097d6c, RemoteSchemas.schema_93bef3a552bf787e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_14f3c332d545bff0 = RemoteSchema(type: "object", required: Set(["applicationId", "type"]), properties: ["applicationId": RemoteSchemas.schema_bab85ee50a59610a, "type": RemoteSchemas.schema_bd9ee7d62499d1b2], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_14f6b52f84064da4 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "createdAt", "enabled", "id", "lastCompletedAt", "lastError", "lastResult", "lastRunAt", "lastStatus", "name", "nextRunAt", "prompt", "recurrence", "updatedAt"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "automation": RemoteSchemas.schema_fdddba9ec6ce269e, "config": RemoteSchemas.schema_f69100925fc0e774, "createdAt": RemoteSchemas.schema_38adcf16c79023ce, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_d855999aed5e6438, "iterationCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "lastCompletedAt": RemoteSchemas.schema_595da89b21b7ca56, "lastError": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastResult": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastRunAt": RemoteSchemas.schema_595da89b21b7ca56, "lastStatus": RemoteSchemas.schema_aa5449703b29a615, "name": RemoteSchemas.schema_b89c357946c21293, "nextRunAt": RemoteSchemas.schema_595da89b21b7ca56, "projectId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prompt": RemoteSchemas.schema_30cc89214bd9dffb, "recurrence": RemoteSchemas.schema_12f751ee47b47fbd, "updatedAt": RemoteSchemas.schema_38adcf16c79023ce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_150828825a4ec4d6 = RemoteSchema(type: "array", items: RemoteSchemas.schema_95bca512ea5c155a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15179deb98a23815 = RemoteSchema(type: "object", required: Set(["payload", "requestId", "requestType", "threadId", "type"]), properties: ["payload": RemoteSchemas.schema_fd95a83e5b156564, "requestId": RemoteSchemas.schema_bf0b727f7b1c6d07, "requestType": RemoteSchemas.schema_c733570a5a247812, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_fcb2eed91b3e89ce], additionalAllowed: true, unknownPolicy: .strip)
}
