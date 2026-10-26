// GENERATED FILE. Do not edit by hand.
import Foundation
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
  static let schema_13762c62f0c23527 = RemoteSchema(type: "object", required: Set(["seq", "type"]), properties: ["seq": RemoteSchemas.schema_56aa0e45cbdce0d0, "type": RemoteSchemas.schema_0200f968d21b338b], additionalAllowed: true, unknownPolicy: .strip)
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

public extension RemoteSchemas {
  static let schema_1544bc59ff42b21c = RemoteSchema(type: "object", required: Set(["command", "id", "name"]), properties: ["command": RemoteSchemas.schema_36fea325bf1aca70, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15838a9e80c7867f = RemoteSchema(type: "string", literals: [.string("file")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15cae388d0cdd5b6 = RemoteSchema(type: "string", literals: [.string("summary"), .string("full")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_160c1ab9b7f11a56 = RemoteSchema(type: "object", required: Set(["createdAt", "fingerprint", "model", "stops", "summary", "version"]), properties: ["createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "fingerprint": RemoteSchemas.schema_36fea325bf1aca70, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "stops": RemoteSchemas.schema_b8f3bd9de101caa0, "summary": RemoteSchemas.schema_5c07f5964567e9f0, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1618be77eba1d732 = RemoteSchema(type: "object", required: Set(["agentSessions", "generationHelpers", "refusals", "terminalShells", "total"]), properties: ["agentSessions": RemoteSchemas.schema_402930e3e48d3bdd, "generationHelpers": RemoteSchemas.schema_402930e3e48d3bdd, "refusals": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalShells": RemoteSchemas.schema_402930e3e48d3bdd, "total": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1631cf63b0b9b49c = RemoteSchema(type: "object", required: Set(["fingerprint", "forgeAccount", "forgeRepository", "path", "prNumber", "projectLocation"]), properties: ["fingerprint": RemoteSchemas.schema_7738b69937d794b0, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_bd85a52dd25effae, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_164937b9a51028fa = RemoteSchema(type: "object", required: Set(["active", "limit", "maxActive", "queued"]), properties: ["active": RemoteSchemas.schema_56aa0e45cbdce0d0, "executionMs": RemoteSchemas.schema_f696f11685898ba7, "limit": RemoteSchemas.schema_f58a8b771657d037, "maxActive": RemoteSchemas.schema_56aa0e45cbdce0d0, "maxExecutionMs": RemoteSchemas.schema_f696f11685898ba7, "maxQueueWaitMs": RemoteSchemas.schema_f696f11685898ba7, "queueWaitMs": RemoteSchemas.schema_f696f11685898ba7, "queued": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1709690cf0edf961 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "sentAt": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_fe79d48b8af45e7d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_174f77d24d01fc57 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7324613e41acced2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_17b50a5a251b31ce = RemoteSchema(type: "object", required: Set(["receivedAt", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "receivedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "sentAt": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_d8768c073f68fc35], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_17c2b8a25332cd3a = RemoteSchema(type: "object", required: Set(["httpBaseUrl", "wsBaseUrl"]), properties: ["httpBaseUrl": RemoteSchemas.schema_6bb6e13415c8cbba, "wsBaseUrl": RemoteSchemas.schema_6bb6e13415c8cbba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1806ffb1da5fcacb = RemoteSchema(type: "object", required: Set(["kind", "threadId", "title"]), properties: ["kind": RemoteSchemas.schema_0a08597c6c22cade, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_189279e83c3a2ce4 = RemoteSchema(type: "object", required: Set(["body", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18a5d3fa6e42f4ef = RemoteSchema(type: "object", required: Set(["ref", "refreshedAt"]), properties: ["branches": RemoteSchemas.schema_458a4508393abce2, "ghAvailable": RemoteSchemas.schema_feeb8bb50144d96d, "ref": RemoteSchemas.schema_83470ce63973b6e2, "refreshedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_c1d4a9f752e166b1, "worktrees": RemoteSchemas.schema_cd357f47aa772b6a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18b29df576abb2b9 = RemoteSchema(type: "object", properties: ["setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18dc352c9a615faa = RemoteSchema(type: "object", required: Set(["autoRefresh", "collapsedProviders", "disabledProviders", "providerOrder", "providerRefreshIntervals", "refreshIntervalMinutes", "selectedRingGroups", "showEstimatedCost", "showInSidebar", "sidebarHiddenProviders"]), properties: ["autoRefresh": RemoteSchemas.schema_a6ba34cd39bf30c5, "collapsedProviders": RemoteSchemas.schema_aac2a4e83d2823be, "disabledProviders": RemoteSchemas.schema_aac2a4e83d2823be, "providerOrder": RemoteSchemas.schema_aac2a4e83d2823be, "providerRefreshIntervals": RemoteSchemas.schema_ea08f63f22aa2011, "refreshIntervalMinutes": RemoteSchemas.schema_ea193ab85993872c, "selectedRingGroups": RemoteSchemas.schema_c3ac2139868061bb, "showEstimatedCost": RemoteSchemas.schema_f8b6dd8128e8bfe0, "showInSidebar": RemoteSchemas.schema_a6ba34cd39bf30c5, "sidebarHiddenProviders": RemoteSchemas.schema_aac2a4e83d2823be], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19030914d1c4d410 = RemoteSchema(type: "string", literals: [.string("insert-text")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_191ccdb4e41abc75 = RemoteSchema(type: "object", required: Set(["events", "seq"]), properties: ["events": RemoteSchemas.schema_6227384f8fe3c509, "seq": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_195974ed118a4217 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9fe1fe9bbcff3ecd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_197c2b8c01d7f4ed = RemoteSchema(type: "object", properties: ["authMethod": RemoteSchemas.schema_36fea325bf1aca70, "authenticatedAs": RemoteSchemas.schema_36fea325bf1aca70, "connectedProviders": RemoteSchemas.schema_7fdc1b397391e8f3, "organization": RemoteSchemas.schema_36fea325bf1aca70, "plan": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1994cc63e450a4bd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_80c415b6e27c6ebd, RemoteSchemas.schema_feeb8bb50144d96d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19bc3ac82d723fad = RemoteSchema(type: "object", required: Set(["serial"]), properties: ["serial": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19cc91cdde8419f3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9edd0cfb1cd802d2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1a0723da99007052 = RemoteSchema(type: "string", literals: [.string("location")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1a5502ed59b02d53 = RemoteSchema(type: "array", items: RemoteSchemas.schema_cac3b973979876dd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1aa020e871f1c07e = RemoteSchema(type: "string", literals: [.string("event")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1ae7de2180f145f4 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_03fdf2ff7afe440b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b0d78a3430b7087 = RemoteSchema(type: "object", required: Set(["desktopId"]), properties: ["desktopId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_1b2373270569d6e5 = RemoteSchema(type: "object", required: Set(["statuses"]), properties: ["statuses": RemoteSchemas.schema_745963f66484f8a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b3dc298a6f3cf15 = RemoteSchema(type: "object", required: Set(["id", "label", "tokens"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b6b610bba2774d6 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 16384.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b7f16955dbf0b33 = RemoteSchema(type: "object", required: Set(["state"]), properties: ["state": RemoteSchemas.schema_ecc6edb6166acda9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1be16061d2974772 = RemoteSchema(type: "string", minLength: 1, maxLength: 65536, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1be1630ac362ee37 = RemoteSchema(type: "object", required: Set(["bindings", "label", "members", "model", "selectors"]), properties: ["bindings": RemoteSchemas.schema_369773f70316d070, "label": RemoteSchemas.schema_36fea325bf1aca70, "members": RemoteSchemas.schema_fe8cce293da1b3f5, "model": RemoteSchemas.schema_36fea325bf1aca70, "redundantValues": RemoteSchemas.schema_47eb55b96bbf5d77, "selectors": RemoteSchemas.schema_36ebafd43b47829a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1be5ac91cc4357cb = RemoteSchema(type: "object", required: Set(["baseBranch", "baseCommit", "candidates", "createdAt", "id", "projectId", "prompt", "status", "title", "updatedAt"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "baseCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "candidates": RemoteSchemas.schema_6c24d6b835735b69, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "crown": RemoteSchemas.schema_208e24a5c5aa618a, "id": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_7f6bd58bd8881ec0, "segments": RemoteSchemas.schema_4392338ffc80bed7, "status": RemoteSchemas.schema_c5efb303b347362f, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "winnerThreadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c2823e73ee0c1dc = RemoteSchema(type: "object", required: Set(["owner", "platform", "repo", "url"]), properties: ["owner": RemoteSchemas.schema_bf0b727f7b1c6d07, "platform": RemoteSchemas.schema_9358a37bbc89d2ef, "repo": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c58197f2405018b = RemoteSchema(type: "object", required: Set(["isDraft", "number", "state", "title", "url"]), properties: ["checksStatus": RemoteSchemas.schema_bf0b727f7b1c6d07, "isDraft": RemoteSchemas.schema_feeb8bb50144d96d, "number": RemoteSchemas.schema_3d06117798bf5171, "state": RemoteSchemas.schema_79fd49e14d0e7e17, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c60a16c12c10c8f = RemoteSchema(type: "object", required: Set(["forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1d261f6c634ca0b3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_423ec18ef5ab4596, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1d53b68fd3881a00 = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_85cd2a40f756baae, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1d8def7ed78e9628 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4878a3657a97dce6, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1da6db5f13bd36e1 = RemoteSchema(type: "integer", defaultValue: .int(30000), maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1da8031b611dee7d = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_18a5d3fa6e42f4ef, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1dff9447e3354b05 = RemoteSchema(type: "string", literals: [.string("exponential")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1e25c599a64f5b9d = RemoteSchema(type: "object", required: Set(["source", "status", "toolName", "updatedAt", "version"]), properties: ["capturedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "image": RemoteSchemas.schema_c1862c8cf975e3dc, "source": RemoteSchemas.schema_9addfc34d28f29dc, "status": RemoteSchemas.schema_cf7eae9345350df4, "streamVersion": RemoteSchemas.schema_7f9f5a0d72de0d9a, "target": RemoteSchemas.schema_bf0b727f7b1c6d07, "toolName": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1e591a20b9e55743 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d855999aed5e6438, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1eaf563a1e9fa631 = RemoteSchema(type: "string", literals: [.string("rank"), .string("stars"), .string("recent"), .string("votes")], defaultValue: .string("rank"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f06d1e58958e5d9 = RemoteSchema(type: "object", required: Set(["createdAt", "source", "threadId"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "modelLabel": RemoteSchemas.schema_ca3d163bab055381, "rationale": RemoteSchemas.schema_ca3d163bab055381, "snapshotHash": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_6a2600edfb55d776, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f21330aa47e4036 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f4518886240126e = RemoteSchema(type: "string", literals: [.string("create")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f6ff7bae56a790b = RemoteSchema(type: "string", literals: [.string("host"), .string("wsl")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f8c0bbd106d043e = RemoteSchema(type: "object", required: Set(["completedTurnsNextCursor", "reads", "turns"]), properties: ["completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "reads": RemoteSchemas.schema_4659e6d395f41e16, "turns": RemoteSchemas.schema_4c20b501501c0ba4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fa1b7f79d80e44d = RemoteSchema(type: "integer", minimum: 5.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fb6f9ae5f6d1a02 = RemoteSchema(type: "object", required: Set(["state"]), properties: ["state": RemoteSchemas.schema_7ee0d4255fd8c330], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_1fbc0e0d793ae9f1 = RemoteSchema(type: "string", literals: [.string("context.updated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fc25f3569e514e5 = RemoteSchema(type: "array", items: RemoteSchemas.schema_dba220fea45f4f88, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_203e1407dc2d843e = RemoteSchema(type: "array", items: RemoteSchemas.schema_09b66dd237e8c823, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2062bc5ac9057c02 = RemoteSchema(type: "object", required: Set(["kind", "placement", "projectId", "targetThreadId", "threadIds"]), properties: ["kind": RemoteSchemas.schema_701d7d6274e152f6, "placement": RemoteSchemas.schema_3512bd687eb85e90, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "targetThreadId": RemoteSchemas.schema_36fea325bf1aca70, "threadIds": RemoteSchemas.schema_0c6254245418ba4c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_208e24a5c5aa618a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_2fc59eb755b48806, RemoteSchemas.schema_1f06d1e58958e5d9], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20b48750f1f97bcf = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_bb3cd72cf9e1b0cc, RemoteSchemas.schema_560a7abcaf51999f, RemoteSchemas.schema_2798cb9d2dca7539, RemoteSchemas.schema_f2e3da83f3088e10, RemoteSchemas.schema_3ac3526f6a2607f3], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20b56c9f2266c25a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_962b214fbc91a2f5, RemoteSchemas.schema_0463d43632698ad7], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20d706a189398fff = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_4d34acc64dd77a5d, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20d7b1e748f886c3 = RemoteSchema(type: "object", required: Set(["fetchedAt", "providerId", "status", "windows"]), properties: ["authenticatedAs": RemoteSchemas.schema_bf0b727f7b1c6d07, "cost": RemoteSchemas.schema_4147389dac614b3a, "credits": RemoteSchemas.schema_a39dd0410456fe31, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fetchedAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "plan": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerId": RemoteSchemas.schema_bf0b727f7b1c6d07, "rateLimitedUntil": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_3466b9b69cc5e0cc, "tokens": RemoteSchemas.schema_36a14ea6cf3d0316, "windows": RemoteSchemas.schema_d59f3565f41b247f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_212ab189f2321de4 = RemoteSchema(type: "string", minLength: 8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2130fba9cf5ae781 = RemoteSchema(type: "object", required: Set(["delaySeconds", "kind", "maxAttempts"]), properties: ["delaySeconds": RemoteSchemas.schema_e9f57f9b4751d6e1, "kind": RemoteSchemas.schema_82e9f889c9c5a99f, "maxAttempts": RemoteSchemas.schema_f7164d030c9bbeaf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_214ae58e6e08f2d4 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1468dfe9a2db9c9d, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2151c8edcffb30bf = RemoteSchema(type: "string", literals: [.string("running"), .string("waiting-for-approval"), .string("succeeded"), .string("failed"), .string("cancelled"), .string("interrupted"), .string("skipped")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2197834f1e6c8426 = RemoteSchema(type: "object", required: Set(["projectLocation", "state"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "state": RemoteSchemas.schema_ef49c6f9f5f7ce2b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_21c479c8dedbe09d = RemoteSchema(type: "string", literals: [.string("checking")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_21cd039cb32b3851 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["groupId": RemoteSchemas.schema_36fea325bf1aca70, "groupName": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_f399af5f8dcf6035], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_225e53f995988ddf = RemoteSchema(type: "string", literals: [.string("browser-unwatch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_228757711c5e4b37 = RemoteSchema(type: "object", required: Set(["itemId"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22c1b4b934fdb197 = RemoteSchema(type: "string", literals: [.string("ipc"), .string("loopback")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22c8bcdab9edbc02 = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_41be750b567a2144, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22f14841c064490b = RemoteSchema(type: "object", required: Set(["accessToken", "expiresAt", "scopes", "tokenType"]), properties: ["accessToken": RemoteSchemas.schema_36fea325bf1aca70, "expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "refreshToken": RemoteSchemas.schema_36fea325bf1aca70, "refreshTokenExpiresAt": RemoteSchemas.schema_36fea325bf1aca70, "scopes": RemoteSchemas.schema_515482d2104d1efa, "sessionId": RemoteSchemas.schema_36fea325bf1aca70, "tokenType": RemoteSchemas.schema_7c8fd050dd5e98a8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22f3597ef077b931 = RemoteSchema(type: "object", required: Set(["activeDays", "currentStreakDays", "goalsSet", "longestStreakDays", "longestTaskMs", "messagesSent", "totalPrompts", "totalThreads"]), properties: ["activeDays": RemoteSchemas.schema_56aa0e45cbdce0d0, "currentStreakDays": RemoteSchemas.schema_56aa0e45cbdce0d0, "goalsSet": RemoteSchemas.schema_56aa0e45cbdce0d0, "longestStreakDays": RemoteSchemas.schema_56aa0e45cbdce0d0, "longestTaskMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "messagesSent": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalPrompts": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalThreads": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22fb635ee9412c65 = RemoteSchema(type: "object", required: Set(["prNumber", "projectId"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2363c4dd0a78ce9d = RemoteSchema(type: "string", literals: [.string("authenticated"), .string("missing"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2365fa95161a3294 = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip, semanticIds: ["forge.host.https"])
}

public extension RemoteSchemas {
  static let schema_23a1c447c059f0da = RemoteSchema(type: "object", required: Set(["throughCursor", "version", "watchId"]), properties: ["throughCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_f8ba039a2f32fad1, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23e05d248383ea40 = RemoteSchema(type: "integer", maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_241bff8fc91fc9b5 = RemoteSchema(type: "object", required: Set(["projects"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "project": RemoteSchemas.schema_cac3b973979876dd, "projects": RemoteSchemas.schema_1a5502ed59b02d53], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_242a5ef77d1f8924 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2465ffaaf2ca280d = RemoteSchema(type: "object", required: Set(["entries", "totalIndexed"]), properties: ["entries": RemoteSchemas.schema_3615f9310cd4ee9d, "totalIndexed": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2472eab79ad4b307 = RemoteSchema(type: "string", literals: [.string("started"), .string("updated"), .string("completed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_247ec4acb49e6522 = RemoteSchema(type: "object", required: Set(["createdAt", "id", "listenPort", "targetPort"]), properties: ["createdAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "id": RemoteSchemas.schema_36fea325bf1aca70, "listenPort": RemoteSchemas.schema_279eee1efa9da6c8, "targetPort": RemoteSchemas.schema_279eee1efa9da6c8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_24a221c9609f967e = RemoteSchema(type: "string", minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_24cb35c8f91ba9a7 = RemoteSchema(type: "object", required: Set(["files"]), properties: ["files": RemoteSchemas.schema_0abd6180b71e8684], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_252e94a758743ab1 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_48916cddaaeb3b09, RemoteSchemas.schema_13762c62f0c23527, RemoteSchemas.schema_3897f50212cb0b25, RemoteSchemas.schema_a633f9a256d1d0c9, RemoteSchemas.schema_17b50a5a251b31ce, RemoteSchemas.schema_bd23acb1d60bc91b, RemoteSchemas.schema_8f58c1d1acd8bc3c, RemoteSchemas.schema_0ad133ee5894107b, RemoteSchemas.schema_95d0adeb5b1f4c44, RemoteSchemas.schema_4655073d71f8e50b, RemoteSchemas.schema_e65689e97e7d91c3, RemoteSchemas.schema_f1c1581e1729d48e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2556bf4896893601 = RemoteSchema(type: "string", literals: [.string("authentication"), .string("tool-restrictions"), .string("sensitive-values")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_255898614500bbb9 = RemoteSchema(type: "object", required: Set(["hostId", "prNumber", "projectId"]), properties: ["hostId": RemoteSchemas.schema_bf0b727f7b1c6d07, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25a3e0b2a9eecdfb = RemoteSchema(type: "string", pattern: "^\\/(?!\\/)(?:[^?#]*)$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25bab2baa6662281 = RemoteSchema(type: "object", required: Set(["config", "prompt", "threadId"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_77c646d1a00c89a5, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25df6feb29c4a959 = RemoteSchema(type: "object", required: Set(["discoveredAt", "providerSessionId"]), properties: ["discoveredAt": RemoteSchemas.schema_36fea325bf1aca70, "executionIdentity": RemoteSchemas.schema_97d85a5eaee82b97, "providerSessionId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
