// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_da66851500474562 = RemoteSchema(type: "object", required: Set(["kind", "name", "parentPath", "source"]), properties: ["kind": RemoteSchemas.schema_8793e380887b215f, "name": RemoteSchemas.schema_36fea325bf1aca70, "parentPath": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_76b2c94b29aad9b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da76232259cbe6bb = RemoteSchema(type: "object", required: Set(["avatarColor", "handle", "name"]), properties: ["avatarColor": RemoteSchemas.schema_8f8e73cb353005a1, "handle": RemoteSchemas.schema_485fa06696a88681, "name": RemoteSchemas.schema_c8709e27df818d5b, "plan": RemoteSchemas.schema_485fa06696a88681], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_db8efd22aa031937 = RemoteSchema(type: "object", required: Set(["url"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dba220fea45f4f88 = RemoteSchema(type: "object", required: Set(["author", "body", "id", "state"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_d2a18aed5ce077b0, "submittedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc69d1c3f1fc465e = RemoteSchema(type: "object", required: Set(["sourceScope"]), properties: ["sourceScope": RemoteSchemas.schema_6a2600edfb55d776], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_dc97711e2c23c867 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d66267c393bb4ec4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc99757951407418 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_ce6e21bdeb9c2f10, RemoteSchemas.schema_3d188d85aa0799fe], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc9dbbe08067c690 = RemoteSchema(type: "object", required: Set(["runs"]), properties: ["runs": RemoteSchemas.schema_35d4f345ae5694ef], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dd4531e3bf06232b = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ddfa380e07db6515 = RemoteSchema(type: "object", required: Set(["notices"]), properties: ["maxBytes": RemoteSchemas.schema_23e05d248383ea40, "maxDecodeBytes": RemoteSchemas.schema_23e05d248383ea40, "notices": RemoteSchemas.schema_f67f6cbe63879b24], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_de00765ac7659be8 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_4f84b56b06f60ea1, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_deb61378c1ff010b = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_cff1242509563941, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip, transformIds: ["agent-settings.strip-sensitive"])
}

public extension RemoteSchemas {
  static let schema_df37d0da6ffc8371 = RemoteSchema(type: "object", required: Set(["title"]), properties: ["title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df704162f3d15808 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_36fea325bf1aca70, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df7fa3d1be8ffbea = RemoteSchema(type: "object", required: Set(["checkpoints", "turns"]), properties: ["checkpoints": RemoteSchemas.schema_12344c6d82d54c6d, "turns": RemoteSchemas.schema_203e1407dc2d843e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df96bd315b4c0dae = RemoteSchema(type: "object", required: Set(["anchorItemId", "endedAt", "startedAt"]), properties: ["anchorItemId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "endedAt": RemoteSchemas.schema_36fea325bf1aca70, "startedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e005a5ac28cf7191 = RemoteSchema(type: "array", items: RemoteSchemas.schema_ee4a36083d770366, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e01133268267ec38 = RemoteSchema(type: "object", required: Set(["outcome", "requestId", "threadId", "type"]), properties: ["outcome": RemoteSchemas.schema_506f036707472345, "requestId": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_d92fe09fa7f298ab], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0bc631a257fd15a = RemoteSchema(type: "object", required: Set(["device", "identity"]), properties: ["device": RemoteSchemas.schema_26f96950d20651b3, "identity": RemoteSchemas.schema_da76232259cbe6bb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0da1e0a5e3cd077 = RemoteSchema(type: "object", required: Set(["headers", "type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_4f84b56b06f60ea1, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
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
  static let schema_e26989c54e256c6f = RemoteSchema(type: "object", properties: ["approvalPolicies": RemoteSchemas.schema_d0b10c04efa78c87, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizeChangeReloadsSession": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_515482d2104d1efa, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_cb81a9dbb81a1a63, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_e163a1a22234ae4f, "modelFamilies": RemoteSchemas.schema_ae3b637db050db2a, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_d0b10c04efa78c87, "modes": RemoteSchemas.schema_acf85c3d3b25a389, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_d0b10c04efa78c87, "settingDefs": RemoteSchemas.schema_113b6f36094df840, "showRuntimeLabelInPicker": RemoteSchemas.schema_feeb8bb50144d96d, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e2d96ee09e9d99a2 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "includePrDetails": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_fc779c522d442c13, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e301e52cd3d3ea46 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, pattern: "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3b2f0593652d957 = RemoteSchema(type: "object", required: Set(["available"]), properties: ["available": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e41b25797ed24d45 = RemoteSchema(type: "object", required: Set(["projectLocation", "sourceBranch", "worktreeBranch", "worktreeLocation"]), properties: ["expectedWorktreeCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e47ad2358cf0df53 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_80ac3a097b3c79c7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e4ed0fc98f59d7f1 = RemoteSchema(type: "array", maxItems: 1000, items: RemoteSchemas.schema_d832acd230fbc919, unknownPolicy: .strip)
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
  static let schema_e5ba6e7ba571b481 = RemoteSchema(type: "object", required: Set(["completedAt", "error", "id", "scheduleId", "startedAt", "status", "summary", "threadId"]), properties: ["completedAt": RemoteSchemas.schema_595da89b21b7ca56, "error": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_d855999aed5e6438, "scheduleId": RemoteSchemas.schema_d855999aed5e6438, "startedAt": RemoteSchemas.schema_38adcf16c79023ce, "status": RemoteSchemas.schema_d21b71d44dcb47ab, "summary": RemoteSchemas.schema_2d0b6ec9f2b2decf, "threadId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_e6cfd13a746cd290 = RemoteSchema(type: "number", literals: [.int(4)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6da2ef0eeb6a138 = RemoteSchema(type: "object", required: Set(["agentKind", "baseBranch", "branch", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "branch": RemoteSchemas.schema_36fea325bf1aca70, "language": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e761211b82c40573 = RemoteSchema(type: "object", required: Set(["servers"]), properties: ["servers": RemoteSchemas.schema_dc97711e2c23c867], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e78ddc126c04f09d = RemoteSchema(type: "string", minLength: 1, maxLength: 64000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7c244bd461f7229 = RemoteSchema(type: "array", items: RemoteSchemas.schema_93ea7778107ef974, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7cab2d2c052144f = RemoteSchema(type: "object", required: Set(["id", "kind"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_4d5989d27d26b612], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e841af2cbd75708d = RemoteSchema(type: "string", literals: [.string("toggle")], unknownPolicy: .strip)
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
  static let schema_e990bf4d50a35396 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_2778fa8937ac1709, RemoteSchemas.schema_66846085f373f57f, RemoteSchemas.schema_4244283735615c22, RemoteSchemas.schema_85d2dd31fd2f4872, RemoteSchemas.schema_fe7522595f5637c3, RemoteSchemas.schema_c55a346c739cb16c, RemoteSchemas.schema_1371f7bedcffbc2e, RemoteSchemas.schema_996ce1c4e0b82a8b, RemoteSchemas.schema_cdd89e732d29ca0e, RemoteSchemas.schema_9b83e18a93c4ec45, RemoteSchemas.schema_0bffd4a90cd2aab1, RemoteSchemas.schema_15179deb98a23815, RemoteSchemas.schema_e01133268267ec38, RemoteSchemas.schema_2a107f95a9dcf216, RemoteSchemas.schema_9da23fadb81a50e3, RemoteSchemas.schema_f7a8f7639015cad8], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9df8b4f3dcc8aae = RemoteSchema(type: "object", required: Set(["flowId"]), properties: ["flowId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9e7b28a3dddd9fd = RemoteSchema(type: "object", required: Set(["enabled", "id", "name", "timeoutMs", "transport"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_23e05d248383ea40, "transport": RemoteSchemas.schema_5296d6b04d46b630, "unsupportedReason": RemoteSchemas.schema_2556bf4896893601], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_eb5b966723ac7023 = RemoteSchema(type: "object", properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_ec438f4fd047a2a3 = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_2c97b9d429a794cb, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_ecf46d016507c672 = RemoteSchema(type: "string", literals: [.string("BEHIND"), .string("BLOCKED"), .string("CLEAN"), .string("DIRTY"), .string("DRAFT"), .string("HAS_HOOKS"), .string("UNKNOWN"), .string("UNSTABLE")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed1865d937c91a50 = RemoteSchema(type: "string", literals: [.string("move-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed3d9773342dac2c = RemoteSchema(type: "object", required: Set(["entries"]), properties: ["entries": RemoteSchemas.schema_bdb4eecbb625c500], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_f0f46abc2f28aef5 = RemoteSchema(type: "object", required: Set(["schedules"]), properties: ["schedule": RemoteSchemas.schema_b0c26b27d803b3b4, "schedules": RemoteSchemas.schema_f4633a7147eefce7], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_f22a438b8392693b = RemoteSchema(type: "object", required: Set(["name", "threadId"]), properties: ["name": RemoteSchemas.schema_9bc1c08248602f5c, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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

public extension RemoteSchemas {
  static let schema_f2e3da83f3088e10 = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_04569d9eea76ae2b, "result": RemoteSchemas.schema_51cc694dc5da9f2a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f30731ffd8c57b5c = RemoteSchema(type: "string", literals: [.string("content.delta")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f30afbf29e9d6e24 = RemoteSchema(type: "object", required: Set(["kind", "record", "threads"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "record": RemoteSchemas.schema_1be5ac91cc4357cb, "threads": RemoteSchemas.schema_4d7f9a55217d713f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f34e1c0e37ed0c00 = RemoteSchema(type: "object", required: Set(["message", "projectLocation"]), properties: ["addAll": RemoteSchemas.schema_f8b6dd8128e8bfe0, "message": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "reapplyStashCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f355c9e66a3091a2 = RemoteSchema(type: "string", minLength: 1, maxLength: 120, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f399af5f8dcf6035 = RemoteSchema(type: "string", literals: [.string("set-group")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f3c2d2c49187a75b = RemoteSchema(type: "object", required: Set(["action", "objective"]), properties: ["action": RemoteSchemas.schema_10209383e3295873, "objective": RemoteSchemas.schema_422b1e8c8be5e2c0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f3d89ffd4842a73f = RemoteSchema(type: "array", items: RemoteSchemas.schema_b92447920382853b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f450768848c5befd = RemoteSchema(type: "string", literals: [.string("boolean"), .string("choice"), .string("environment"), .string("number"), .string("string")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4633a7147eefce7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_b0c26b27d803b3b4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f46da48437a0c164 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0465e7aaae9c70d7, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4cab1817a71aa36 = RemoteSchema(type: "string", literals: [.string("skills")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f550638b8241897c = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c66f09c6212330ba, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f58a8b771657d037 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f614b14ae0e3bbca = RemoteSchema(type: "object", required: Set(["actionId", "payload", "threadId"]), properties: ["actionId": RemoteSchemas.schema_f355c9e66a3091a2, "payload": RemoteSchemas.schema_e6958017dac6cd3b, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
