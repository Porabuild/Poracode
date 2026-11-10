// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_39d6579ca7450396 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["admin": RemoteSchemas.schema_f8b6dd8128e8bfe0, "method": RemoteSchemas.schema_72373308389f2027, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39d8d7cbf4384109 = RemoteSchema(type: "array", maxItems: 200, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39f0b40d9df37da7 = RemoteSchema(type: "object", required: Set(["filePath", "projectLocation"]), properties: ["filePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3a008e3c404a93c8 = RemoteSchema(type: "string", literals: [.string("running"), .string("completed"), .string("failed"), .string("cancelled"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3a27703aead13583 = RemoteSchema(type: "object", required: Set(["ownerToken"]), properties: ["ownerToken": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3a38f5dc8038f065 = RemoteSchema(type: "integer", minimum: 2.0, maximum: 120.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3a762c9b6eacc492 = RemoteSchema(type: "number", minimum: -90.0, maximum: 90.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ac0e8087f32acdf = RemoteSchema(type: "string", literals: [.string("reduceMotion")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ac3526f6a2607f3 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_61fc4b3eaedeba13], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ad15ffc16029f9a = RemoteSchema(type: "object", required: Set(["adminMerge", "autoFix", "autoMerge", "checks", "draft", "edit", "expectedHeadMerge", "mergeMethods", "rebaseBranch", "reopen", "reviewDecisions", "reviewThreads", "updateBranch"]), properties: ["adminMerge": RemoteSchemas.schema_feeb8bb50144d96d, "autoFix": RemoteSchemas.schema_feeb8bb50144d96d, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "checks": RemoteSchemas.schema_feeb8bb50144d96d, "commentEditing": RemoteSchemas.schema_78ecc0eb2955fb7f, "commitDiffs": RemoteSchemas.schema_d2dd3595e1b5e5dc, "convertToDraft": RemoteSchemas.schema_d2dd3595e1b5e5dc, "draft": RemoteSchemas.schema_feeb8bb50144d96d, "edit": RemoteSchemas.schema_feeb8bb50144d96d, "expectedHeadMerge": RemoteSchemas.schema_feeb8bb50144d96d, "labels": RemoteSchemas.schema_d2dd3595e1b5e5dc, "mergeMethods": RemoteSchemas.schema_58317133a27c74f8, "reactions": RemoteSchemas.schema_30057dd734d040ce, "rebaseBranch": RemoteSchemas.schema_feeb8bb50144d96d, "reopen": RemoteSchemas.schema_feeb8bb50144d96d, "reviewDecisions": RemoteSchemas.schema_cdc4a9f3587d0382, "reviewDrafts": RemoteSchemas.schema_d2dd3595e1b5e5dc, "reviewGuides": RemoteSchemas.schema_d2dd3595e1b5e5dc, "reviewRequests": RemoteSchemas.schema_d2dd3595e1b5e5dc, "reviewThreads": RemoteSchemas.schema_feeb8bb50144d96d, "updateBranch": RemoteSchemas.schema_feeb8bb50144d96d, "viewedFiles": RemoteSchemas.schema_ae682752b1c14d17], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ad514880db80c82 = RemoteSchema(type: "string", literals: [.string("text")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3b681a533b5fa621 = RemoteSchema(type: "object", required: Set(["notices"]), properties: ["notices": RemoteSchemas.schema_f67f6cbe63879b24], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3c115ff749c28304 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0d39188d7ce690df, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3c40bff8b05543d7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_feeb8bb50144d96d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3c594c99571d82f9 = RemoteSchema(type: "string", pattern: "^factory:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3c702b70b3eb4220 = RemoteSchema(type: "string", literals: [.string("ios"), .string("ios-video"), .string("android")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3cc2bb39a7445b48 = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_a02c812507215fb8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ccadafaab48b090 = RemoteSchema(type: "object", properties: ["exclude": RemoteSchemas.schema_cda18ebe4af54c5c, "useIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3cd19b85f5490a72 = RemoteSchema(type: "string", literals: [.string("url")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3cdb2ff0de916278 = RemoteSchema(type: "string", maxLength: 512, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3d06117798bf5171 = RemoteSchema(type: "integer", minimum: -9007199254740991.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3d188d85aa0799fe = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_2d29c7255e1cf1b1, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3d1908a6bccf4864 = RemoteSchema(type: "string", literals: [.string("oauth-begin")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3d3e7c3b5882bbbe = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_8d889103a9834b21, RemoteSchemas.schema_891d4598b0ce7d6d, RemoteSchemas.schema_b01e26e0438140cd, RemoteSchemas.schema_5aa949613e8394ce, RemoteSchemas.schema_21cd039cb32b3851, RemoteSchemas.schema_1ae7de2180f145f4, RemoteSchemas.schema_2e4d2aaed030369e, RemoteSchemas.schema_c3363423bb669510, RemoteSchemas.schema_80906c6ddc7c6c9e, RemoteSchemas.schema_ebd70a208b453fe1, RemoteSchemas.schema_b79d8f64de4f41bd, RemoteSchemas.schema_09765c7778825d10, RemoteSchemas.schema_431be1ab7e1b0dc9, RemoteSchemas.schema_a93ba7bf23f9b121, RemoteSchemas.schema_370ff0ec0af5649a, RemoteSchemas.schema_2062bc5ac9057c02, RemoteSchemas.schema_efd9410c7543c4c0, RemoteSchemas.schema_69af29ff385f1e03, RemoteSchemas.schema_c26b952dfa583dcd], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3dd69184dc64b745 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_adaa80878b467841, RemoteSchemas.schema_d1624ea0ecc46dc6, RemoteSchemas.schema_2840caeaedca16a2, RemoteSchemas.schema_94dda13e1cf59dea], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3df0ab0b4ea7223c = RemoteSchema(type: "string", literals: [.string("close-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3df4f14bf23d248d = RemoteSchema(type: "object", required: Set(["absolutePath"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3df8195e9076bb2b = RemoteSchema(type: "object", required: Set(["method", "requestId", "response"]), properties: ["method": RemoteSchemas.schema_36fea325bf1aca70, "requestId": RemoteSchemas.schema_a44865d83be28e9f, "response": RemoteSchemas.schema_ca3d163bab055381], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e412d7b328b3f5a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_3ccadafaab48b090, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e58e9f152d76240 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_468209f9bb01c8a9, RemoteSchemas.schema_2b7595c3da8bc0e9, RemoteSchemas.schema_da66851500474562, RemoteSchemas.schema_36ba3d858bc826c9, RemoteSchemas.schema_27aa97567424846c, RemoteSchemas.schema_37addcca5b32752c, RemoteSchemas.schema_580efa06e9547a64, RemoteSchemas.schema_ebfa6f1c64210a5f, RemoteSchemas.schema_8573967ac3b77c66], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e5dc6593b33f225 = RemoteSchema(type: "object", required: Set(["prs"]), properties: ["prs": RemoteSchemas.schema_a7a958b1f69d54ee], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e6404f86586fcab = RemoteSchema(type: "object", required: Set(["id", "label", "usedPercent"]), properties: ["currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_29b52750e42441f8, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "limit": RemoteSchemas.schema_f696f11685898ba7, "resetsAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "unit": RemoteSchemas.schema_c263982707afed92, "used": RemoteSchemas.schema_f696f11685898ba7, "usedPercent": RemoteSchemas.schema_a581e67cd137ad59], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e68ba0d03654c68 = RemoteSchema(type: "string", literals: [.string("forward")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ee9ee08aa6a662d = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["forge.edit.fields"])
}

public extension RemoteSchemas {
  static let schema_3f02a5451ac550c4 = RemoteSchema(type: "array", maxItems: 100, items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f3680e5774b47dd = RemoteSchema(type: "object", required: Set(["childDesktopId", "endpoint", "environmentId", "pairingCredential"]), properties: ["childDesktopId": RemoteSchemas.schema_97d85a5eaee82b97, "endpoint": RemoteSchemas.schema_85c1db78d5c7dc29, "environmentId": RemoteSchemas.schema_d855999aed5e6438, "pairingCredential": RemoteSchemas.schema_85c1db78d5c7dc29], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f58316dbb160752 = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_23a1c447c059f0da, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_740c7dc82a88634a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f5bcd72f92b6f9f = RemoteSchema(type: "string", literals: [.string("browser-watch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_402930e3e48d3bdd = RemoteSchema(type: "object", required: Set(["active", "pending", "retiring"]), properties: ["active": RemoteSchemas.schema_56aa0e45cbdce0d0, "pending": RemoteSchemas.schema_56aa0e45cbdce0d0, "retiring": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_404d099c5c6a9b12 = RemoteSchema(type: "object", required: Set(["byteLength", "kind", "projectId", "sha256", "threadId", "transferId"]), properties: ["agent": RemoteSchemas.schema_ad6b325f634f4e2e, "byteLength": RemoteSchemas.schema_0dde37d4b96304ba, "kind": RemoteSchemas.schema_1fcbd5bc41d865ae, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "sha256": RemoteSchemas.schema_980dbd0a7a812034, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "transferId": RemoteSchemas.schema_7f836db787c9df87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4067ad04bfbe200c = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
