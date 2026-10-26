// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_25e47114d380c1fb = RemoteSchema(type: "string", literals: [.string("thread-item-interests")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_262f4ae53753f0fb = RemoteSchema(type: "string", literals: [.string("image/jpeg")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26b6bf09ccab2775 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_dc69d1c3f1fc465e, RemoteSchemas.schema_c1a108aae42275ff, RemoteSchemas.schema_02f5d10d12c9f077], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26c275b82ebc010d = RemoteSchema(type: "array", items: RemoteSchemas.schema_bc6c91ba1621863d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26cfea8cde59ada2 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["directoryPath": RemoteSchemas.schema_38d1a07d3b9b1c82, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26f96950d20651b3 = RemoteSchema(type: "object", required: Set(["id", "label", "platform"]), properties: ["id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "lastActiveAt": RemoteSchemas.schema_3d06117798bf5171, "platform": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_274e069cdc933ee1 = RemoteSchema(type: "string", literals: [.string("oauth-status")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_275476f9b6055811 = RemoteSchema(type: "object", required: Set(["repos"]), properties: ["repos": RemoteSchemas.schema_75b702ed8c9f54ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2778fa8937ac1709 = RemoteSchema(type: "object", required: Set(["threadId", "type"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_b7ac3adaa07b7aa4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2798cb9d2dca7539 = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_3d1908a6bccf4864, "result": RemoteSchemas.schema_6a2d40d38c4527c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_279eee1efa9da6c8 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 65535.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_27aa97567424846c = RemoteSchema(type: "object", required: Set(["kind", "path", "projectId"]), properties: ["kind": RemoteSchemas.schema_88444d52d400622b, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_27d9340da4120b27 = RemoteSchema(type: "object", required: Set(["rationale", "threadId"]), properties: ["rationale": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_280719966e4ed3aa = RemoteSchema(type: "object", required: Set(["maxActiveAgentSessions", "maxActiveGenerationHelpers", "maxActiveTerminalShells", "overloadRetryAfterMs"]), properties: ["maxActiveAgentSessions": RemoteSchemas.schema_56aa0e45cbdce0d0, "maxActiveGenerationHelpers": RemoteSchemas.schema_56aa0e45cbdce0d0, "maxActiveTerminalShells": RemoteSchemas.schema_56aa0e45cbdce0d0, "overloadRetryAfterMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "refuseNewStarts": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_280ab70e288f77f7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_38754692c8b5ebef, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2840caeaedca16a2 = RemoteSchema(type: "object", required: Set(["thinking"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_2843e0996b9986e5 = RemoteSchema(type: "object", required: Set(["capabilities"]), properties: ["capabilities": RemoteSchemas.schema_9be4e34050076f08], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_28ab5341451545c8 = RemoteSchema(type: "string", literals: [.string("desktop"), .string("mobile"), .string("tablet"), .string("browser"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_28b9eff1da2232c5 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_97d27c4efa52f52a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_290453f28a433311 = RemoteSchema(type: "object", required: Set(["kind", "tabId", "url"]), properties: ["kind": RemoteSchemas.schema_9063020a6c5ad8b3, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_291e0a286efaf880 = RemoteSchema(type: "object", required: Set(["channel", "previewId", "version"]), properties: ["channel": RemoteSchemas.schema_3c702b70b3eb4220, "previewId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_294ca0c3f20bda2e = RemoteSchema(type: "object", required: Set(["description", "httpsUrl", "isFork", "isPrivate", "name", "nameWithOwner", "owner", "pushedAt", "sshUrl"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "httpsUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "isFork": RemoteSchemas.schema_feeb8bb50144d96d, "isPrivate": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "nameWithOwner": RemoteSchemas.schema_bf0b727f7b1c6d07, "owner": RemoteSchemas.schema_bf0b727f7b1c6d07, "pushedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "sshUrl": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_29b52750e42441f8 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7e8114c3dda52277, RemoteSchemas.schema_b305c5dcc2d06cc2, RemoteSchemas.schema_f6a941e10f9feb27, RemoteSchemas.schema_38c5e1151393f6bd, RemoteSchemas.schema_3c594c99571d82f9], unknownPolicy: .strip)
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
  static let schema_2b430316258b9c31 = RemoteSchema(type: "object", required: Set(["items", "nextCursor"]), properties: ["historyProjection": RemoteSchemas.schema_72a4409660da2b12, "items": RemoteSchemas.schema_5d3ac76d9a521e1d, "nextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b4ffb830b606cf1 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_feeb8bb50144d96d, RemoteSchemas.schema_bf0b727f7b1c6d07], unknownPolicy: .strip)
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
  static let schema_2c09020b157316f2 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9751de90fd8644d6, unknownPolicy: .strip)
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
  static let schema_2c19dd5367fc67fa = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_468209f9bb01c8a9, RemoteSchemas.schema_2b7595c3da8bc0e9, RemoteSchemas.schema_da66851500474562, RemoteSchemas.schema_9bdd26dd832b19ef, RemoteSchemas.schema_27aa97567424846c, RemoteSchemas.schema_37addcca5b32752c, RemoteSchemas.schema_580efa06e9547a64, RemoteSchemas.schema_ebfa6f1c64210a5f, RemoteSchemas.schema_94bbf8938b241fc1], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c4b8c74e6940159 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9ec272a8244847ff, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c6061a21fb7aee6 = RemoteSchema(type: "object", required: Set(["durationMs", "endX", "endY", "frameId", "kind", "x", "y"]), properties: ["durationMs": RemoteSchemas.schema_c5c5a6d768bddd81, "endX": RemoteSchemas.schema_5d4b39004bf5c532, "endY": RemoteSchemas.schema_5d4b39004bf5c532, "frameId": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_0cdfc047b0a2e1bb, "x": RemoteSchemas.schema_5d4b39004bf5c532, "y": RemoteSchemas.schema_5d4b39004bf5c532], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_2c671d62fd5c98a8 = RemoteSchema(type: "string", literals: [.string("boolean")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c93150c89b253f9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_247ec4acb49e6522, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2cfe911595ad978d = RemoteSchema(type: "object", required: Set(["fromCursor", "generation", "toCursor", "version", "watchId"]), properties: ["fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_36fea325bf1aca70, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.output-range"])
}

public extension RemoteSchemas {
  static let schema_2d0b6ec9f2b2decf = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d29c7255e1cf1b1 = RemoteSchema(type: "string", literals: [.string("project")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d2a48957e54670a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_55ee222c096690dc, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
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
  static let schema_2eb2bd4b48793b85 = RemoteSchema(type: "string", literals: [.string("0"), .string("1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2ebee6ffa37983f2 = RemoteSchema(type: "object", required: Set(["body", "line", "path", "side"]), properties: ["body": RemoteSchemas.schema_1be16061d2974772, "line": RemoteSchemas.schema_23e05d248383ea40, "path": RemoteSchemas.schema_bd85a52dd25effae, "side": RemoteSchemas.schema_598c25a2e687258b, "startLine": RemoteSchemas.schema_23e05d248383ea40], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f0b42b84f3f48a0 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4dea101cb65656f3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f3c74eaed971b9f = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_1be5ac91cc4357cb, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f4c1755c2d3a402 = RemoteSchema(type: "object", required: Set(["posix", "windows", "wsl"]), properties: ["posix": RemoteSchemas.schema_4348fdb13264571d, "windows": RemoteSchemas.schema_4348fdb13264571d, "wsl": RemoteSchemas.schema_4348fdb13264571d], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_30057dd734d040ce = RemoteSchema(type: "array", maxItems: 32, items: RemoteSchemas.schema_7d62681c6488867d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3008927746cc013b = RemoteSchema(type: "array", items: RemoteSchemas.schema_1b3dc298a6f3cf15, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_302783bd5327b877 = RemoteSchema(type: "array", items: RemoteSchemas.schema_f2bb61aa3bb8d258, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_304430ceb5560696 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d4a49a3cee60b0ec, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30a537a9343bcdf7 = RemoteSchema(type: "string", literals: [.string("file_change")], unknownPolicy: .strip)
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
  static let schema_3121eed44aed8dbf = RemoteSchema(type: "object", required: Set(["agentKind", "config", "initialSize", "projectLocation", "threadId"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_77c646d1a00c89a5, "disabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "disabledBuiltInMcpTools": RemoteSchemas.schema_fdad254a8bac8914, "ensureRunning": RemoteSchemas.schema_d2dd3595e1b5e5dc, "initialInstructions": RemoteSchemas.schema_36fea325bf1aca70, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "mcpServers": RemoteSchemas.schema_7f86e779ad379105, "mentionHandoff": RemoteSchemas.schema_d2dd3595e1b5e5dc, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_38d1a07d3b9b1c82, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "questionAnswer": RemoteSchemas.schema_4d59c815dfec80c4, "segments": RemoteSchemas.schema_4392338ffc80bed7, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3155b0e8649e47af = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cd124b21d98c4aa2, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3224b2661089874d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e105701b122113cd, RemoteSchemas.schema_c3a4dfd6503d3858, RemoteSchemas.schema_f252df24b49da178], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_324df5fa323e1096 = RemoteSchema(type: "array", maxItems: 200, items: RemoteSchemas.schema_85c1db78d5c7dc29, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3264c4f1e6231fa5 = RemoteSchema(type: "object", required: Set(["prompts", "truncated"]), properties: ["prompts": RemoteSchemas.schema_8103b4e6f4958c4c, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32773ce5899289ad = RemoteSchema(type: "string", literals: [.string("authorized")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32a902996bba88be = RemoteSchema(type: "object", required: Set(["devices", "generation", "platforms", "version"]), properties: ["devices": RemoteSchemas.schema_6c203f8f04d76313, "generation": RemoteSchemas.schema_d855999aed5e6438, "platforms": RemoteSchemas.schema_a6c274420d82c814, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_3328521e00056564 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_0138c350a16e9103, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_338293a42e7115a2 = RemoteSchema(type: "object", required: Set(["server"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "server": RemoteSchemas.schema_c04b1452d18edb3f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_33c56fa54b24233a = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "rebase": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_340c8f8b68b6e2b5 = RemoteSchema(type: "array", maxItems: 50, items: RemoteSchemas.schema_9bc1c08248602f5c, unknownPolicy: .strip)
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
  static let schema_3512bd687eb85e90 = RemoteSchema(type: "string", literals: [.string("before"), .string("after")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_356ae1fc455ec4c8 = RemoteSchema(type: "string", literals: [.string("rename")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_35889b09eb72e208 = RemoteSchema(type: "object", required: Set(["branches", "ghAvailable", "status", "worktrees"]), properties: ["branches": RemoteSchemas.schema_d715cb198ae66d56, "ghAvailable": RemoteSchemas.schema_78c0e367e5120eb3, "status": RemoteSchemas.schema_98139abfca5e2eda, "worktrees": RemoteSchemas.schema_694e88722e472029], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_369773f70316d070 = RemoteSchema(type: "object", required: Set(["effort", "fast"]), properties: ["effort": RemoteSchemas.schema_b6a98d4e6efc4f4c, "fast": RemoteSchemas.schema_b6a98d4e6efc4f4c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36a14ea6cf3d0316 = RemoteSchema(type: "object", properties: ["cacheRead": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite": RemoteSchemas.schema_f696f11685898ba7, "input": RemoteSchemas.schema_f696f11685898ba7, "output": RemoteSchemas.schema_f696f11685898ba7, "period": RemoteSchemas.schema_776626d20373881d, "total": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36b9fe91ec45bcd5 = RemoteSchema(type: "string", literals: [.string("select")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36ca2b1ea64910b4 = RemoteSchema(type: "object", required: Set(["comments", "threads"]), properties: ["comments": RemoteSchemas.schema_ac3d09b5c7f361d2, "threads": RemoteSchemas.schema_7f88819389c3ccc9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36ebafd43b47829a = RemoteSchema(type: "array", items: RemoteSchemas.schema_b4441316f1aafac9, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36fea325bf1aca70 = RemoteSchema(type: "string", minLength: 1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_370ff0ec0af5649a = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_4d5989d27d26b612], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_375b3978f669c107 = RemoteSchema(type: "string", literals: [.string("upsert")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_378174642bf763b3 = RemoteSchema(type: "object", required: Set(["name", "path", "type"]), properties: ["name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_37addcca5b32752c = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_034741cb26a53fe4, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
