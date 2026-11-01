// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_bb479bc5848b9f45 = RemoteSchema(type: "string", literals: [.string("skip"), .string("coalesce"), .string("run-latest")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb755d8d8c6227a7 = RemoteSchema(type: "object", required: Set(["previewId"]), properties: ["device": RemoteSchemas.schema_97d85a5eaee82b97, "previewId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_bbe83548253a93f1 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4181643f21dc7757, unknownPolicy: .strip)
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

public extension RemoteSchemas {
  static let schema_bd96f28e94e5dff9 = RemoteSchema(type: "string", literals: [.string("redirect")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd9ee7d62499d1b2 = RemoteSchema(type: "string", literals: [.string("launchApp")], unknownPolicy: .strip)
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
  static let schema_be5d5f9829abefd6 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip, semanticIds: ["schedule.time-zone", "string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_bea1bdef18933d97 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_d92866345cd97821, RemoteSchemas.schema_8ace86d01d0cc126, RemoteSchemas.schema_2a43ea36a62fa6ac], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bed6045a82af5337 = RemoteSchema(type: "object", required: Set(["updatedAt", "windows", "wsl"]), properties: ["updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "windows": RemoteSchemas.schema_b85a0330160a5a75, "wsl": RemoteSchemas.schema_b85a0330160a5a75], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf0b727f7b1c6d07 = RemoteSchema(type: "string", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf3a4ed0e5798352 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7a4831c3c01cfb91, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf4561eb7adf4d72 = RemoteSchema(type: "integer", minimum: 2.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf61c597568a8798 = RemoteSchema(type: "object", required: Set(["comments", "id", "isOutdated", "isResolved"]), properties: ["comments": RemoteSchemas.schema_ac3d09b5c7f361d2, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isOutdated": RemoteSchemas.schema_feeb8bb50144d96d, "isResolved": RemoteSchemas.schema_feeb8bb50144d96d, "line": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "side": RemoteSchemas.schema_7d62681c6488867d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bfc0c020a52f85b3 = RemoteSchema(type: "string", defaultValue: .string("origin"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c028422c57a7c557 = RemoteSchema(type: "string", literals: [.string("none")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c04b1452d18edb3f = RemoteSchema(type: "object", required: Set(["id", "name", "transport"]), properties: ["description": RemoteSchemas.schema_38d1a07d3b9b1c82, "disabledTools": RemoteSchemas.schema_515482d2104d1efa, "enabled": RemoteSchemas.schema_a6ba34cd39bf30c5, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_1da6db5f13bd36e1, "transport": RemoteSchemas.schema_0e40f389d72655d0], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.reserved-name"])
}

public extension RemoteSchemas {
  static let schema_c052748939bdd575 = RemoteSchema(type: "array", minItems: 1, maxItems: 8, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
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
  static let schema_c0edab91e2f5d96e = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_cd6770504afebb5a, "problem": RemoteSchemas.schema_6ef72b13e31a5a70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1094a243b47f83c = RemoteSchema(type: "object", required: Set(["cells", "max", "metric", "windowDays"]), properties: ["cells": RemoteSchemas.schema_08654ec33ed5db02, "max": RemoteSchemas.schema_56aa0e45cbdce0d0, "metric": RemoteSchemas.schema_b7f9b9a51ee842c4, "windowDays": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c133c6f7b7129d49 = RemoteSchema(type: "object", required: Set(["candidateDisposition", "kind", "revision"]), properties: ["candidateDisposition": RemoteSchemas.schema_60232db9c637a046, "kind": RemoteSchemas.schema_034741cb26a53fe4, "revision": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1417bffe520aa1c = RemoteSchema(type: "object", properties: ["mcpServers": RemoteSchemas.schema_86b938ce61c1942e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1504401bd291fd1 = RemoteSchema(type: "string", minLength: 1, maxLength: 4096, pattern: "^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s]+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1862c8cf975e3dc = RemoteSchema(type: "string", maxLength: 3145728, pattern: "^data:image\\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c18ccc2aa36fdad0 = RemoteSchema(type: "object", required: Set(["policy", "roles", "version"]), properties: ["crewId": RemoteSchemas.schema_7d62681c6488867d, "name": RemoteSchemas.schema_eef7e0a1ed6691c0, "policy": RemoteSchemas.schema_5e585becfdaebc00, "roles": RemoteSchemas.schema_5994d84d0d782ee0, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_c223d7ef6abf4cfd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_e301e52cd3d3ea46, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c263982707afed92 = RemoteSchema(type: "string", literals: [.string("percent"), .string("tokens"), .string("requests"), .string("credits"), .string("usd")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c26b952dfa583dcd = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "title"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_281d24bbbaa46745, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_1f4518886240126e, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c286f4704a09cde8 = RemoteSchema(type: "array", maxItems: 100, items: RemoteSchemas.schema_2e59da965e611892, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c288e6607451a3b8 = RemoteSchema(type: "object", required: Set(["versions"]), properties: ["livePreview": RemoteSchemas.schema_8b16df449d9a1954, "versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2894654f12fb350 = RemoteSchema(type: "string", literals: [.string("browser-frame")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2956fa26ec0467c = RemoteSchema(type: "object", required: Set(["content", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "reacted"]), properties: ["content": RemoteSchemas.schema_7d62681c6488867d, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "reacted": RemoteSchemas.schema_feeb8bb50144d96d, "subjectId": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c297cb4b3fffa0b1 = RemoteSchema(type: "string", literals: [.string("job")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2b3b7b2742027d9 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "project": RemoteSchemas.schema_37cd292a9ef1a3c6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2bb40b82b330cd4 = RemoteSchema(type: "object", required: Set(["forge", "host", "login"]), properties: ["forge": RemoteSchemas.schema_eaed3cfbf46d5d81, "host": RemoteSchemas.schema_2365fa95161a3294, "login": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2e8606952666d2c = RemoteSchema(type: "array", items: RemoteSchemas.schema_6bb6e13415c8cbba, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c30da54b853babca = RemoteSchema(type: "object", required: Set(["label", "percent", "provider", "tokens"]), properties: ["estimatedCostUsd": RemoteSchemas.schema_80c415b6e27c6ebd, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "provider": RemoteSchemas.schema_bf0b727f7b1c6d07, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3363423bb669510 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_4ec1299a984102e2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c33d76cdf9c7d5d7 = RemoteSchema(type: "object", required: Set(["agentKind", "model"]), properties: ["agentKind": RemoteSchemas.schema_8e43cad70cd70de7, "contextSize": RemoteSchemas.schema_7d62681c6488867d, "effort": RemoteSchemas.schema_7d62681c6488867d, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c37d7c3aee05c236 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_6ddf4b7dc1e0e9e2, RemoteSchemas.schema_2c6061a21fb7aee6, RemoteSchemas.schema_8c04d0a06a161126, RemoteSchemas.schema_83384e1a092392f6, RemoteSchemas.schema_a36830c34a81f248, RemoteSchemas.schema_0b2ba27512e423eb], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c39ba2db208f4f7c = RemoteSchema(type: "string", literals: [.string("activate-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3a4dfd6503d3858 = RemoteSchema(type: "object", required: Set(["notice", "outcome"]), properties: ["notice": RemoteSchemas.schema_1468dfe9a2db9c9d, "outcome": RemoteSchemas.schema_552de755ef856a71], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3ac2139868061bb = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c408d3b67402af90 = RemoteSchema(type: "string", literals: [.string("finish")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4197e46f3baa871 = RemoteSchema(type: "string", literals: [.string("terminal")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c44733d5a3f1db00 = RemoteSchema(type: "array", items: RemoteSchemas.schema_efedb06a4d7088a5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4921dbeb36e2b97 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e510e581c4f8b523, RemoteSchemas.schema_77c71c73158736b6], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4ad1400e2e98f57 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["limit": RemoteSchemas.schema_039b848cf1c1ad6c, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "query": RemoteSchemas.schema_38d1a07d3b9b1c82, "searchConfig": RemoteSchemas.schema_cbf78da83a6846d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4d99dd3e3a1ba03 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["detail": RemoteSchemas.schema_15cae388d0cdd5b6, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c51ef8291e597045 = RemoteSchema(type: "object", properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c52c624815ab6ea5 = RemoteSchema(type: "object", required: Set(["archived", "excerpt", "itemId", "projectId", "projectName", "role", "threadId", "title"]), properties: ["archived": RemoteSchemas.schema_feeb8bb50144d96d, "excerpt": RemoteSchemas.schema_ff3b9b0284fcd244, "itemId": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "projectName": RemoteSchemas.schema_e78f40fc5399f7f1, "role": RemoteSchemas.schema_ff05783d57039aa1, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_f7ecfe1017b42566], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c533fb875972ec60 = RemoteSchema(type: "object", required: Set(["result", "version", "watchId"]), properties: ["result": RemoteSchemas.schema_80f7976aee3c4505, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c55a346c739cb16c = RemoteSchema(type: "object", required: Set(["itemId", "payload", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9189c3f251645aa9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c591e31c389e744f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_160c1ab9b7f11a56, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5a10234205e6cd2 = RemoteSchema(type: "array", items: RemoteSchemas.schema_20d7b1e748f886c3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5a25a432208abbf = RemoteSchema(type: "string", literals: [.string("appearance")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c17f76a21e5ff1 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c2ecebbae5cd01 = RemoteSchema(type: "object", required: Set(["modifiedAtMs"]), properties: ["modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c5a6d768bddd81 = RemoteSchema(type: "integer", minimum: 100.0, maximum: 2000.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5efb303b347362f = RemoteSchema(type: "string", literals: [.string("running"), .string("decided")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c62b342ed89c5809 = RemoteSchema(type: "string", literals: [.string("applied")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c641a5324383dc1b = RemoteSchema(type: "object", properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "crews": RemoteSchemas.schema_91181085efd88304, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_79608b5eceb792fe, "enabledMcpServers": RemoteSchemas.schema_cda18ebe4af54c5c, "experimentJudgeSelection": RemoteSchemas.schema_32c3720f649f40a1, "followUpBehavior": RemoteSchemas.schema_49162371ff415b49, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "usage": RemoteSchemas.schema_b6aaa17d322b8355, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_c6ebfd6404db800a = RemoteSchema(type: "object", properties: ["disabled": RemoteSchemas.schema_feeb8bb50144d96d, "ghAccount": RemoteSchemas.schema_eb2798e2ccc8bf65, "icon": RemoteSchemas.schema_df704162f3d15808, "mcpServers": RemoteSchemas.schema_637f685cb2418b8c, "name": RemoteSchemas.schema_36fea325bf1aca70, "pinnedBranches": RemoteSchemas.schema_f26d9689fe341b94, "scripts": RemoteSchemas.schema_3155b0e8649e47af, "searchSettings": RemoteSchemas.schema_3e412d7b328b3f5a, "worktreeBaseBranch": RemoteSchemas.schema_df704162f3d15808, "worktreeLocation": RemoteSchemas.schema_137e14636e0bc235], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_c975fc7daa5c30b3 = RemoteSchema(type: "string", literals: [.string("pull-request")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c9a954a3af7049b0 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("gui")], defaultValue: .string("terminal"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca0c8b8a7fbb7b5d = RemoteSchema(type: "object", required: Set(["type", "version"]), properties: ["type": RemoteSchemas.schema_518b8374aca2de65, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca3d163bab055381 = RemoteSchema(unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca5f8d6782ca9f6b = RemoteSchema(type: "object", required: Set(["data", "fromCursor", "generation", "processState", "terminalSize", "toCursor"]), properties: ["data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_2d0b6ec9f2b2decf, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_cb2e3d3519422e78 = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["deleteBranch": RemoteSchemas.schema_f8b6dd8128e8bfe0, "expectedBranch": RemoteSchemas.schema_36fea325bf1aca70, "expectedOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "force": RemoteSchemas.schema_f8b6dd8128e8bfe0, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["git.remove-worktree.owner-requires-branch"])
}

public extension RemoteSchemas {
  static let schema_cb34d50832b1e60d = RemoteSchema(type: "string", literals: [.string("http"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb81a9dbb81a1a63 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("server")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb95bf43ec62db01 = RemoteSchema(type: "object", required: Set(["author", "body", "createdAt", "id"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "reactions": RemoteSchemas.schema_45e52f032f196485, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbad4936b49ad671 = RemoteSchema(type: "array", items: RemoteSchemas.schema_da546ba4a0601e6e, unknownPolicy: .strip)
}
