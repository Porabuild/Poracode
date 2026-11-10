// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_1b5ac9c6b0c4832b = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_2f2654f61b052491, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
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
  static let schema_1d58a09e28f725df = RemoteSchema(type: "string", maxLength: 4096, pattern: "^ui:\\/\\/.*", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1d8def7ed78e9628 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4878a3657a97dce6, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1da6db5f13bd36e1 = RemoteSchema(type: "integer", defaultValue: .int(30000), maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1dff9447e3354b05 = RemoteSchema(type: "string", literals: [.string("exponential")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1e25c599a64f5b9d = RemoteSchema(type: "object", required: Set(["source", "status", "toolName", "updatedAt", "version"]), properties: ["capturedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "image": RemoteSchemas.schema_c1862c8cf975e3dc, "source": RemoteSchemas.schema_9addfc34d28f29dc, "status": RemoteSchemas.schema_cf7eae9345350df4, "streamVersion": RemoteSchemas.schema_7f9f5a0d72de0d9a, "target": RemoteSchemas.schema_bf0b727f7b1c6d07, "toolName": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1e3c3dda8e348c4b = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c18ccc2aa36fdad0, RemoteSchemas.schema_7053ed3816efd9d2], unknownPolicy: .strip)
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
  static let schema_209f7faf00cb863e = RemoteSchema(type: "object", required: Set(["authState", "authUsesProviderLogin", "capabilities", "installed", "presentationMode"]), properties: ["authLogoutSupported": RemoteSchemas.schema_feeb8bb50144d96d, "authMethods": RemoteSchemas.schema_cd0a57f27ae4fccb, "authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "authUsesProviderLogin": RemoteSchemas.schema_feeb8bb50144d96d, "capabilities": RemoteSchemas.schema_e0845a6e4a3f765e, "installationSource": RemoteSchemas.schema_36fea325bf1aca70, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "loginCommand": RemoteSchemas.schema_36fea325bf1aca70, "loginCommandDisplay": RemoteSchemas.schema_36fea325bf1aca70, "preferTerminalLogin": RemoteSchemas.schema_feeb8bb50144d96d, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "providerMetadata": RemoteSchemas.schema_197c2b8c01d7f4ed, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_2127b6212a816df5 = RemoteSchema(type: "string", literals: [.string("error"), .string("restart")], unknownPolicy: .strip)
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
  static let schema_2351864622b834c7 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c1f4a31c98798d12, RemoteSchemas.schema_c24d062f64579ed9], unknownPolicy: .strip)
}
