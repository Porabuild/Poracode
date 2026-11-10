// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_36ba3d858bc826c9 = RemoteSchema(type: "object", required: Set(["kind", "patch", "projectId"]), properties: ["kind": RemoteSchemas.schema_cbc64d14585e9a92, "patch": RemoteSchemas.schema_80fe2d5ae5950377, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_3732eed893106b96 = RemoteSchema(type: "object", required: Set(["url"]), properties: ["url": RemoteSchemas.schema_7f06acbaf20f8c25], additionalAllowed: true, unknownPolicy: .strip)
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

public extension RemoteSchemas {
  static let schema_37c5f2164832811e = RemoteSchema(type: "object", required: Set(["byteLength", "kind", "sha256", "summary", "transferId"]), properties: ["byteLength": RemoteSchemas.schema_0dde37d4b96304ba, "kind": RemoteSchemas.schema_fc6406ea9b9267b2, "sha256": RemoteSchemas.schema_980dbd0a7a812034, "summary": RemoteSchemas.schema_52895aaaf2e8a0f2, "transferId": RemoteSchemas.schema_7f836db787c9df87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_37eeca9f5377b6e4 = RemoteSchema(type: "object", required: Set(["kind", "scope"]), properties: ["kind": RemoteSchemas.schema_274e069cdc933ee1, "scope": RemoteSchemas.schema_dc99757951407418], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38041bf5caec6644 = RemoteSchema(type: "string", literals: [.string("transcript")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38462ff398fbe205 = RemoteSchema(type: "object", required: Set(["absolutePath", "enabled"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_384bb6ef598ad698 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 6.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38754692c8b5ebef = RemoteSchema(type: "object", required: Set(["completedAt", "error", "id", "scheduleId", "startedAt", "status", "summary", "threadId"]), properties: ["attempt": RemoteSchemas.schema_23e05d248383ea40, "automationSnapshot": RemoteSchemas.schema_fdddba9ec6ce269e, "completedAt": RemoteSchemas.schema_595da89b21b7ca56, "error": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_d855999aed5e6438, "iteration": RemoteSchemas.schema_23e05d248383ea40, "result": RemoteSchemas.schema_66ee2eb4eda62117, "scheduleId": RemoteSchemas.schema_d855999aed5e6438, "scheduledFor": RemoteSchemas.schema_38adcf16c79023ce, "startedAt": RemoteSchemas.schema_38adcf16c79023ce, "status": RemoteSchemas.schema_2151c8edcffb30bf, "summary": RemoteSchemas.schema_2d0b6ec9f2b2decf, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "trigger": RemoteSchemas.schema_56296b74a9501a6f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3897f50212cb0b25 = RemoteSchema(type: "object", required: Set(["event", "seq", "type"]), properties: ["event": RemoteSchemas.schema_ca3d163bab055381, "omittedRuntimeThreadIds": RemoteSchemas.schema_515482d2104d1efa, "seq": RemoteSchemas.schema_23e05d248383ea40, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_1aa020e871f1c07e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38adcf16c79023ce = RemoteSchema(type: "string", pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38b68e422d630291 = RemoteSchema(type: "string", literals: [.string("none"), .string("launch"), .string("always")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38c5e1151393f6bd = RemoteSchema(type: "string", pattern: "^antigravity:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38d1a07d3b9b1c82 = RemoteSchema(type: "string", defaultValue: .string(""), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38efdc386b3577e7 = RemoteSchema(type: "string", literals: [.string("uploading"), .string("preparing"), .string("loading"), .string("transcribing"), .string("done")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3935a65be87f52c2 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["type": RemoteSchemas.schema_921834989f2485e5, "url": RemoteSchemas.schema_c1504401bd291fd1], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_3958c7beb695f0ca = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ea7fc856bb9aa12e, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3975ceeb3762f594 = RemoteSchema(type: "object", required: Set(["version", "watchId"]), properties: ["maxChunkBytes": RemoteSchemas.schema_f58a8b771657d037, "maxWindowBytes": RemoteSchemas.schema_f58a8b771657d037, "resume": RemoteSchemas.schema_9997128f830ac42e, "version": RemoteSchemas.schema_23e05d248383ea40, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_398001902e262d65 = RemoteSchema(type: "object", required: Set(["id", "phase"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "phase": RemoteSchemas.schema_38efdc386b3577e7, "progress": RemoteSchemas.schema_a581e67cd137ad59, "transcript": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3994629a32a97c9b = RemoteSchema(type: "object", required: Set(["workflows"]), properties: ["workflows": RemoteSchemas.schema_030ab3973aced8b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_399c72fc193f1510 = RemoteSchema(type: "object", required: Set(["expectedRevision", "legacyConnectionId"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037, "legacyConnectionId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_39a57fc9a7427f91 = RemoteSchema(type: "object", required: Set(["autoMerge", "headBranch", "prNumber", "projectId", "watchEnabled"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "config": RemoteSchemas.schema_f69100925fc0e774, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_39bc2baf33179ca7 = RemoteSchema(type: "object", required: Set(["grantType"]), properties: ["client": RemoteSchemas.schema_696917027581de46, "credential": RemoteSchemas.schema_36fea325bf1aca70, "grantType": RemoteSchemas.schema_20b56c9f2266c25a, "refreshToken": RemoteSchemas.schema_36fea325bf1aca70, "scopes": RemoteSchemas.schema_7978d152fa09ea8e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39c209cff99afe61 = RemoteSchema(type: "object", required: Set(["baseBranch", "branch", "projectLocation", "title"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "body": RemoteSchemas.schema_38d1a07d3b9b1c82, "branch": RemoteSchemas.schema_36fea325bf1aca70, "isDraft": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
