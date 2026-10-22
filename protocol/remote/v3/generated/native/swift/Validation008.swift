// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_8971fe1e2b13c08e = RemoteSchema(type: "object", required: Set(["version"]), properties: ["appearance": RemoteSchemas.schema_9ea58f9bfc61ade7, "fontScale": RemoteSchemas.schema_debc0ac62b48b9e2, "networkEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "reduceMotion": RemoteSchemas.schema_feeb8bb50144d96d, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89a32138dca165c4 = RemoteSchema(type: "object", required: Set(["authorizationUrl", "flowId", "status"]), properties: ["authorizationUrl": RemoteSchemas.schema_36fea325bf1aca70, "flowId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_bd96f28e94e5dff9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89bc4017c2e23cd6 = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_034741cb26a53fe4, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89c223893a706cf8 = RemoteSchema(type: "string", minLength: 1, maxLength: 1000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_8a0ca790b0047a5e = RemoteSchema(type: "object", required: Set(["definition"]), properties: ["definition": RemoteSchemas.schema_02179e6a4b6545d5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8a62b43ffe3b4668 = RemoteSchema(type: "object", required: Set(["skills"]), properties: ["skills": RemoteSchemas.schema_3cc2bb39a7445b48], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ab3ef50febb54d1 = RemoteSchema(type: "object", required: Set(["id", "name", "type"]), properties: ["args": RemoteSchemas.schema_0f732b9fceb2c6ac, "description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "env": RemoteSchemas.schema_e51d77fd6734b53a, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c4197e46f3baa871], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ace86d01d0cc126 = RemoteSchema(type: "object", required: Set(["environment", "error", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "error": RemoteSchemas.schema_f145218b6dee66b6, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_e527c3ee29cd639b, "toolCount": RemoteSchemas.schema_499c88c1c549e934], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b16df449d9a1954 = RemoteSchema(type: "object", required: Set(["modes", "versions"]), properties: ["modes": RemoteSchemas.schema_c052748939bdd575, "versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b1889f3513fe2b3 = RemoteSchema(type: "object", required: Set(["command"]), properties: ["argumentSubcommands": RemoteSchemas.schema_515482d2104d1efa, "command": RemoteSchemas.schema_36fea325bf1aca70, "controlArguments": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b5062dd3eaae277 = RemoteSchema(type: "object", required: Set(["agentKind", "archived", "attention", "canResumeWithConfig", "config", "createdAt", "done", "id", "projectId", "starred", "status", "title", "updatedAt"]), properties: ["activeTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "additionalDirectories": RemoteSchemas.schema_98d52bd55e800515, "agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "archived": RemoteSchemas.schema_f8b6dd8128e8bfe0, "archivedAt": RemoteSchemas.schema_36fea325bf1aca70, "attention": RemoteSchemas.schema_58edfaf9f73b8db4, "canResumeWithConfig": RemoteSchemas.schema_f8b6dd8128e8bfe0, "config": RemoteSchemas.schema_77c646d1a00c89a5, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "done": RemoteSchemas.schema_f8b6dd8128e8bfe0, "doneAt": RemoteSchemas.schema_36fea325bf1aca70, "errorMessage": RemoteSchemas.schema_bf0b727f7b1c6d07, "forkedFrom": RemoteSchemas.schema_8edde8b52fa98394, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "interruptedTurn": RemoteSchemas.schema_2127b6212a816df5, "lastTurnEndedAt": RemoteSchemas.schema_36fea325bf1aca70, "lastTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "sessionConfigOptions": RemoteSchemas.schema_9b050dd4848ae8c2, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "starred": RemoteSchemas.schema_f8b6dd8128e8bfe0, "status": RemoteSchemas.schema_8c61ed237d0ab3d0, "threadStatusSource": RemoteSchemas.schema_8f739487924008df, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "workspaceGrantRevision": RemoteSchemas.schema_56aa0e45cbdce0d0, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b52512d7a324001 = RemoteSchema(type: "object", required: Set(["projectId", "worktreePaths"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b72b09d5cbe1e7f = RemoteSchema(type: "object", required: Set(["distro", "kind", "linuxPath", "uncPath"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2d8274eae552cc51, "linuxPath": RemoteSchemas.schema_bd85a52dd25effae, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "uncPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8bcac1a2041bc3a6 = RemoteSchema(type: "object", required: Set(["previewId", "version"]), properties: ["previewId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_8be22931a515cd6d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_7ac92dcb7485437b, RemoteSchemas.schema_455b16a806252fd5, RemoteSchemas.schema_e7cab2d2c052144f, RemoteSchemas.schema_09f700fdeb3e5213], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8be56eea0793828f = RemoteSchema(type: "array", items: RemoteSchemas.schema_7efa4de89a4475c8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c04d0a06a161126 = RemoteSchema(type: "object", required: Set(["kind", "text"]), properties: ["kind": RemoteSchemas.schema_3ad514880db80c82, "text": RemoteSchemas.schema_5ae95e3b3c8a9ee1], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_8c20a3e2d150dfcf = RemoteSchema(type: "object", required: Set(["tabId"]), properties: ["tabId": RemoteSchemas.schema_56aa0e45cbdce0d0, "title": RemoteSchemas.schema_f7ecfe1017b42566, "url": RemoteSchemas.schema_a5af9fa380f11a11], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c61ed237d0ab3d0 = RemoteSchema(type: "string", literals: [.string("inactive"), .string("launching"), .string("working"), .string("idle"), .string("finished"), .string("needs_approval"), .string("needs_reply"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c71be0e7fdf9e1a = RemoteSchema(type: "array", items: RemoteSchemas.schema_9137d8707520f367, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ca5860ab0ec6478 = RemoteSchema(type: "object", required: Set(["cacheRead", "cacheWrite", "cacheWrite1h", "effectiveFrom", "id", "input", "model", "output", "reviewedAt", "source"]), properties: ["cacheRead": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite1h": RemoteSchemas.schema_f696f11685898ba7, "effectiveFrom": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "input": RemoteSchemas.schema_f696f11685898ba7, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "output": RemoteSchemas.schema_f696f11685898ba7, "reviewedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "source": RemoteSchemas.schema_6bb6e13415c8cbba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8cdebfa85eb53602 = RemoteSchema(type: "object", required: Set(["filter"]), properties: ["cursor": RemoteSchemas.schema_5e8c2bfac4c6fcc6, "filter": RemoteSchemas.schema_479fd2dce7e64e29, "limit": RemoteSchemas.schema_f9e7f90793023053, "search": RemoteSchemas.schema_e5bbd3e940039349], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d017de5d26dce37 = RemoteSchema(type: "array", items: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
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
  static let schema_8e43cad70cd70de7 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e79bc80a7c7760e = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_da2f0b0d5664d736, RemoteSchemas.schema_aafcd63530265fa8, RemoteSchemas.schema_c133c6f7b7129d49], unknownPolicy: .strip)
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
  static let schema_9063020a6c5ad8b3 = RemoteSchema(type: "string", literals: [.string("navigate")], unknownPolicy: .strip)
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
  static let schema_9199b6e9ea61b83e = RemoteSchema(type: "object", required: Set(["comments", "id", "isOutdated", "isResolved"]), properties: ["comments": RemoteSchemas.schema_971eac5c1ec68beb, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isOutdated": RemoteSchemas.schema_feeb8bb50144d96d, "isResolved": RemoteSchemas.schema_feeb8bb50144d96d, "line": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_94bbf8938b241fc1 = RemoteSchema(type: "object", required: Set(["kind", "lastDraftConfig", "projectId"]), properties: ["kind": RemoteSchemas.schema_93f8fa8787f246fe, "lastDraftConfig": RemoteSchemas.schema_3858e9d5efa1ed03, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_953c573b196de65a = RemoteSchema(type: "string", literals: [.string("global"), .string("project-relative")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_956459f749459347 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["entryType": RemoteSchemas.schema_8d3732b59a0dd026, "limit": RemoteSchemas.schema_039b848cf1c1ad6c, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "query": RemoteSchemas.schema_38d1a07d3b9b1c82, "searchConfig": RemoteSchemas.schema_cbf78da83a6846d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9567576693bf6845 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_241bff8fc91fc9b5, RemoteSchemas.schema_4bc21f7698ec2e7b], unknownPolicy: .strip)
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
  static let schema_971eac5c1ec68beb = RemoteSchema(type: "array", items: RemoteSchemas.schema_839da5c7aa9ba993, unknownPolicy: .strip)
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
  static let schema_98c9ef3e406d69bf = RemoteSchema(type: "object", required: Set(["deviceId", "platform"]), properties: ["activityTokens": RemoteSchemas.schema_b84e449d1a150abf, "alertPreferences": RemoteSchemas.schema_0534fb6201293569, "appVersion": RemoteSchemas.schema_36fea325bf1aca70, "deviceId": RemoteSchemas.schema_212ab189f2321de4, "deviceToken": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_41d0cf68976485ec, "pushToStartToken": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2, "webAppBasePath": RemoteSchemas.schema_25a3e0b2a9eecdfb, "webPushSubscription": RemoteSchemas.schema_fd8574a70c8187db], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["push.registration.platform-fields"])
}

public extension RemoteSchemas {
  static let schema_98d52bd55e800515 = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_137445efd1582c7a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98ef330d70f2e681 = RemoteSchema(type: "object", required: Set(["data", "version"]), properties: ["data": RemoteSchemas.schema_ca3d163bab055381, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_9bdd26dd832b19ef = RemoteSchema(type: "object", required: Set(["kind", "patch", "projectId"]), properties: ["kind": RemoteSchemas.schema_cbc64d14585e9a92, "patch": RemoteSchemas.schema_cadb9042bbcd8536, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9be4e34050076f08 = RemoteSchema(type: "object", required: Set(["autoUpdate", "browserPanel", "chromeBridge", "computerUse", "nativeSecrets", "osNotifications", "portForward", "ssh"]), properties: ["autoUpdate": RemoteSchemas.schema_f8b6dd8128e8bfe0, "browserPanel": RemoteSchemas.schema_f8b6dd8128e8bfe0, "chromeBridge": RemoteSchemas.schema_f8b6dd8128e8bfe0, "computerUse": RemoteSchemas.schema_f8b6dd8128e8bfe0, "nativeSecrets": RemoteSchemas.schema_f8b6dd8128e8bfe0, "osNotifications": RemoteSchemas.schema_f8b6dd8128e8bfe0, "portForward": RemoteSchemas.schema_f8b6dd8128e8bfe0, "ssh": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_9c01de6b080eca40 = RemoteSchema(type: "string", literals: [.string("merge"), .string("squash"), .string("rebase")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c44204b656290c2 = RemoteSchema(type: "object", required: Set(["default", "description", "envVar", "key", "label", "options", "type"]), properties: ["default": RemoteSchemas.schema_bf0b727f7b1c6d07, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "envVar": RemoteSchemas.schema_36fea325bf1aca70, "key": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_d0b10c04efa78c87, "platforms": RemoteSchemas.schema_0f732b9fceb2c6ac, "type": RemoteSchemas.schema_36b9fe91ec45bcd5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c63009f65a656d2 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_77c646d1a00c89a5, "numTurns": RemoteSchemas.schema_56aa0e45cbdce0d0, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
