// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_2363c4dd0a78ce9d = RemoteSchema(type: "string", literals: [.string("authenticated"), .string("missing"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2365fa95161a3294 = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip, semanticIds: ["forge.host.https"])
}

public extension RemoteSchemas {
  static let schema_236d6f96ed0a17bc = RemoteSchema(type: "string", literals: [.string("native")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_236e9131b013f10b = RemoteSchema(type: "string", literals: [.string("begin")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_236f000609716d3a = RemoteSchema(type: "object", required: Set(["id", "label", "selection"]), properties: ["brief": RemoteSchemas.schema_ba7dfbe6c754d186, "fallbacks": RemoteSchemas.schema_60a3d8687bc0025b, "id": RemoteSchemas.schema_020cad6f356d7c67, "label": RemoteSchemas.schema_6350bebbf3d13115, "noEdits": RemoteSchemas.schema_d2dd3595e1b5e5dc, "parallel": RemoteSchemas.schema_6fb5e1ff4ba2dc63, "selection": RemoteSchemas.schema_c33d76cdf9c7d5d7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23a1c447c059f0da = RemoteSchema(type: "object", required: Set(["throughCursor", "version", "watchId"]), properties: ["throughCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_f8ba039a2f32fad1, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23b45e35f743c6ce = RemoteSchema(type: "array", items: RemoteSchemas.schema_9262f6553ee2010b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23e05d248383ea40 = RemoteSchema(type: "integer", maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
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
  static let schema_2556bf4896893601 = RemoteSchema(type: "string", literals: [.string("authentication"), .string("tool-restrictions"), .string("sensitive-values")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_255898614500bbb9 = RemoteSchema(type: "object", required: Set(["hostId", "prNumber", "projectId"]), properties: ["hostId": RemoteSchemas.schema_bf0b727f7b1c6d07, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2583fd799237ae71 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_c538d0467addc4ec, RemoteSchemas.schema_4cd2587996458d8d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25a3e0b2a9eecdfb = RemoteSchema(type: "string", pattern: "^\\/(?!\\/)(?:[^?#]*)$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25df6feb29c4a959 = RemoteSchema(type: "object", required: Set(["discoveredAt", "providerSessionId"]), properties: ["discoveredAt": RemoteSchemas.schema_36fea325bf1aca70, "executionIdentity": RemoteSchemas.schema_97d85a5eaee82b97, "providerSessionId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25e47114d380c1fb = RemoteSchema(type: "string", literals: [.string("thread-item-interests")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_261c25778789d884 = RemoteSchema(type: "object", required: Set(["id", "lead", "name", "policy", "roles"]), properties: ["favorite": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_7d62681c6488867d, "lastUsedAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "lead": RemoteSchemas.schema_77f2cf560a042976, "name": RemoteSchemas.schema_eef7e0a1ed6691c0, "policy": RemoteSchemas.schema_5e585becfdaebc00, "roles": RemoteSchemas.schema_d2613d4b01184321, "updatedAt": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_26dd48aa90982fbb = RemoteSchema(type: "object", required: Set(["agentKind", "config", "projectId", "threadId", "title", "worktreeBranch"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_281d24bbbaa46745, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_27790e6c4216ae5b = RemoteSchema(type: "object", required: Set(["action", "id"]), properties: ["action": RemoteSchemas.schema_482c9282715722ac, "id": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_281d24bbbaa46745 = RemoteSchema(type: "object", required: Set(["model"]), properties: ["approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "approvalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "browserMcp": RemoteSchemas.schema_feeb8bb50144d96d, "chromeMcp": RemoteSchemas.schema_feeb8bb50144d96d, "computerUse": RemoteSchemas.schema_feeb8bb50144d96d, "contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "crew": RemoteSchemas.schema_46a8742e5750f74f, "crossagentMcp": RemoteSchemas.schema_feeb8bb50144d96d, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "executionEnvironment": RemoteSchemas.schema_4cd2587996458d8d, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "importedFrom": RemoteSchemas.schema_3471186f1398f1d2, "mcpServerOverrides": RemoteSchemas.schema_6db96506f253ef73, "mode": RemoteSchemas.schema_01e21946e943d3eb, "model": RemoteSchemas.schema_36fea325bf1aca70, "pluginOverrides": RemoteSchemas.schema_6db96506f253ef73, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "selectionBinding": RemoteSchemas.schema_a11ab76af3bce730, "thinking": RemoteSchemas.schema_feeb8bb50144d96d, "workflows": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2840caeaedca16a2 = RemoteSchema(type: "object", required: Set(["thinking"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_2843e0996b9986e5 = RemoteSchema(type: "object", required: Set(["capabilities"]), properties: ["capabilities": RemoteSchemas.schema_9be4e34050076f08], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_285309f050a3f125 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_fff3547caad99f85, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_288cf32acf26654a = RemoteSchema(type: "object", required: Set(["downloadBytes", "id", "installed", "languages", "name", "supportsLanguageDetection", "verified"]), properties: ["downloadBytes": RemoteSchemas.schema_78830b3d6ec86f55, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "languages": RemoteSchemas.schema_0f732b9fceb2c6ac, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "supportsLanguageDetection": RemoteSchemas.schema_feeb8bb50144d96d, "verified": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_297655ba91f41fa6 = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_49834fb5a406b494], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_2ae8d538fe55c35d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_929ff57e1355048a, RemoteSchemas.schema_fee1e07039137fc5, RemoteSchemas.schema_475f45061f4eecab, RemoteSchemas.schema_297655ba91f41fa6, RemoteSchemas.schema_0aacda6901eb566b, RemoteSchemas.schema_f8fde013f784c33d, RemoteSchemas.schema_9501e4a8a718d07b, RemoteSchemas.schema_5a9666a2c52a802f, RemoteSchemas.schema_5ffdb22692f97bf9, RemoteSchemas.schema_313744588ce712ec, RemoteSchemas.schema_27790e6c4216ae5b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b430316258b9c31 = RemoteSchema(type: "object", required: Set(["items", "nextCursor"]), properties: ["historyProjection": RemoteSchemas.schema_72a4409660da2b12, "items": RemoteSchemas.schema_5d3ac76d9a521e1d, "nextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d], additionalAllowed: true, unknownPolicy: .strip)
}
