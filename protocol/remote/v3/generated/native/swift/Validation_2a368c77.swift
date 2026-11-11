// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_51fc061b3ecc735c = RemoteSchema(type: "object", required: Set(["newLocation", "projectId"]), properties: ["newLocation": RemoteSchemas.schema_080f9cc154af9e27, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_522013c70826ee65 = RemoteSchema(type: "string", literals: [.string("unavailable"), .string("busy"), .string("invalid_request"), .string("not_ready"), .string("failed"), .string("cancelled"), .string("timeout"), .string("disconnected"), .string("incompatible"), .string("unsupported"), .string("download_failed"), .string("integrity"), .string("permission_denied")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_522b0d7f41276332 = RemoteSchema(type: "object", required: Set(["hash", "message"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "hash": RemoteSchemas.schema_bf0b727f7b1c6d07, "message": RemoteSchemas.schema_bf0b727f7b1c6d07, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_52895aaaf2e8a0f2 = RemoteSchema(type: "object", required: Set(["attachmentCount", "git", "itemCount", "turnCount"]), properties: ["attachmentCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "git": RemoteSchemas.schema_6fc62da359394b16, "itemCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "turnCount": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5296d6b04d46b630 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4c967d4ed16edbc1, RemoteSchemas.schema_e0da1e0a5e3cd077, RemoteSchemas.schema_a66324f9a46c480b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_52fb827fec8a0504 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_5cddec4454f9cd6a, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_53996e5a27a5b0c4 = RemoteSchema(type: "string", pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", unknownPolicy: .strip, transformIds: ["push.routing.client-connection-id.lowercase"])
}

public extension RemoteSchemas {
  static let schema_53ceafeed27db1df = RemoteSchema(type: "string", literals: [.string("archive")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_53dc1dce3c536b94 = RemoteSchema(type: "string", literals: [.string("listTools")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_53e1ad57ca4daef6 = RemoteSchema(type: "object", required: Set(["forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "query": RemoteSchemas.schema_e78f40fc5399f7f1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_53f3c1938556e280 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 59.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_540ab9236f8c36ab = RemoteSchema(type: "object", required: Set(["posix", "windows"]), properties: ["posix": RemoteSchemas.schema_685dee710cb094fd, "windows": RemoteSchemas.schema_685dee710cb094fd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_543fbae99d61b8d1 = RemoteSchema(type: "object", required: Set(["access", "path", "projectLocation"]), properties: ["access": RemoteSchemas.schema_8423ce6905ffd393, "disposition": RemoteSchemas.schema_7db74ec55cf0af32, "path": RemoteSchemas.schema_bd85a52dd25effae, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5455d140717a50b3 = RemoteSchema(type: "string", literals: [.string("user_message"), .string("assistant_message"), .string("reasoning"), .string("plan"), .string("goal"), .string("command_execution"), .string("file_change"), .string("tool_call"), .string("mcp_tool_call"), .string("image_view"), .string("dynamic_tool_call"), .string("web_search"), .string("question_answer"), .string("provider_handoff"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5465dd986b32b774 = RemoteSchema(type: "string", literals: [.string("windows")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_54c83506378cf7c8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_f3c2d2c49187a75b, RemoteSchemas.schema_43d29f1d5a2e1f23], unknownPolicy: .strip, semanticIds: ["thread.goal.objective.trim"])
}

public extension RemoteSchemas {
  static let schema_54e62eb98f37e953 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ed8928e1a85aa112, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_54e79a700cdcdd03 = RemoteSchema(type: "string", literals: [.string("heartbeat")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5513eb6f6fbb46a0 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["filePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "staged": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_551f784ecdbbf2f4 = RemoteSchema(type: "object", required: Set(["absolutePath", "baseModifiedAtMs", "content", "projectLocation"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "baseModifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "content": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_552de755ef856a71 = RemoteSchema(type: "string", literals: [.string("already")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_553c5c509350e4e7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_6508684ba659826b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_559c498a020be6ad = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "retry": RemoteSchemas.schema_feeb8bb50144d96d, "state": RemoteSchemas.schema_b191f81602296a89], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_55bad6da24b769c6 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_5093c62d05bf0072, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_55c4cb32b40db3a8 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "expectedOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "force": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["git.delete-branch.remote-cannot-have-owner"])
}
