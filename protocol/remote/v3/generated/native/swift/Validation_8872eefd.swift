// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_632568cf23c893da = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["includeRemote": RemoteSchemas.schema_a6ba34cd39bf30c5, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6350bebbf3d13115 = RemoteSchema(type: "string", minLength: 1, maxLength: 24, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_636da2bdcbf5818d = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_6db96506f253ef73, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_637f685cb2418b8c = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_9ff1236d4782edc7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63a5f0fcbab4a3a8 = RemoteSchema(type: "object", required: Set(["id", "label", "selection"]), properties: ["brief": RemoteSchemas.schema_ba7dfbe6c754d186, "fallbacks": RemoteSchemas.schema_60a3d8687bc0025b, "id": RemoteSchemas.schema_020cad6f356d7c67, "label": RemoteSchemas.schema_6350bebbf3d13115, "noEdits": RemoteSchemas.schema_d2dd3595e1b5e5dc, "parallel": RemoteSchemas.schema_6fb5e1ff4ba2dc63, "selection": RemoteSchemas.schema_c33d76cdf9c7d5d7], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_63c18b52ffe65d8d = RemoteSchema(type: "object", required: Set(["additions", "deletions", "path"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "deletions": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63ccc3fa64031cff = RemoteSchema(type: "string", literals: [.string("not_chat"), .string("busy"), .string("no_history"), .string("unsupported_location")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63cf2bb53100cbd8 = RemoteSchema(type: "object", required: Set(["header", "question", "selected"]), properties: ["customAnswer": RemoteSchemas.schema_bf0b727f7b1c6d07, "header": RemoteSchemas.schema_bf0b727f7b1c6d07, "question": RemoteSchemas.schema_bf0b727f7b1c6d07, "selected": RemoteSchemas.schema_0cd9513af81aeee1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6422ecf430b9e0a8 = RemoteSchema(type: "object", required: Set(["revision", "unchanged"]), properties: ["revision": RemoteSchemas.schema_2d20bc896a08a92b, "unchanged": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64570e224963bb89 = RemoteSchema(type: "string", literals: [.string("browser-input")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_645d18fd9a611f68 = RemoteSchema(type: "string", literals: [.string("commit"), .string("pr"), .string("conflict")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64900cfb16aa539e = RemoteSchema(type: "object", properties: ["cursor": RemoteSchemas.schema_36fea325bf1aca70, "limit": RemoteSchemas.schema_85b777c0c99bbbca, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "mode": RemoteSchemas.schema_902ee7904a410968, "order": RemoteSchemas.schema_42146530bc4d74c4, "reads": RemoteSchemas.schema_4659e6d395f41e16, "summaries": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_649f2dd010d75dad = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_862e6a81a05c9f92, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_64dd00a3a569fc23 = RemoteSchema(type: "object", required: Set(["worktreeLocation"]), properties: ["reapplyStashCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "worktreeLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64e71691dcceabd9 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "untrackedPaths": RemoteSchemas.schema_aac2a4e83d2823be], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6508684ba659826b = RemoteSchema(type: "string", literals: [.string("terminal"), .string("gui")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6554493bfa61b085 = RemoteSchema(type: "object", required: Set(["action", "agentKind", "create", "env", "provider", "revision"]), properties: ["action": RemoteSchemas.schema_a2bcbae622b18cea, "agentKind": RemoteSchemas.schema_8e43cad70cd70de7, "apiKey": RemoteSchemas.schema_d48d13740c8803d4, "create": RemoteSchemas.schema_feeb8bb50144d96d, "env": RemoteSchemas.schema_2583fd799237ae71, "provider": RemoteSchemas.schema_9b6b648329c17d0e, "revision": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_65899fb957cb9421 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_65955df8384777ba = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation", "prompt"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "language": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_36fea325bf1aca70, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_65b6b00dc35d2b27 = RemoteSchema(type: "object", required: Set(["action", "kind", "threadIds"]), properties: ["action": RemoteSchemas.schema_e9d06fff5d247f24, "kind": RemoteSchemas.schema_70ab564010eb05b0, "removeOwnedWorktrees": RemoteSchemas.schema_feeb8bb50144d96d, "threadIds": RemoteSchemas.schema_0c6254245418ba4c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_65e6698fa7640db4 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_38b68e422d630291, "terminal": RemoteSchemas.schema_38b68e422d630291], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_65ec808e7a55f981 = RemoteSchema(type: "object", required: Set(["providers"]), properties: ["providers": RemoteSchemas.schema_7fdc1b397391e8f3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66021940878f3abc = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_3d1908a6bccf4864, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6602e9e9c3006d18 = RemoteSchema(type: "object", required: Set(["commit", "current", "isRemote", "name"]), properties: ["commit": RemoteSchemas.schema_bf0b727f7b1c6d07, "current": RemoteSchemas.schema_feeb8bb50144d96d, "isRemote": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "remote": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6639dee694efeebe = RemoteSchema(type: "array", maxItems: 32, items: RemoteSchemas.schema_bd72dfdbe3300bed, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66504fdb436f3b0e = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_5465dd986b32b774, "path": RemoteSchemas.schema_bd85a52dd25effae, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_665acf486e1a0586 = RemoteSchema(type: "object", required: Set(["ref", "refreshedAt"]), properties: ["branches": RemoteSchemas.schema_cbe0ba241100dba5, "ghAvailable": RemoteSchemas.schema_feeb8bb50144d96d, "ref": RemoteSchemas.schema_83470ce63973b6e2, "refreshedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_c1d4a9f752e166b1, "worktrees": RemoteSchemas.schema_cd357f47aa772b6a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66846085f373f57f = RemoteSchema(type: "object", required: Set(["threadId", "type"]), properties: ["reason": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_000753aa3ed87d21], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66c1d4f45e673970 = RemoteSchema(type: "array", maxItems: 12, items: RemoteSchemas.schema_ed6b68dea9d34806, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66d66ce0fd3d9001 = RemoteSchema(type: "string", literals: [.string("global")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66e7754fba8eca93 = RemoteSchema(type: "string", literals: [.string("value"), .string("json"), .string("text-list"), .string("terminal")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66ee2eb4eda62117 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ae4a7605815e4393, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_67373e16013c20e7 = RemoteSchema(type: "object", required: Set(["expectedRevision", "fingerprint"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037, "fingerprint": RemoteSchemas.schema_d3359b6d5db5b90d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_678d084ee287670a = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_2363c4dd0a78ce9d, "terminal": RemoteSchemas.schema_2363c4dd0a78ce9d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6801e053c0220116 = RemoteSchema(type: "string", literals: [.string("back")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_682526ffe765f76a = RemoteSchema(type: "string", minLength: 1, maxLength: 64, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_682961f5d2dbd9ba = RemoteSchema(type: "string", maxLength: 5592408, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_684d2eec4cf8a72b = RemoteSchema(type: "string", minLength: 4, maxLength: 262144, pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_685dee710cb094fd = RemoteSchema(type: "object", required: Set(["args", "binary"]), properties: ["args": RemoteSchemas.schema_0f732b9fceb2c6ac, "binary": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6900ba2bd97d76fc = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceBranchOverride": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_694e88722e472029 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cd357f47aa772b6a, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_696917027581de46 = RemoteSchema(type: "object", properties: ["deviceType": RemoteSchemas.schema_28ab5341451545c8, "label": RemoteSchemas.schema_36fea325bf1aca70, "os": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_69711423c3b7d2a6 = RemoteSchema(type: "string", literals: [.string("abort")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_69af29ff385f1e03 = RemoteSchema(type: "object", required: Set(["kind", "workspaceId"]), properties: ["kind": RemoteSchemas.schema_96cd458fa9bae303, "workspaceId": RemoteSchemas.schema_df704162f3d15808], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_69f5ba498bd960ff = RemoteSchema(type: "object", required: Set(["item"]), properties: ["item": RemoteSchemas.schema_4c1171296b6868a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_69ff9fac2802eff8 = RemoteSchema(type: "array", items: RemoteSchemas.schema_5a704f7ccb489059, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6a0abedb39fd6f31 = RemoteSchema(type: "string", literals: [.string("delete-worktree-group")], unknownPolicy: .strip)
}
