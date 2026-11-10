// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_f6a941e10f9feb27 = RemoteSchema(type: "string", pattern: "^codex:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6c555fb5f1777c9 = RemoteSchema(type: "string", literals: [.string("observed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6dd22a2a9de3244 = RemoteSchema(type: "string", literals: [.string("camera"), .string("microphone"), .string("photos"), .string("contacts"), .string("calendar"), .string("location"), .string("notifications"), .string("motion")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6f6c60cfab9884a = RemoteSchema(type: "object", required: Set(["branchRenamed", "kind", "replayed", "thread"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "branchRenamed": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_1fcbd5bc41d865ae, "replayed": RemoteSchemas.schema_feeb8bb50144d96d, "thread": RemoteSchemas.schema_b37f60804aab420f, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f7164d030c9bbeaf = RemoteSchema(type: "integer", minimum: 2.0, maximum: 6.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f71a677b4df4bd5e = RemoteSchema(type: "object", required: Set(["groups"]), properties: ["groups": RemoteSchemas.schema_f3d89ffd4842a73f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f75d628126272292 = RemoteSchema(type: "array", items: RemoteSchemas.schema_98473b8b464036a4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f76e77baaeec46d5 = RemoteSchema(type: "object", required: Set(["utcOffsetMinutes"]), properties: ["deviceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "provider": RemoteSchemas.schema_bf0b727f7b1c6d07, "scope": RemoteSchemas.schema_b99ee3af304513c2, "utcOffsetMinutes": RemoteSchemas.schema_80c415b6e27c6ebd, "window": RemoteSchemas.schema_ae26bc52b712b00c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f7b2db2c4c7fbdd3 = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_384bb6ef598ad698, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f7ecfe1017b42566 = RemoteSchema(type: "string", maxLength: 300, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f802abb4a32bbf85 = RemoteSchema(type: "string", literals: [.string("agent-vision-unwatch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f80bf20556c43632 = RemoteSchema(type: "object", required: Set(["admitted", "cancellations", "long", "queueFullRefusals", "short", "waitTimeoutRefusals"]), properties: ["admitted": RemoteSchemas.schema_56aa0e45cbdce0d0, "cancellations": RemoteSchemas.schema_56aa0e45cbdce0d0, "environments": RemoteSchemas.schema_2f4c1755c2d3a402, "long": RemoteSchemas.schema_164937b9a51028fa, "queueFullRefusals": RemoteSchemas.schema_56aa0e45cbdce0d0, "short": RemoteSchemas.schema_164937b9a51028fa, "slowFetches": RemoteSchemas.schema_56aa0e45cbdce0d0, "waitTimeoutRefusals": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f86171557f2ff456 = RemoteSchema(type: "array", items: RemoteSchemas.schema_11f20430355ec49c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f87159e7882b195f = RemoteSchema(type: "object", required: Set(["settings"]), properties: ["settings": RemoteSchemas.schema_5a8607ab9974cf4e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8afe6df005d2978 = RemoteSchema(type: "string", literals: [.string("history-incomplete")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8b6dd8128e8bfe0 = RemoteSchema(type: "boolean", defaultValue: .bool(false), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8ba039a2f32fad1 = RemoteSchema(type: "number", literals: [.int(2)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8fde013f784c33d = RemoteSchema(type: "object", required: Set(["action", "id", "language", "model"]), properties: ["action": RemoteSchemas.schema_d6b726f850f5dc81, "id": RemoteSchemas.schema_d855999aed5e6438, "language": RemoteSchemas.schema_f4e43b71651c06ad, "model": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f92ad486eceff5e1 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_8345d2f810cef034, RemoteSchemas.schema_89bc4017c2e23cd6, RemoteSchemas.schema_a087b069daed224f], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f958c6e1fa6d616c = RemoteSchema(type: "object", required: Set(["canLinkToGlobal", "effectiveSkillIds", "invocation", "issues", "skills"]), properties: ["canLinkToGlobal": RemoteSchemas.schema_feeb8bb50144d96d, "effectiveSkillIds": RemoteSchemas.schema_0f732b9fceb2c6ac, "invocation": RemoteSchemas.schema_7a20e2f82d6f16d6, "issues": RemoteSchemas.schema_ee5346688873f70f, "skills": RemoteSchemas.schema_4df989d5459165c8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f975b14607ae3f63 = RemoteSchema(type: "object", required: Set(["events"]), properties: ["events": RemoteSchemas.schema_23b45e35f743c6ce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f97770a7e3ba8e29 = RemoteSchema(type: "object", required: Set(["account", "kind", "nameWithOwner"]), properties: ["account": RemoteSchemas.schema_5646cf57ff3aebe0, "kind": RemoteSchemas.schema_cc1f68c41f086183, "nameWithOwner": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
