// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_df7fa3d1be8ffbea = RemoteSchema(type: "object", required: Set(["checkpoints", "turns"]), properties: ["checkpoints": RemoteSchemas.schema_12344c6d82d54c6d, "turns": RemoteSchemas.schema_203e1407dc2d843e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df96bd315b4c0dae = RemoteSchema(type: "object", required: Set(["anchorItemId", "endedAt", "startedAt"]), properties: ["anchorItemId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "endedAt": RemoteSchemas.schema_36fea325bf1aca70, "startedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dfbf83bd7409c8d7 = RemoteSchema(type: "object", required: Set(["latitude", "longitude", "type"]), properties: ["latitude": RemoteSchemas.schema_3a762c9b6eacc492, "longitude": RemoteSchemas.schema_f1261de365f15bea, "type": RemoteSchemas.schema_1a0723da99007052], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_dfc3f3726c991dbe = RemoteSchema(type: "string", maxLength: 4096, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e005a5ac28cf7191 = RemoteSchema(type: "array", items: RemoteSchemas.schema_ee4a36083d770366, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e01133268267ec38 = RemoteSchema(type: "object", required: Set(["outcome", "requestId", "threadId", "type"]), properties: ["outcome": RemoteSchemas.schema_506f036707472345, "requestId": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_d92fe09fa7f298ab], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0726fd608f2ab5f = RemoteSchema(type: "array", items: RemoteSchemas.schema_131fd1869b52ef74, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0bc631a257fd15a = RemoteSchema(type: "object", required: Set(["device", "identity"]), properties: ["device": RemoteSchemas.schema_26f96950d20651b3, "identity": RemoteSchemas.schema_da76232259cbe6bb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0da1e0a5e3cd077 = RemoteSchema(type: "object", required: Set(["headers", "type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_4f84b56b06f60ea1, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_e0e12d4798687ab0 = RemoteSchema(type: "object", required: Set(["codec", "transport"]), properties: ["codec": RemoteSchemas.schema_a8565e7811b17010, "transport": RemoteSchemas.schema_4f84b56b06f60ea1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0fc3c3d350deb38 = RemoteSchema(type: "array", items: RemoteSchemas.schema_191ccdb4e41abc75, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e105701b122113cd = RemoteSchema(type: "object", required: Set(["descriptor", "notice", "outcome", "supersededAcceptedEvents"]), properties: ["descriptor": RemoteSchemas.schema_c66f09c6212330ba, "notice": RemoteSchemas.schema_1468dfe9a2db9c9d, "outcome": RemoteSchemas.schema_c62b342ed89c5809, "supersededAcceptedEvents": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e163a1a22234ae4f = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e1a91348d83820fb = RemoteSchema(type: "string", literals: [.string("events")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e213e5cbde87bf9f = RemoteSchema(type: "object", required: Set(["hostKeyFingerprint", "state"]), properties: ["hostKeyFingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "observedFingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "state": RemoteSchemas.schema_eaed5114fa77917e], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_e22de6db69f83369 = RemoteSchema(type: "string", pattern: "^[A-Z]{3}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e25509dad8a191fe = RemoteSchema(type: "string", literals: [.string("empty"), .string("generating"), .string("ready"), .string("failed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e26989c54e256c6f = RemoteSchema(type: "object", properties: ["approvalPolicies": RemoteSchemas.schema_d0b10c04efa78c87, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizeChangeReloadsSession": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_515482d2104d1efa, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_cb81a9dbb81a1a63, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_e163a1a22234ae4f, "modelFamilies": RemoteSchemas.schema_ae3b637db050db2a, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_d0b10c04efa78c87, "modes": RemoteSchemas.schema_acf85c3d3b25a389, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_d0b10c04efa78c87, "settingDefs": RemoteSchemas.schema_113b6f36094df840, "showRuntimeLabelInPicker": RemoteSchemas.schema_feeb8bb50144d96d, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e2d96ee09e9d99a2 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "includePrDetails": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_fc779c522d442c13, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e301e52cd3d3ea46 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, pattern: "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e333e5cd970cf11f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_109baa93f8b988b2, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e37012a6e5cb600d = RemoteSchema(type: "string", literals: [.string("websocket")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3b2f0593652d957 = RemoteSchema(type: "object", required: Set(["available"]), properties: ["available": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3fc8b89f137aafe = RemoteSchema(type: "string", maxLength: 1000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e41b25797ed24d45 = RemoteSchema(type: "object", required: Set(["projectLocation", "sourceBranch", "worktreeBranch", "worktreeLocation"]), properties: ["expectedWorktreeCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e47ad2358cf0df53 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_80ac3a097b3c79c7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e4a434d61cd0f65f = RemoteSchema(type: "string", literals: [.string("minutes"), .string("hours"), .string("days")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e4ed0fc98f59d7f1 = RemoteSchema(type: "array", maxItems: 1000, items: RemoteSchemas.schema_d832acd230fbc919, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e510e581c4f8b523 = RemoteSchema(type: "object", required: Set(["kind", "payload"]), properties: ["kind": RemoteSchemas.schema_ffc64b31e09ad873, "payload": RemoteSchemas.schema_626f8596f7256857], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e51d77fd6734b53a = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e527c3ee29cd639b = RemoteSchema(type: "string", literals: [.string("auth-required")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e56382aee3ea3c7f = RemoteSchema(type: "object", required: Set(["projectLocation", "workflowId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "inputs": RemoteSchemas.schema_fd056ca894e30f21, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "ref": RemoteSchemas.schema_36fea325bf1aca70, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e5bbd3e940039349 = RemoteSchema(type: "string", maxLength: 200, unknownPolicy: .strip, transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_e5ee0a072228c0a3 = RemoteSchema(type: "string", literals: [.string("once")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e65689e97e7d91c3 = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_9dd9855628dd71ae, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_114549e732be9b99], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6958017dac6cd3b = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_ca3d163bab055381, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6bc2fd97be6dec8 = RemoteSchema(type: "string", literals: [.string("none"), .string("view"), .string("control")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6cfd13a746cd290 = RemoteSchema(type: "number", literals: [.int(4)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6da2ef0eeb6a138 = RemoteSchema(type: "object", required: Set(["agentKind", "baseBranch", "branch", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "branch": RemoteSchemas.schema_36fea325bf1aca70, "language": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6f95dbaa32318b7 = RemoteSchema(type: "object", required: Set(["height", "width"]), properties: ["height": RemoteSchemas.schema_1b6b610bba2774d6, "inputUnavailable": RemoteSchemas.schema_feeb8bb50144d96d, "orientation": RemoteSchemas.schema_b3ef93117a9f9f95, "width": RemoteSchemas.schema_1b6b610bba2774d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e70be7a06d8baea6 = RemoteSchema(type: "object", required: Set(["cacheRead", "cacheWrite", "input", "output"]), properties: ["cacheRead": RemoteSchemas.schema_56aa0e45cbdce0d0, "cacheWrite": RemoteSchemas.schema_56aa0e45cbdce0d0, "cacheWrite1h": RemoteSchemas.schema_56aa0e45cbdce0d0, "input": RemoteSchemas.schema_56aa0e45cbdce0d0, "output": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e761211b82c40573 = RemoteSchema(type: "object", required: Set(["servers"]), properties: ["servers": RemoteSchemas.schema_dc97711e2c23c867], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e788b86a30c28e0d = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70, "variant": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e78ddc126c04f09d = RemoteSchema(type: "string", minLength: 1, maxLength: 64000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e78f40fc5399f7f1 = RemoteSchema(type: "string", maxLength: 200, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7c244bd461f7229 = RemoteSchema(type: "array", items: RemoteSchemas.schema_93ea7778107ef974, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7c7f30aecaa99f0 = RemoteSchema(type: "string", minLength: 1, maxLength: 500, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7cab2d2c052144f = RemoteSchema(type: "object", required: Set(["id", "kind"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_4d5989d27d26b612], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e80087031872d26b = RemoteSchema(type: "object", required: Set(["confidenceThreshold", "kind", "stopWhen"]), properties: ["confidenceThreshold": RemoteSchemas.schema_5d4b39004bf5c532, "kind": RemoteSchemas.schema_5bbcf9e4750fbaa3, "stopWhen": RemoteSchemas.schema_5c6957eaa59e2ae2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e82ae39cda9f878d = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_f9e7f90793023053, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e841af2cbd75708d = RemoteSchema(type: "string", literals: [.string("toggle")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e847e321fbb6435b = RemoteSchema(type: "string", maxLength: 120, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e8ae3938f73bbe3d = RemoteSchema(type: "string", maxLength: 16000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e8fbf0f2cbb425a8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_20d706a189398fff, RemoteSchemas.schema_37eeca9f5377b6e4, RemoteSchemas.schema_66021940878f3abc, RemoteSchemas.schema_7a00457b3e3294c1, RemoteSchemas.schema_81440643a0f1796d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e96ebdc8b8af5200 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "rebase": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e987f23b082616d2 = RemoteSchema(type: "string", literals: [.string("A"), .string("B"), .string("C"), .string("D"), .string("F")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9df8b4f3dcc8aae = RemoteSchema(type: "object", required: Set(["flowId"]), properties: ["flowId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9e7b28a3dddd9fd = RemoteSchema(type: "object", required: Set(["enabled", "id", "name", "timeoutMs", "transport"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_23e05d248383ea40, "transport": RemoteSchemas.schema_5296d6b04d46b630, "unsupportedReason": RemoteSchemas.schema_2556bf4896893601], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9f57f9b4751d6e1 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 3600.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea08f63f22aa2011 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_3a38f5dc8038f065, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea193ab85993872c = RemoteSchema(type: "integer", defaultValue: .int(5), minimum: 2.0, maximum: 120.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea3d1d70c1876de4 = RemoteSchema(type: "object", required: Set(["account", "runtime"]), properties: ["account": RemoteSchemas.schema_5646cf57ff3aebe0, "runtime": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea993e5b2d87f77f = RemoteSchema(type: "object", required: Set(["detected", "forwards"]), properties: ["detected": RemoteSchemas.schema_58c75b9ad5972758, "forwards": RemoteSchemas.schema_2c93150c89b253f9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaa8e54151cd7fc2 = RemoteSchema(type: "object", required: Set(["expiresAt", "ticket"]), properties: ["expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaed3cfbf46d5d81 = RemoteSchema(type: "string", literals: [.string("github"), .string("gitlab"), .string("forgejo"), .string("gitea"), .string("bitbucket"), .string("azure-devops"), .string("gitcafe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaed5114fa77917e = RemoteSchema(type: "string", literals: [.string("pinned")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaf8a91849801b20 = RemoteSchema(type: "object", required: Set(["status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb12aad2875e1908 = RemoteSchema(type: "object", required: Set(["projectLocation", "runId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "runId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb148d7195a1780a = RemoteSchema(type: "string", literals: [.string("downloaded")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2405f61baf028b = RemoteSchema(type: "object", required: Set(["bytesPerSecond", "percent", "total", "transferred", "type"]), properties: ["bytesPerSecond": RemoteSchemas.schema_80c415b6e27c6ebd, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "total": RemoteSchemas.schema_80c415b6e27c6ebd, "transferred": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_bd136ee4bcce8b07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2798e2ccc8bf65 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_5646cf57ff3aebe0, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebd70a208b453fe1 = RemoteSchema(type: "object", required: Set(["kind", "starred"]), properties: ["kind": RemoteSchemas.schema_833ef472e7760fae, "starred": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebfa6f1c64210a5f = RemoteSchema(type: "object", required: Set(["kind", "projectId", "workspaceId"]), properties: ["kind": RemoteSchemas.schema_96cd458fa9bae303, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_df704162f3d15808], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec221fdc1494d0b1 = RemoteSchema(type: "string", pattern: "^[a-f0-9]{64}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec76fa076d16485a = RemoteSchema(type: "object", required: Set(["type", "version"]), properties: ["type": RemoteSchemas.schema_eb148d7195a1780a, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecbd7591c9493c90 = RemoteSchema(type: "object", required: Set(["diff"]), properties: ["diff": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecc6edb6166acda9 = RemoteSchema(type: "object", required: Set(["activeTabId", "tabs"]), properties: ["activeTabId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "tabs": RemoteSchemas.schema_bf3a4ed0e5798352], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecde1f3c1f09bdc0 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1fb6f9ae5f6d1a02, RemoteSchemas.schema_6f5cce5ce127f97f, RemoteSchemas.schema_e213e5cbde87bf9f], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ece1ba6d7edbc0d7 = RemoteSchema(type: "object", required: Set(["height", "width"]), properties: ["height": RemoteSchemas.schema_1b6b610bba2774d6, "width": RemoteSchemas.schema_1b6b610bba2774d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecf46d016507c672 = RemoteSchema(type: "string", literals: [.string("BEHIND"), .string("BLOCKED"), .string("CLEAN"), .string("DIRTY"), .string("DRAFT"), .string("HAS_HOOKS"), .string("UNKNOWN"), .string("UNSTABLE")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed1865d937c91a50 = RemoteSchema(type: "string", literals: [.string("move-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed3d9773342dac2c = RemoteSchema(type: "object", required: Set(["entries"]), properties: ["entries": RemoteSchemas.schema_bdb4eecbb625c500], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_edaad5a427ee5ae6 = RemoteSchema(type: "object", required: Set(["actions", "bootId", "version"]), properties: ["actions": RemoteSchemas.schema_135288c0feeec2fc, "bootId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee49ed668eec9d78 = RemoteSchema(type: "string", maxLength: 128000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee4a36083d770366 = RemoteSchema(type: "object", required: Set(["id", "prompt", "stagedAt"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "stagedAt": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee5346688873f70f = RemoteSchema(type: "array", items: RemoteSchemas.schema_af9e7187ee39d2c1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee6af1c3c62ad32f = RemoteSchema(type: "string", literals: [.string("slash"), .string("dollar"), .string("prompt"), .string("skill")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee8a6a87417deae2 = RemoteSchema(type: "object", required: Set(["ok", "revision"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "revision": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eeb5c5f788e7f258 = RemoteSchema(type: "object", required: Set(["filePath", "projectLocation", "staged"]), properties: ["filePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "staged": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eef64882a7b017fb = RemoteSchema(type: "object", required: Set(["sessionId", "threadId"]), properties: ["sessionId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef7ac92f549d928c = RemoteSchema(type: "object", required: Set(["decision", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_38d1a07d3b9b1c82, "decision": RemoteSchemas.schema_c0551fbf082fff0f, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef917452dcccd356 = RemoteSchema(type: "string", literals: [.string("tap")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efc124973b411d28 = RemoteSchema(type: "string", literals: [.string("pending"), .string("completed"), .string("failed"), .string("skipped_no_location"), .string("skipped_missing_checkpoint")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efd9410c7543c4c0 = RemoteSchema(type: "object", required: Set(["kind", "placement", "projectId", "targetThreadId"]), properties: ["kind": RemoteSchemas.schema_8e7b4d097aa71417, "placement": RemoteSchemas.schema_3512bd687eb85e90, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "targetThreadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efedb06a4d7088a5 = RemoteSchema(type: "object", required: Set(["description", "name", "options", "required", "type"]), properties: ["defaultValue": RemoteSchemas.schema_1994cc63e450a4bd, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "options": RemoteSchemas.schema_0f732b9fceb2c6ac, "required": RemoteSchemas.schema_feeb8bb50144d96d, "type": RemoteSchemas.schema_f450768848c5befd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f04c7b0573aff59c = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_5d5cc3aa0a1f3291], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0c513c0146099c2 = RemoteSchema(type: "object", required: Set(["publicKey"]), properties: ["publicKey": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0f815c9ec0e3b5a = RemoteSchema(type: "string", literals: [.string("small"), .string("standard"), .string("large"), .string("extraLarge")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1261de365f15bea = RemoteSchema(type: "number", minimum: -180.0, maximum: 180.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f145218b6dee66b6 = RemoteSchema(type: "object", required: Set(["code", "message"]), properties: ["authScheme": RemoteSchemas.schema_2d52ff1140653b18, "code": RemoteSchemas.schema_e527c3ee29cd639b, "message": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f156a9bc12c3639a = RemoteSchema(type: "string", literals: [.string("running"), .string("exited")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1666190cd652261 = RemoteSchema(type: "array", maxItems: 500, items: RemoteSchemas.schema_ad1d9fe8b3eda038, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1a8832c8ce43a2f = RemoteSchema(type: "array", items: RemoteSchemas.schema_4e1c353012bcb7ec, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1c1581e1729d48e = RemoteSchema(type: "object", required: Set(["event", "seq", "type"]), properties: ["event": RemoteSchemas.schema_ca3d163bab055381, "seq": RemoteSchemas.schema_23e05d248383ea40, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_829c74ec0aec2226], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1ccd99fb2bc2c2f = RemoteSchema(type: "string", literals: [.string("android-uiautomator-xml"), .string("ios-idb-json")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1deff8504bbc0a3 = RemoteSchema(type: "string", maxLength: 256, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f22a438b8392693b = RemoteSchema(type: "object", required: Set(["name", "threadId"]), properties: ["name": RemoteSchemas.schema_9bc1c08248602f5c, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f249cae06596abcd = RemoteSchema(type: "object", required: Set(["itemId", "position", "text"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70, "position": RemoteSchemas.schema_56aa0e45cbdce0d0, "text": RemoteSchemas.schema_b202a6626ea9d1ee], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f252df24b49da178 = RemoteSchema(type: "object", required: Set(["current", "outcome"]), properties: ["current": RemoteSchemas.schema_f550638b8241897c, "outcome": RemoteSchemas.schema_41148a177ba98c21], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2b9759b60404656 = RemoteSchema(type: "object", properties: ["force": RemoteSchemas.schema_feeb8bb50144d96d, "providerIds": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2bb61aa3bb8d258 = RemoteSchema(type: "object", required: Set(["label", "optionId"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "optionId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2d54b0f9e07d90a = RemoteSchema(type: "string", literals: [.string("old"), .string("new")], unknownPolicy: .strip)
}
