// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_29b52750e42441f8 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7e8114c3dda52277, RemoteSchemas.schema_b305c5dcc2d06cc2, RemoteSchemas.schema_f6a941e10f9feb27, RemoteSchemas.schema_38c5e1151393f6bd, RemoteSchemas.schema_3c594c99571d82f9], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_29b593c001751a61 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_eb074c03321e3c7d, RemoteSchemas.schema_2504426b5098e866], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_29dd431b6bfc4cee = RemoteSchema(type: "object", required: Set(["deletedAt", "id", "projectId", "scope"]), properties: ["deletedAt": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_df704162f3d15808, "repoKey": RemoteSchemas.schema_df704162f3d15808, "scope": RemoteSchemas.schema_ac6ea0fc110d7efb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_29fba8fe9f5724e0 = RemoteSchema(type: "object", required: Set(["auth", "p256dh"]), properties: ["auth": RemoteSchemas.schema_36fea325bf1aca70, "p256dh": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a107f95a9dcf216 = RemoteSchema(type: "object", required: Set(["itemId", "removedCompletedTurnAnchors", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "removedCompletedTurnAnchors": RemoteSchemas.schema_0f732b9fceb2c6ac, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9d72555063ba9bd7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a150cae9967732a = RemoteSchema(type: "object", required: Set(["connectionId", "threadId"]), properties: ["connectionId": RemoteSchemas.schema_d855999aed5e6438, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a2641f29ae91ad5 = RemoteSchema(type: "object", required: Set(["extractedAt", "sourceProvider", "sourceSessionId", "summary"]), properties: ["contentKind": RemoteSchemas.schema_5aa9e435f68d585e, "extractedAt": RemoteSchemas.schema_36fea325bf1aca70, "sourceProvider": RemoteSchemas.schema_36fea325bf1aca70, "sourceSessionId": RemoteSchemas.schema_36fea325bf1aca70, "summary": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a43ea36a62fa6ac = RemoteSchema(type: "object", required: Set(["environment", "error", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "error": RemoteSchemas.schema_5cb704413fbdf0b3, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_fd6258ac6546d705, "toolCount": RemoteSchemas.schema_499c88c1c549e934], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a5c67603fdb726c = RemoteSchema(type: "object", properties: ["credentialRef": RemoteSchemas.schema_c223d7ef6abf4cfd, "desired": RemoteSchemas.schema_abff99d05c43ad4c, "label": RemoteSchemas.schema_0c5d3d75e4ff2cec, "port": RemoteSchemas.schema_6db9f33ca9aa8b01, "target": RemoteSchemas.schema_a13200e46be7a2e6], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_2a65cef1bc5905f9 = RemoteSchema(type: "string", literals: [.string("skill")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a7c0f630028ad83 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bfc0c020a52f85b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a8bc62fab6ac143 = RemoteSchema(type: "object", required: Set(["bootstrapMethods", "policy", "scopes", "sessionMethods"]), properties: ["bootstrapMethods": RemoteSchemas.schema_c8aab5b657a17f5e, "policy": RemoteSchemas.schema_995ee3e349270afe, "scopes": RemoteSchemas.schema_515482d2104d1efa, "sessionMethods": RemoteSchemas.schema_07a15b7253b914ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2aeaf8ab36ef2176 = RemoteSchema(type: "object", required: Set(["conditions", "inputs", "maxDepth", "maxInputBytes", "maxItems", "maxNodes", "version"]), properties: ["conditions": RemoteSchemas.schema_7476e0bfbec07d05, "inputs": RemoteSchemas.schema_aa36e30f2962353e, "maxDepth": RemoteSchemas.schema_7aa755d21efd1447, "maxInputBytes": RemoteSchemas.schema_bed38fc7e15d070f, "maxItems": RemoteSchemas.schema_8580fa8375e39340, "maxNodes": RemoteSchemas.schema_1b1b9bdadcd8934d, "version": RemoteSchemas.schema_e6cfd13a746cd290], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b430316258b9c31 = RemoteSchema(type: "object", required: Set(["items", "nextCursor"]), properties: ["historyProjection": RemoteSchemas.schema_72a4409660da2b12, "items": RemoteSchemas.schema_5d3ac76d9a521e1d, "nextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b4ffb830b606cf1 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_feeb8bb50144d96d, RemoteSchemas.schema_bf0b727f7b1c6d07], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b6a5e7f6fb2fbaa = RemoteSchema(type: "object", required: Set(["title"]), properties: ["detail": RemoteSchemas.schema_dfc3f3726c991dbe, "title": RemoteSchemas.schema_3cdb2ff0de916278], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b7595c3da8bc0e9 = RemoteSchema(type: "object", required: Set(["kind", "name", "parentPath"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "name": RemoteSchemas.schema_36fea325bf1aca70, "parentPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b7b34c95b23bb0d = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_3f5bcd72f92b6f9f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b8805d864582a03 = RemoteSchema(type: "object", properties: ["projectIds": RemoteSchemas.schema_324df5fa323e1096, "threadIds": RemoteSchemas.schema_324df5fa323e1096], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b88aa8e662682aa = RemoteSchema(type: "string", minLength: 1, maxLength: 128, pattern: "^[^\\p{Cc}]+$", unknownPolicy: .strip, semanticIds: ["model-provider.id-safe"])
}

public extension RemoteSchemas {
  static let schema_2c0b30d69cd8870d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_75aa7b06238db739, RemoteSchemas.schema_41ffeb2050e1e71c, RemoteSchemas.schema_8906d017ba691d6f, RemoteSchemas.schema_9e169df36e4e41f6], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c0f74a209084782 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["admin": RemoteSchemas.schema_f8b6dd8128e8bfe0, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "method": RemoteSchemas.schema_72373308389f2027, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c10059100ccb9e8 = RemoteSchema(type: "string", literals: [.string("background_tasks.changed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c13d2fc1c3e2e03 = RemoteSchema(type: "string", literals: [.string("disconnected"), .string("connecting"), .string("connected"), .string("error"), .string("credential-missing"), .string("owner-unverified"), .string("identity-changed"), .string("hostkey-mismatch"), .string("needs-repair"), .string("trust-required")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c4b8c74e6940159 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9ec272a8244847ff, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c6061a21fb7aee6 = RemoteSchema(type: "object", required: Set(["durationMs", "endX", "endY", "frameId", "kind", "x", "y"]), properties: ["durationMs": RemoteSchemas.schema_c5c5a6d768bddd81, "endX": RemoteSchemas.schema_5d4b39004bf5c532, "endY": RemoteSchemas.schema_5d4b39004bf5c532, "frameId": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_0cdfc047b0a2e1bb, "x": RemoteSchemas.schema_5d4b39004bf5c532, "y": RemoteSchemas.schema_5d4b39004bf5c532], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_2c6490416fcef343 = RemoteSchema(type: "string", minLength: 1, maxLength: 8192, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c671d62fd5c98a8 = RemoteSchema(type: "string", literals: [.string("boolean")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c93150c89b253f9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_247ec4acb49e6522, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2cc17d220c2ecf6d = RemoteSchema(type: "object", required: Set(["last30d", "last7d", "prev30d", "prev7d", "today", "yesterday"]), properties: ["last30d": RemoteSchemas.schema_745f2435a66ae299, "last7d": RemoteSchemas.schema_745f2435a66ae299, "prev30d": RemoteSchemas.schema_745f2435a66ae299, "prev7d": RemoteSchemas.schema_745f2435a66ae299, "today": RemoteSchemas.schema_745f2435a66ae299, "yesterday": RemoteSchemas.schema_745f2435a66ae299], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2cfe911595ad978d = RemoteSchema(type: "object", required: Set(["fromCursor", "generation", "toCursor", "version", "watchId"]), properties: ["fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_36fea325bf1aca70, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.output-range"])
}

public extension RemoteSchemas {
  static let schema_2d0b6ec9f2b2decf = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d20bc896a08a92b = RemoteSchema(type: "string", minLength: 1, maxLength: 160, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d29c7255e1cf1b1 = RemoteSchema(type: "string", literals: [.string("project")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d2a48957e54670a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_55ee222c096690dc, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d4addb19c77f86e = RemoteSchema(type: "array", items: RemoteSchemas.schema_2ffaeb5a5cd8913c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d52ff1140653b18 = RemoteSchema(type: "string", literals: [.string("oauth"), .string("bearer"), .string("other"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d5efa5a796cb8bd = RemoteSchema(type: "string", literals: [.string("info"), .string("warning"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d677fb04187d46b = RemoteSchema(type: "object", defaultValue: .object(["crossagents": .bool(true)]), additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d8274eae552cc51 = RemoteSchema(type: "string", literals: [.string("wsl")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d862d697d08c085 = RemoteSchema(type: "string", literals: [.string("pause"), .string("resume"), .string("clear")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e20b523bd887c4e = RemoteSchema(type: "object", required: Set(["name"]), properties: ["color": RemoteSchemas.schema_5fbc9d1e0e62e0cb, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e2f445a742056c6 = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e344365c844d4fa = RemoteSchema(type: "object", required: Set(["catalogId", "catalogName", "catalogSource", "digest", "entryName", "formatVersion", "installedAt", "packageSource", "pluginName", "revision"]), properties: ["catalogId": RemoteSchemas.schema_d855999aed5e6438, "catalogName": RemoteSchemas.schema_bf0b727f7b1c6d07, "catalogSource": RemoteSchemas.schema_52056f3d09c28e34, "digest": RemoteSchemas.schema_bf0b727f7b1c6d07, "entryName": RemoteSchemas.schema_84c77ee2ad6c219b, "formatVersion": RemoteSchemas.schema_7f9f5a0d72de0d9a, "installedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "packageSource": RemoteSchemas.schema_c9da5a75bfff1852, "pluginName": RemoteSchemas.schema_84c77ee2ad6c219b, "revision": RemoteSchemas.schema_bf0b727f7b1c6d07, "sourceLicense": RemoteSchemas.schema_1e148960bea02e34], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_2e4d2aaed030369e = RemoteSchema(type: "object", required: Set(["kind", "title"]), properties: ["kind": RemoteSchemas.schema_356ae1fc455ec4c8, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e59da965e611892 = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_f355c9e66a3091a2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e5ddb0a3afed2cb = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_2e68c47efd6e1f9c, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e68c47efd6e1f9c = RemoteSchema(type: "object", required: Set(["capabilities", "forge", "host", "remote", "repository"]), properties: ["account": RemoteSchemas.schema_c2bb40b82b330cd4, "capabilities": RemoteSchemas.schema_3ad15ffc16029f9a, "forge": RemoteSchemas.schema_eaed3cfbf46d5d81, "host": RemoteSchemas.schema_36fea325bf1aca70, "remote": RemoteSchemas.schema_36fea325bf1aca70, "repository": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e6d7dedeb6dc9a6 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "createNew": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2ea26986b7ccb5c4 = RemoteSchema(type: "string", maxLength: 32768, pattern: "^data:image\\/png;base64,[A-Za-z0-9+/]+={0,2}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2eb2bd4b48793b85 = RemoteSchema(type: "string", literals: [.string("0"), .string("1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2ebee6ffa37983f2 = RemoteSchema(type: "object", required: Set(["body", "line", "path", "side"]), properties: ["body": RemoteSchemas.schema_1be16061d2974772, "line": RemoteSchemas.schema_23e05d248383ea40, "path": RemoteSchemas.schema_bd85a52dd25effae, "side": RemoteSchemas.schema_598c25a2e687258b, "startLine": RemoteSchemas.schema_23e05d248383ea40], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f0b42b84f3f48a0 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4dea101cb65656f3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f2654f61b052491 = RemoteSchema(type: "object", required: Set(["agentKind", "model"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "approvalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "browserMcp": RemoteSchemas.schema_feeb8bb50144d96d, "chromeMcp": RemoteSchemas.schema_feeb8bb50144d96d, "computerUse": RemoteSchemas.schema_feeb8bb50144d96d, "contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "crew": RemoteSchemas.schema_46a8742e5750f74f, "crossagentMcp": RemoteSchemas.schema_feeb8bb50144d96d, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "executionEnvironment": RemoteSchemas.schema_4cd2587996458d8d, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "importedFrom": RemoteSchemas.schema_3471186f1398f1d2, "mcpServerOverrides": RemoteSchemas.schema_6db96506f253ef73, "mode": RemoteSchemas.schema_01e21946e943d3eb, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "pluginOverrides": RemoteSchemas.schema_6db96506f253ef73, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "selectionBinding": RemoteSchemas.schema_a11ab76af3bce730, "thinking": RemoteSchemas.schema_feeb8bb50144d96d, "workflows": RemoteSchemas.schema_feeb8bb50144d96d, "worktreeMode": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f3c74eaed971b9f = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_1be5ac91cc4357cb, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f4c1755c2d3a402 = RemoteSchema(type: "object", required: Set(["posix", "windows", "wsl"]), properties: ["posix": RemoteSchemas.schema_4348fdb13264571d, "windows": RemoteSchemas.schema_4348fdb13264571d, "wsl": RemoteSchemas.schema_4348fdb13264571d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f9c33522d9c7c95 = RemoteSchema(type: "string", literals: [.string("plugin")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f9ed801b7a74652 = RemoteSchema(type: "object", required: Set(["projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"]), properties: ["gitState": RemoteSchemas.schema_039d29a220abcf97, "gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "projects": RemoteSchemas.schema_61efa8909f32b55e, "projectsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "snapshotEpoch": RemoteSchemas.schema_8e43cad70cd70de7, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "threads": RemoteSchemas.schema_315e9038603a0581, "threadsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "workspaces": RemoteSchemas.schema_15fcce03de60030d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2fb9be13c54e7688 = RemoteSchema(type: "string", literals: [.string("auth-required"), .string("timeout"), .string("command-not-found"), .string("connection-failed"), .string("protocol-error"), .string("invalid-config"), .string("probe-unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2fbfd962f52fe805 = RemoteSchema(type: "string", literals: [.string("environment/not-found"), .string("environment/revision-conflict"), .string("environment/store-busy"), .string("environment/store-limit"), .string("environment/store-unavailable"), .string("environment/invalid-input"), .string("environment/not-connected"), .string("environment/trust-required"), .string("environment/trust-changed"), .string("environment/trust-mismatch"), .string("environment/hostkey-mismatch"), .string("environment/identity-changed"), .string("environment/credential-missing"), .string("environment/owner-unverified"), .string("environment/owner-unresponsive"), .string("environment/owner-incompatible"), .string("environment/owner-busy"), .string("environment/owner-conflict"), .string("environment/launch-failed"), .string("environment/upgrade-unavailable"), .string("environment/upgrade-refused"), .string("environment/transport-error"), .string("environment/cancelled"), .string("environment/internal-error"), .string("environment/not-authorized")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2fc59eb755b48806 = RemoteSchema(type: "object", required: Set(["createdAt", "rationale", "source", "threadId"]), properties: ["assessments": RemoteSchemas.schema_0dc750244bb89d0c, "comparisonMode": RemoteSchemas.schema_1124eb24dd0748ff, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "modelLabel": RemoteSchemas.schema_36fea325bf1aca70, "rationale": RemoteSchemas.schema_36fea325bf1aca70, "snapshotHash": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_d4e60a4c33cd4bbd, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2ffaeb5a5cd8913c = RemoteSchema(type: "object", required: Set(["entries", "id", "name", "refreshedAt", "revision", "source"]), properties: ["entries": RemoteSchemas.schema_40deb443901075c6, "id": RemoteSchemas.schema_d855999aed5e6438, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "refreshedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "revision": RemoteSchemas.schema_bf0b727f7b1c6d07, "source": RemoteSchemas.schema_52056f3d09c28e34], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_30057dd734d040ce = RemoteSchema(type: "array", maxItems: 32, items: RemoteSchemas.schema_7d62681c6488867d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3008927746cc013b = RemoteSchema(type: "array", items: RemoteSchemas.schema_1b3dc298a6f3cf15, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_302783bd5327b877 = RemoteSchema(type: "array", items: RemoteSchemas.schema_f2bb61aa3bb8d258, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_303343fe11e1bb4f = RemoteSchema(type: "integer", minimum: 0.0, maximum: 64.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30397dadf4fa88f8 = RemoteSchema(type: "string", literals: [.string("local")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_304430ceb5560696 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d4a49a3cee60b0ec, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30a537a9343bcdf7 = RemoteSchema(type: "string", literals: [.string("file_change")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30ad8803c938c252 = RemoteSchema(type: "object", required: Set(["failed", "tool"]), properties: ["failed": RemoteSchemas.schema_feeb8bb50144d96d, "tool": RemoteSchemas.schema_cc277bf688b969d1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30b422e470a61b28 = RemoteSchema(type: "object", required: Set(["projectLocation", "workflowId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "ref": RemoteSchemas.schema_36fea325bf1aca70, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30cc89214bd9dffb = RemoteSchema(type: "string", minLength: 1, maxLength: 50000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_3120d80990432c9a = RemoteSchema(type: "string", literals: [.string("sse")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_312483d60c5a264f = RemoteSchema(type: "object", required: Set(["actions", "bootId", "version"]), properties: ["actions": RemoteSchemas.schema_d3b15874962f1fae, "bootId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_313744588ce712ec = RemoteSchema(type: "object", required: Set(["action", "id"]), properties: ["action": RemoteSchemas.schema_79cc8fd8772975d2, "id": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3155b0e8649e47af = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cd124b21d98c4aa2, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_315e9038603a0581 = RemoteSchema(type: "array", items: RemoteSchemas.schema_b37f60804aab420f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3224b2661089874d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e105701b122113cd, RemoteSchemas.schema_c3a4dfd6503d3858, RemoteSchemas.schema_f252df24b49da178], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_324df5fa323e1096 = RemoteSchema(type: "array", maxItems: 200, items: RemoteSchemas.schema_85c1db78d5c7dc29, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32519102603d95d6 = RemoteSchema(type: "string", literals: [.string("label")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3264c4f1e6231fa5 = RemoteSchema(type: "object", required: Set(["prompts", "truncated"]), properties: ["prompts": RemoteSchemas.schema_8103b4e6f4958c4c, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32773ce5899289ad = RemoteSchema(type: "string", literals: [.string("authorized")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32b2db2eaac8458c = RemoteSchema(type: "string", literals: [.string("command"), .string("other")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32c3720f649f40a1 = RemoteSchema(type: "object", required: Set(["model"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "selectionBinding": RemoteSchemas.schema_a11ab76af3bce730, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_32e268a4ad7c1c3d = RemoteSchema(type: "object", required: Set(["forwardId"]), properties: ["forwardId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32e823c3d8c4b6d8 = RemoteSchema(type: "string", literals: [.string("import-session")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_33250cfe650a4571 = RemoteSchema(type: "object", required: Set(["id", "name"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3328521e00056564 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_0138c350a16e9103, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_336de6f9a14e1623 = RemoteSchema(type: "string", literals: [.string("list"), .string("remove")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_338293a42e7115a2 = RemoteSchema(type: "object", required: Set(["server"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "server": RemoteSchemas.schema_c04b1452d18edb3f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_339dd50c84bc91c2 = RemoteSchema(type: "object", required: Set(["action", "app", "requestId", "threadId"]), properties: ["action": RemoteSchemas.schema_8c2d417de56bf72a, "app": RemoteSchemas.schema_b313ad72a5d78585, "requestId": RemoteSchemas.schema_d855999aed5e6438, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_33c56fa54b24233a = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "rebase": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_340c8f8b68b6e2b5 = RemoteSchema(type: "array", maxItems: 50, items: RemoteSchemas.schema_9bc1c08248602f5c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_34136f63df3d4c70 = RemoteSchema(type: "object", properties: ["description": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "nativePluginName": RemoteSchemas.schema_36fea325bf1aca70, "nativeSkill": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_343472a6ca61672a = RemoteSchema(type: "object", required: Set(["disabledMcpServerNames", "disabledSkillIds", "enabled", "version"]), properties: ["disabledMcpServerNames": RemoteSchemas.schema_242a5ef77d1f8924, "disabledSkillIds": RemoteSchemas.schema_242a5ef77d1f8924, "enabled": RemoteSchemas.schema_a6ba34cd39bf30c5, "version": RemoteSchemas.schema_362e75234d94c7e4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3466b9b69cc5e0cc = RemoteSchema(type: "string", literals: [.string("ok"), .string("auth-missing"), .string("app-not-running"), .string("rate-limited"), .string("quota-hit"), .string("unsupported"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3471186f1398f1d2 = RemoteSchema(type: "object", required: Set(["importedAt", "path"]), properties: ["importedAt": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_348882537c48186f = RemoteSchema(type: "object", required: Set(["body", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_36fea325bf1aca70, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_350a19ed30bb6b81 = RemoteSchema(type: "object", required: Set(["events"]), properties: ["events": RemoteSchemas.schema_23b45e35f743c6ce, "itemPresentations": RemoteSchemas.schema_ef4fe17bb351986a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3512bd687eb85e90 = RemoteSchema(type: "string", literals: [.string("before"), .string("after")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_356ae1fc455ec4c8 = RemoteSchema(type: "string", literals: [.string("rename")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_35962a43ae5cecce = RemoteSchema(type: "string", literals: [.string("pending"), .string("completed"), .string("noop")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_35c107fafb96bccf = RemoteSchema(type: "string", literals: [.string("home"), .string("back"), .string("enter"), .string("backspace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3615f9310cd4ee9d = RemoteSchema(type: "array", items: RemoteSchemas.schema_378174642bf763b3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_362e75234d94c7e4 = RemoteSchema(type: "string", defaultValue: .string("0.0.0"), minLength: 1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_369773f70316d070 = RemoteSchema(type: "object", required: Set(["effort", "fast"]), properties: ["effort": RemoteSchemas.schema_b6a98d4e6efc4f4c, "fast": RemoteSchemas.schema_b6a98d4e6efc4f4c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36a14ea6cf3d0316 = RemoteSchema(type: "object", properties: ["cacheRead": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite": RemoteSchemas.schema_f696f11685898ba7, "input": RemoteSchemas.schema_f696f11685898ba7, "output": RemoteSchemas.schema_f696f11685898ba7, "period": RemoteSchemas.schema_776626d20373881d, "total": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36b9fe91ec45bcd5 = RemoteSchema(type: "string", literals: [.string("select")], unknownPolicy: .strip)
}
