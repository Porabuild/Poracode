// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_c62b342ed89c5809 = RemoteSchema(type: "string", literals: [.string("applied")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c64b38404fc9a1d4 = RemoteSchema(type: "string", literals: [.string("terminal-watch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c65389518caf6991 = RemoteSchema(type: "object", required: Set(["createdAt", "id", "kind"]), properties: ["actor": RemoteSchemas.schema_a99c73e81a312991, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromRef": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_7d62681c6488867d, "label": RemoteSchemas.schema_2e20b523bd887c4e, "reviewer": RemoteSchemas.schema_423ec18ef5ab4596, "text": RemoteSchemas.schema_bf0b727f7b1c6d07, "toRef": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c664f13e067b9fbd = RemoteSchema(type: "integer", maximum: 2048.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c669b4e26b2b7569 = RemoteSchema(type: "string", literals: [.string("mcp")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c66f09c6212330ba = RemoteSchema(type: "object", required: Set(["createdAt", "reason", "refusedBytes", "refusedEvents", "source", "token"]), properties: ["createdAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "reason": RemoteSchemas.schema_9780f521bc1dee38, "refusedBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "refusedEvents": RemoteSchemas.schema_56aa0e45cbdce0d0, "source": RemoteSchemas.schema_77a7dec7edfc464f, "token": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c6b76607f48c889e = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_21c479c8dedbe09d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c6ca4f58c0a3ffa4 = RemoteSchema(type: "object", required: Set(["repairedWorktrees"]), properties: ["repairedWorktrees": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c70a9f86327c7bf7 = RemoteSchema(type: "object", required: Set(["commit", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["commit": RemoteSchemas.schema_ef369ae84db5485c, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c733570a5a247812 = RemoteSchema(type: "string", literals: [.string("command_execution_approval"), .string("file_read_approval"), .string("file_change_approval"), .string("apply_patch_approval"), .string("tool_call_approval"), .string("tool_user_input"), .string("auth_refresh")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7918abeb45791aa = RemoteSchema(type: "object", required: Set(["pullRequests"]), properties: ["pullRequests": RemoteSchemas.schema_f86171557f2ff456, "viewerLogin": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7bfc39efc965eed = RemoteSchema(type: "string", literals: [.string("unarchive")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7d6a559534154dd = RemoteSchema(type: "object", required: Set(["repository"]), properties: ["repository": RemoteSchemas.schema_2e5ddb0a3afed2cb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7e9848de3a346ed = RemoteSchema(type: "string", minLength: 1, maxLength: 512, unknownPolicy: .strip, semanticIds: ["push.routing.identifier-no-controls"])
}

public extension RemoteSchemas {
  static let schema_c8425979fd5d4887 = RemoteSchema(type: "string", literals: [.string("forbidden"), .string("not-found"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8709e27df818d5b = RemoteSchema(type: "string", maxLength: 80, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8aab5b657a17f5e = RemoteSchema(type: "array", items: RemoteSchemas.schema_0dd86a486b36c18a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8c48a1118d06f0b = RemoteSchema(type: "string", literals: [.string("textSize")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8ef822f0af9edc7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_ad6bb2de51c0e05f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8fcec3264ef36ec = RemoteSchema(type: "object", required: Set(["plugins", "userPluginsDir"]), properties: ["plugins": RemoteSchemas.schema_d5ffe1a272cf6a0c, "userPluginsDir": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c96dee87101c1f92 = RemoteSchema(type: "object", required: Set(["key", "label", "totals"]), properties: ["key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "totals": RemoteSchemas.schema_e0fa095c6a9a1aed], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c97404be97c79ac0 = RemoteSchema(type: "object", required: Set(["profiles"]), properties: ["profiles": RemoteSchemas.schema_444f48ad16efccca], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c975fc7daa5c30b3 = RemoteSchema(type: "string", literals: [.string("pull-request")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c991d95877a4f953 = RemoteSchema(type: "object", required: Set(["action", "result"]), properties: ["action": RemoteSchemas.schema_79cc8fd8772975d2, "result": RemoteSchemas.schema_61b9b3b3c244a2ad], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c9a954a3af7049b0 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("gui")], defaultValue: .string("terminal"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c9da5a75bfff1852 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_be1e614a6743b534, RemoteSchemas.schema_f86cfdbc9e0cdbec, RemoteSchemas.schema_bf331e27ae5644dc], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c9e04a2c1e52a8e0 = RemoteSchema(type: "object", required: Set(["agentKind", "envs"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "envs": RemoteSchemas.schema_f4e52376e9e6b7f8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca0c8b8a7fbb7b5d = RemoteSchema(type: "object", required: Set(["type", "version"]), properties: ["type": RemoteSchemas.schema_518b8374aca2de65, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca3d163bab055381 = RemoteSchema(unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca5c527c986f0628 = RemoteSchema(type: "object", required: Set(["action", "agentKind", "env"]), properties: ["action": RemoteSchemas.schema_336de6f9a14e1623, "agentKind": RemoteSchemas.schema_8e43cad70cd70de7, "credentialId": RemoteSchemas.schema_172d5c08125b0df4, "env": RemoteSchemas.schema_2583fd799237ae71], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["agent-credentials.id-required"])
}

public extension RemoteSchemas {
  static let schema_ca5f8d6782ca9f6b = RemoteSchema(type: "object", required: Set(["data", "fromCursor", "generation", "processState", "terminalSize", "toCursor"]), properties: ["data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_2d0b6ec9f2b2decf, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca6c162ad500c53d = RemoteSchema(type: "string", literals: [.string("conflict"), .string("rejected"), .string("credential")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca8d08ed24dcae50 = RemoteSchema(type: "object", required: Set(["entries", "indexing", "nextCursor", "version"]), properties: ["entries": RemoteSchemas.schema_da9e94c933512927, "indexing": RemoteSchemas.schema_feeb8bb50144d96d, "nextCursor": RemoteSchemas.schema_e333e5cd970cf11f, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca98effeead73f13 = RemoteSchema(type: "object", required: Set(["enabled", "type"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "type": RemoteSchemas.schema_3ac0e8087f32acdf], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_cab926bfae4fdbf9 = RemoteSchema(type: "object", properties: ["completedTurnsLimit": RemoteSchemas.schema_be268483fb86810f, "cursor": RemoteSchemas.schema_36fea325bf1aca70, "limit": RemoteSchemas.schema_be268483fb86810f, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cac7783fa7c0ea01 = RemoteSchema(type: "object", required: Set(["fingerprint", "path"]), properties: ["fingerprint": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb09d6f7d6659d21 = RemoteSchema(type: "object", required: Set(["kind", "transferId"]), properties: ["kind": RemoteSchemas.schema_69711423c3b7d2a6, "transferId": RemoteSchemas.schema_7f836db787c9df87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb164581809b29f0 = RemoteSchema(type: "object", required: Set(["agentKind", "env"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "env": RemoteSchemas.schema_2583fd799237ae71], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb2e3d3519422e78 = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["deleteBranch": RemoteSchemas.schema_f8b6dd8128e8bfe0, "expectedBranch": RemoteSchemas.schema_36fea325bf1aca70, "expectedOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "force": RemoteSchemas.schema_f8b6dd8128e8bfe0, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["git.remove-worktree.owner-requires-branch"])
}

public extension RemoteSchemas {
  static let schema_cb34d50832b1e60d = RemoteSchema(type: "string", literals: [.string("http"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb6c8dab738236e4 = RemoteSchema(type: "object", required: Set(["name"]), properties: ["maxExclusiveMajor": RemoteSchemas.schema_23e05d248383ea40, "minVersion": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb81a9dbb81a1a63 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("server")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb95bf43ec62db01 = RemoteSchema(type: "object", required: Set(["author", "body", "createdAt", "id"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "reactions": RemoteSchemas.schema_45e52f032f196485, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb9be2057e5078df = RemoteSchema(type: "string", literals: [.string("outer"), .string("inner")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbad4936b49ad671 = RemoteSchema(type: "array", items: RemoteSchemas.schema_da546ba4a0601e6e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbc64d14585e9a92 = RemoteSchema(type: "string", literals: [.string("update")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbe0ba241100dba5 = RemoteSchema(type: "object", required: Set(["branches", "current"]), properties: ["branches": RemoteSchemas.schema_6b97469fe43177d6, "current": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultBranch": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbf78da83a6846d0 = RemoteSchema(type: "object", required: Set(["excludePatterns", "useIgnoreFiles"]), properties: ["excludePatterns": RemoteSchemas.schema_0f732b9fceb2c6ac, "useIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbf87de41a5a2211 = RemoteSchema(type: "object", required: Set(["sourceHostLabel", "transferId", "transferredAt", "version"]), properties: ["fromAgentKind": RemoteSchemas.schema_36fea325bf1aca70, "sourceHostId": RemoteSchemas.schema_36fea325bf1aca70, "sourceHostLabel": RemoteSchemas.schema_36fea325bf1aca70, "sourceWorkingDirectory": RemoteSchemas.schema_36fea325bf1aca70, "targetHostLabel": RemoteSchemas.schema_36fea325bf1aca70, "transferId": RemoteSchemas.schema_36fea325bf1aca70, "transferredAt": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbf9eddea4280dec = RemoteSchema(type: "object", required: Set(["prs", "pullRequests", "status"]), properties: ["prs": RemoteSchemas.schema_a7a958b1f69d54ee, "pullRequests": RemoteSchemas.schema_f86171557f2ff456, "status": RemoteSchemas.schema_0200f968d21b338b, "viewerLogin": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cc1f68c41f086183 = RemoteSchema(type: "string", literals: [.string("github")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cc236ef91a35818c = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_06f7daf0c185051a, RemoteSchemas.schema_2504426b5098e866], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cc277bf688b969d1 = RemoteSchema(type: "object", required: Set(["kind", "title"]), properties: ["kind": RemoteSchemas.schema_c669b4e26b2b7569, "title": RemoteSchemas.schema_dfc3f3726c991dbe], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cc9733aab3f25827 = RemoteSchema(type: "object", required: Set(["body", "commentId", "expectedBody", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_36fea325bf1aca70, "commentId": RemoteSchemas.schema_97d85a5eaee82b97, "expectedBody": RemoteSchemas.schema_bf0b727f7b1c6d07, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ccc27289c741798a = RemoteSchema(type: "object", required: Set(["label", "target"]), properties: ["credentialRef": RemoteSchemas.schema_e301e52cd3d3ea46, "desired": RemoteSchemas.schema_abff99d05c43ad4c, "label": RemoteSchemas.schema_0c5d3d75e4ff2cec, "legacyConnectionId": RemoteSchemas.schema_d855999aed5e6438, "port": RemoteSchemas.schema_279eee1efa9da6c8, "target": RemoteSchemas.schema_a13200e46be7a2e6], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_ccd3eb53d3a096b7 = RemoteSchema(type: "object", required: Set(["directoryPath", "entries"]), properties: ["directoryPath": RemoteSchemas.schema_bf0b727f7b1c6d07, "entries": RemoteSchemas.schema_bdb4eecbb625c500], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ccd4545c11e5d91a = RemoteSchema(type: "object", properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "pluginOverrides": RemoteSchemas.schema_6db96506f253ef73, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd0a57f27ae4fccb = RemoteSchema(type: "array", items: RemoteSchemas.schema_9dee5b496693b179, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd0f41825028e154 = RemoteSchema(type: "object", required: Set(["defaultSerial", "devices"]), properties: ["defaultSerial": RemoteSchemas.schema_97d85a5eaee82b97, "devices": RemoteSchemas.schema_0a18d7dfd6025fad], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd124b21d98c4aa2 = RemoteSchema(type: "object", properties: ["actions": RemoteSchemas.schema_9f0df99b7a4b0249, "cleanupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeCopyPatterns": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd357f47aa772b6a = RemoteSchema(type: "array", items: RemoteSchemas.schema_0288aefad61e0244, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd6770504afebb5a = RemoteSchema(type: "string", literals: [.string("configured"), .string("absent"), .string("missing"), .string("retained"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd99091cb82e8280 = RemoteSchema(type: "object", required: Set(["doc", "todos"]), properties: ["doc": RemoteSchemas.schema_6e4ad578250cef79, "todos": RemoteSchemas.schema_e7c244bd461f7229], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_cd9a361e554145c9 = RemoteSchema(type: "object", required: Set(["kind", "threadId"]), properties: ["kind": RemoteSchemas.schema_7a2cd8ece40e9e4d, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cda18ebe4af54c5c = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdc4a9f3587d0382 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c0551fbf082fff0f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdc63841ca583c5b = RemoteSchema(type: "object", required: Set(["id", "name", "type", "vars"]), properties: ["description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_36fea325bf1aca70, "link": RemoteSchemas.schema_2d0b6ec9f2b2decf, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_aaf42afe3bc86594, "vars": RemoteSchemas.schema_02f62ff4e29426df], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdcee850f284e657 = RemoteSchema(type: "string", literals: [.string("turn.completed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdd89e732d29ca0e = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_1fbc0e0d793ae9f1, "usage": RemoteSchemas.schema_80ac3a097b3c79c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ce6e21bdeb9c2f10 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_66d66ce0fd3d9001], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ced55d8893218e84 = RemoteSchema(type: "object", required: Set(["kind", "source"]), properties: ["kind": RemoteSchemas.schema_7a2cd8ece40e9e4d, "source": RemoteSchemas.schema_1150a8738e84591f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cf69e7793fd482bf = RemoteSchema(type: "number", literals: [.int(5)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cf78c688ea7d3e66 = RemoteSchema(type: "object", required: Set(["action", "id"]), properties: ["action": RemoteSchemas.schema_20dba249c220a52b, "id": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cf7eae9345350df4 = RemoteSchema(type: "string", literals: [.string("running"), .string("idle"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cff1242509563941 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_2b4ffb830b606cf1, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d06f3ce55df8317d = RemoteSchema(type: "string", literals: [.string("configured"), .string("none")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0b10c04efa78c87 = RemoteSchema(type: "array", items: RemoteSchemas.schema_a59d7f7afd3350b1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0bd9c5c0fa9bf37 = RemoteSchema(type: "integer", defaultValue: .int(60), minimum: 0.0, maximum: 3650.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0ecd43b5f1b261a = RemoteSchema(type: "object", required: Set(["name", "path", "type"]), properties: ["name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0fa817300598095 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c30da54b853babca, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d129d1b0ee9ecb9f = RemoteSchema(type: "object", required: Set(["job", "kind"]), properties: ["job": RemoteSchemas.schema_e8296209cb9a16ca, "kind": RemoteSchemas.schema_c297cb4b3fffa0b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d12ea655163290cc = RemoteSchema(type: "string", literals: [.string("run")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1624ea0ecc46dc6 = RemoteSchema(type: "object", required: Set(["fast"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_d1ba4ef10f479cd3 = RemoteSchema(type: "object", required: Set(["completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"]), properties: ["backgroundTasks": RemoteSchemas.schema_f5906c75b7204bd5, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "historyCache": RemoteSchemas.schema_6422ecf430b9e0a8, "historyProjection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeItems": RemoteSchemas.schema_5d3ac76d9a521e1d, "runtimeNextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "runtimeResumeCursor": RemoteSchemas.schema_36fea325bf1aca70, "runtimeStateCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalScrollback": RemoteSchemas.schema_bf0b727f7b1c6d07, "terminalSize": RemoteSchemas.schema_55ee222c096690dc, "thread": RemoteSchemas.schema_b37f60804aab420f, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1beee40ea84d2e9 = RemoteSchema(type: "object", required: Set(["fastModePercent", "mcpToolCalls", "skillsExplored", "subagentRuns", "totalSkillsUsed", "workflowRuns"]), properties: ["fastModePercent": RemoteSchemas.schema_80c415b6e27c6ebd, "mcpToolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0, "mostActiveHour": RemoteSchemas.schema_58f9a3fda2694c76, "skillsExplored": RemoteSchemas.schema_56aa0e45cbdce0d0, "subagentRuns": RemoteSchemas.schema_56aa0e45cbdce0d0, "topModel": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "topProvider": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "topReasoning": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "totalSkillsUsed": RemoteSchemas.schema_56aa0e45cbdce0d0, "workflowRuns": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1c4cb16ae4c331e = RemoteSchema(type: "object", required: Set(["kind", "runAt"]), properties: ["kind": RemoteSchemas.schema_e5ee0a072228c0a3, "runAt": RemoteSchemas.schema_38adcf16c79023ce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1d1696e7dc33885 = RemoteSchema(type: "string", literals: [.string("desktop"), .string("helper")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1d29954f5424dc9 = RemoteSchema(type: "string", literals: [.string("thread-token"), .string("provider-session")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1df243f455504fc = RemoteSchema(type: "object", required: Set(["type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageKey": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d221b1853eb0ef37 = RemoteSchema(type: "object", required: Set(["prefixes"]), properties: ["fallbackRuntime": RemoteSchemas.schema_36fea325bf1aca70, "prefixes": RemoteSchemas.schema_b84e449d1a150abf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2299af726097d6c = RemoteSchema(type: "object", required: Set(["interests", "type"]), properties: ["interests": RemoteSchemas.schema_f1666190cd652261, "type": RemoteSchemas.schema_9f1edfda198d533d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2613d4b01184321 = RemoteSchema(type: "array", minItems: 1, maxItems: 6, items: RemoteSchemas.schema_236f000609716d3a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d296b974b4bbbdf3 = RemoteSchema(type: "string", literals: [.string("add")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2a18aed5ce077b0 = RemoteSchema(type: "string", literals: [.string("APPROVED"), .string("CHANGES_REQUESTED"), .string("COMMENTED"), .string("DISMISSED"), .string("PENDING")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2a9e452ab6ec4b9 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_c991d95877a4f953, RemoteSchemas.schema_761c60edbc20af3e, RemoteSchemas.schema_c2bfd0a01d71483e, RemoteSchemas.schema_a51e1a467e917554], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2af525e07bad7b1 = RemoteSchema(type: "object", required: Set(["last30d", "last7d", "prev30d", "prev7d", "today", "yesterday"]), properties: ["last30d": RemoteSchemas.schema_f27f5fbb460b4424, "last7d": RemoteSchemas.schema_f27f5fbb460b4424, "prev30d": RemoteSchemas.schema_f27f5fbb460b4424, "prev7d": RemoteSchemas.schema_f27f5fbb460b4424, "today": RemoteSchemas.schema_f27f5fbb460b4424, "windowHours": RemoteSchemas.schema_8d9ba30ef23e1585, "yesterday": RemoteSchemas.schema_f27f5fbb460b4424], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2dd3595e1b5e5dc = RemoteSchema(type: "boolean", literals: [.bool(true)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2ec5bf10f13829b = RemoteSchema(type: "object", properties: ["path": RemoteSchemas.schema_38d1a07d3b9b1c82], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3359b6d5db5b90d = RemoteSchema(type: "string", pattern: "^SHA256:[A-Za-z0-9+/]{43}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3abf2cfac530357 = RemoteSchema(type: "string", maxLength: 2000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3b15874962f1fae = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_a6582272610b7f5d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3ebc3c9a3e4d5bc = RemoteSchema(type: "array", items: RemoteSchemas.schema_4721d11b498e9a74, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d42717fff211bd92 = RemoteSchema(type: "object", required: Set(["id", "threadId"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d42bf49d95c024ab = RemoteSchema(type: "object", required: Set(["message", "threadId", "type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "reason": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4605651dbf9d167 = RemoteSchema(type: "object", required: Set(["episodeToken", "threadId"]), properties: ["episodeToken": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4757acfcddc86a6 = RemoteSchema(type: "string", literals: [.string("network")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d48d13740c8803d4 = RemoteSchema(type: "string", maxLength: 16384, unknownPolicy: .strip, transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_d4a49a3cee60b0ec = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_84503a3e631d0429, RemoteSchemas.schema_93cbcfd8dc76a545, RemoteSchemas.schema_0a0c8726ed2784f3], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4ae5f8c2be25c3f = RemoteSchema(type: "object", required: Set(["history"]), properties: ["history": RemoteSchemas.schema_23b45e35f743c6ce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4db039cbac5831c = RemoteSchema(type: "object", required: Set(["prompt", "threadId"]), properties: ["prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4e60a4c33cd4bbd = RemoteSchema(type: "string", literals: [.string("ai")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d50d16380040f1f2 = RemoteSchema(type: "object", required: Set(["commands", "kind"]), properties: ["commands": RemoteSchemas.schema_174f77d24d01fc57, "kind": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
