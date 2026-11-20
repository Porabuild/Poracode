// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_0943be33f9e190f8 = RemoteSchema(type: "object", required: Set(["currentDeviceId", "devices"]), properties: ["currentDeviceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "devices": RemoteSchemas.schema_744f57e3eb025261], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_095caa15231b6058 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_281d24bbbaa46745, "numTurns": RemoteSchemas.schema_56aa0e45cbdce0d0, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09765c7778825d10 = RemoteSchema(type: "object", required: Set(["kind", "projectId", "threadIds", "worktreePath"]), properties: ["kind": RemoteSchemas.schema_6a0abedb39fd6f31, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "threadIds": RemoteSchemas.schema_0c6254245418ba4c, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09b66dd237e8c823 = RemoteSchema(type: "object", required: Set(["baseCheckpointItemId", "baseRef", "capturedAt", "changedFiles", "checkpointItemId", "commit", "ref", "threadId"]), properties: ["baseCheckpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "baseRef": RemoteSchemas.schema_36fea325bf1aca70, "capturedAt": RemoteSchemas.schema_36fea325bf1aca70, "changedFiles": RemoteSchemas.schema_5604f00f2a788035, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "commit": RemoteSchemas.schema_36fea325bf1aca70, "ref": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09b78d9c1d4c3a6b = RemoteSchema(type: "object", required: Set(["threadId"]), properties: ["threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09c88cb14a2765e9 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09cbc76a2a7d52d2 = RemoteSchema(type: "object", required: Set(["decision", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_38d1a07d3b9b1c82, "decision": RemoteSchemas.schema_c0551fbf082fff0f, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09f700fdeb3e5213 = RemoteSchema(type: "object", required: Set(["id", "kind"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_d12ea655163290cc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a08597c6c22cade = RemoteSchema(type: "string", literals: [.string("thread")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a0c8726ed2784f3 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["category": RemoteSchemas.schema_bf0b727f7b1c6d07, "controlType": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "role": RemoteSchemas.schema_09201de15f15ed50, "type": RemoteSchemas.schema_91b38b813d4e4091], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a18d7dfd6025fad = RemoteSchema(type: "array", minItems: 1, maxItems: 1, items: RemoteSchemas.schema_19bc3ac82d723fad, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a49efe270718ab9 = RemoteSchema(type: "object", required: Set(["expression", "kind", "timeZone"]), properties: ["expression": RemoteSchemas.schema_75bcf0cf295f1752, "kind": RemoteSchemas.schema_a050e4e43216f73b, "timeZone": RemoteSchemas.schema_be5d5f9829abefd6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a5d0a388502828c = RemoteSchema(type: "object", required: Set(["label"]), properties: ["detail": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0aacda6901eb566b = RemoteSchema(type: "object", required: Set(["action", "language"]), properties: ["action": RemoteSchemas.schema_862e6a81a05c9f92, "language": RemoteSchemas.schema_f4e43b71651c06ad], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0abd6180b71e8684 = RemoteSchema(type: "array", items: RemoteSchemas.schema_63c18b52ffe65d8d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0ad133ee5894107b = RemoteSchema(type: "object", required: Set(["status", "type"]), properties: ["status": RemoteSchemas.schema_018e665246931443, "type": RemoteSchemas.schema_ab6b873225f5c96a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0ae85718844e0018 = RemoteSchema(type: "object", required: Set(["countLabel", "kind", "label", "rows"]), properties: ["countLabel": RemoteSchemas.schema_dfc3f3726c991dbe, "kind": RemoteSchemas.schema_0b65061c63a380da, "label": RemoteSchemas.schema_7885f0e6f248437e, "rows": RemoteSchemas.schema_96dbcc526b5fade7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0b2ba27512e423eb = RemoteSchema(type: "object", required: Set(["control", "kind", "version"]), properties: ["control": RemoteSchemas.schema_9040d7586304950d, "kind": RemoteSchemas.schema_6eed5e1fa2ae0e54, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_0b5555e2ca059ee2 = RemoteSchema(type: "object", required: Set(["type", "value"]), properties: ["type": RemoteSchemas.schema_c5a25a432208abbf, "value": RemoteSchemas.schema_8e9c16e558778bd4], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_0b65061c63a380da = RemoteSchema(type: "string", literals: [.string("disclosure-list")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0b7e529d3af3c3cd = RemoteSchema(type: "object", required: Set(["size", "stream"]), properties: ["size": RemoteSchemas.schema_ece1ba6d7edbc0d7, "stream": RemoteSchemas.schema_7a39782ede66b352], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0b938cf4ea78a934 = RemoteSchema(type: "object", required: Set(["baseBranch", "branch", "projectLocation", "title"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "body": RemoteSchemas.schema_38d1a07d3b9b1c82, "branch": RemoteSchemas.schema_36fea325bf1aca70, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "isDraft": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0bb586e07b3abfce = RemoteSchema(type: "object", required: Set(["text", "type"]), properties: ["text": RemoteSchemas.schema_866aaf9918167eb9, "type": RemoteSchemas.schema_3ad514880db80c82], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0bd6eab0e269161f = RemoteSchema(type: "object", required: Set(["fastForward", "merged", "newSourceCommit"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastForward": RemoteSchemas.schema_feeb8bb50144d96d, "merged": RemoteSchemas.schema_feeb8bb50144d96d, "newSourceCommit": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0bd7710eac491f27 = RemoteSchema(type: "object", properties: ["core": RemoteSchemas.schema_bf0b727f7b1c6d07, "details": RemoteSchemas.schema_bf0b727f7b1c6d07, "diff": RemoteSchemas.schema_bf0b727f7b1c6d07, "files": RemoteSchemas.schema_bf0b727f7b1c6d07, "reviewThreads": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0c5d3d75e4ff2cec = RemoteSchema(type: "string", minLength: 1, maxLength: 100, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_0c6254245418ba4c = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0cd9513af81aeee1 = RemoteSchema(type: "array", items: RemoteSchemas.schema_58a226c992f64fc4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0cdfc047b0a2e1bb = RemoteSchema(type: "string", literals: [.string("swipe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0cf71567208700d7 = RemoteSchema(type: "object", properties: ["scope": RemoteSchemas.schema_be6dbda06af6b811, "wslDistros": RemoteSchemas.schema_242a5ef77d1f8924], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d1cc1ca31f4769d = RemoteSchema(type: "array", minItems: 1, maxItems: 100, items: RemoteSchemas.schema_2ebee6ffa37983f2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d1cde2ef9942a8d = RemoteSchema(type: "object", required: Set(["add", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "remove"]), properties: ["add": RemoteSchemas.schema_5fa67a35ab2d9fef, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remove": RemoteSchemas.schema_5fa67a35ab2d9fef], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d39188d7ce690df = RemoteSchema(type: "object", required: Set(["conclusion", "name", "state"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d697736dcd0a145 = RemoteSchema(type: "string", maxLength: 349528, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d6d6153b8ec8300 = RemoteSchema(type: "object", required: Set(["firstNonempty"]), properties: ["firstNonempty": RemoteSchemas.schema_dc0f3a73422e770a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d863fe3501fe68f = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_feeb8bb50144d96d, "output": RemoteSchemas.schema_bf0b727f7b1c6d07, "strategy": RemoteSchemas.schema_b82b9e494d3a9a40], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0dc750244bb89d0c = RemoteSchema(type: "array", minItems: 2, items: RemoteSchemas.schema_27d9340da4120b27, unknownPolicy: .strip)
}
