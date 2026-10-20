// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_7f9f5a0d72de0d9a = RemoteSchema(type: "number", literals: [.int(1)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7fdc1b397391e8f3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0a5d0a388502828c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7fe780499159088a = RemoteSchema(type: "string", literals: [.string("done")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8015752827e2b146 = RemoteSchema(type: "object", properties: ["completedTurnsLimit": RemoteSchemas.schema_be268483fb86810f, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "omitScrollback": RemoteSchemas.schema_feeb8bb50144d96d, "projection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimePage": RemoteSchemas.schema_8795ea0289d608d6, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80906c6ddc7c6c9e = RemoteSchema(type: "object", required: Set(["done", "kind"]), properties: ["done": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_a9e065ca182491e5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80a9ff940d24dba8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_3328521e00056564, RemoteSchemas.schema_51f2acb99ea96b5b, RemoteSchemas.schema_483d5aa44fc0eaba, RemoteSchemas.schema_875b3bd94059f8e1, RemoteSchemas.schema_290453f28a433311, RemoteSchemas.schema_82fdb789883e6159, RemoteSchemas.schema_500ee3799383d21f, RemoteSchemas.schema_22c8bcdab9edbc02], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80ac3a097b3c79c7 = RemoteSchema(type: "object", properties: ["breakdown": RemoteSchemas.schema_3008927746cc013b, "maxTokens": RemoteSchemas.schema_23e05d248383ea40, "usedTokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80c415b6e27c6ebd = RemoteSchema(type: "number", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80f7976aee3c4505 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_ab08aad343958c81, RemoteSchemas.schema_b9d24da8425fcc77], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8103808258c2d166 = RemoteSchema(type: "object", required: Set(["name"]), properties: ["label": RemoteSchemas.schema_2d0b6ec9f2b2decf, "name": RemoteSchemas.schema_36fea325bf1aca70, "optional": RemoteSchemas.schema_feeb8bb50144d96d, "secret": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_81055c9199569630 = RemoteSchema(type: "object", additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_81440643a0f1796d = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_61fc4b3eaedeba13, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_815909fa96d68d7b = RemoteSchema(type: "object", required: Set(["itemId", "threadId"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_820293e02a103abf = RemoteSchema(type: "object", properties: ["name": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82088d0ad1ba613a = RemoteSchema(type: "object", required: Set(["imported"]), properties: ["imported": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_825afc62b855f7e6 = RemoteSchema(type: "object", required: Set(["actions"]), properties: ["actions": RemoteSchemas.schema_c286f4704a09cde8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_828172bf1752b0f1 = RemoteSchema(type: "object", required: Set(["marketplace"]), properties: ["marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "query": RemoteSchemas.schema_e5bbd3e940039349, "sort": RemoteSchemas.schema_1eaf563a1e9fa631], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_829c74ec0aec2226 = RemoteSchema(type: "string", literals: [.string("desktop-event")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82e8027595898a28 = RemoteSchema(type: "object", required: Set(["conclusion", "id", "name", "status", "steps"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_3d06117798bf5171, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07, "steps": RemoteSchemas.schema_f1a8832c8ce43a2f, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82e9f889c9c5a99f = RemoteSchema(type: "string", literals: [.string("fixed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82fdb789883e6159 = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_6801e053c0220116, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_833ef472e7760fae = RemoteSchema(type: "string", literals: [.string("set-starred")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8345d2f810cef034 = RemoteSchema(type: "object", required: Set(["kind", "scope", "server"]), properties: ["kind": RemoteSchemas.schema_375b3978f669c107, "scope": RemoteSchemas.schema_dc99757951407418, "server": RemoteSchemas.schema_c04b1452d18edb3f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83470ce63973b6e2 = RemoteSchema(type: "object", required: Set(["hostId", "projectId"]), properties: ["hostId": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_835d30ad470a686c = RemoteSchema(type: "string", literals: [.string("posix")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83671e64288686fc = RemoteSchema(type: "object", required: Set(["hash"]), properties: ["appVersion": RemoteSchemas.schema_a016251474d39e0d, "hash": RemoteSchemas.schema_ec221fdc1494d0b1], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_838adcbcaff5f551 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_3975ceeb3762f594, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c64b38404fc9a1d4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_839da5c7aa9ba993 = RemoteSchema(type: "object", required: Set(["author", "body", "createdAt", "id"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83c7c01b4046dd13 = RemoteSchema(type: "object", required: Set(["command", "type"]), properties: ["args": RemoteSchemas.schema_aac2a4e83d2823be, "command": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_36fea325bf1aca70, "env": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_01f71c4e26e7ecde], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8423ce6905ffd393 = RemoteSchema(type: "string", literals: [.string("external")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8428abfcec0a8b32 = RemoteSchema(type: "object", required: Set(["environment"]), properties: ["environment": RemoteSchemas.schema_d832acd230fbc919], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84503a3e631d0429 = RemoteSchema(type: "object", required: Set(["groups", "id", "type", "values"]), properties: ["category": RemoteSchemas.schema_bf0b727f7b1c6d07, "currentValue": RemoteSchemas.schema_bf0b727f7b1c6d07, "groups": RemoteSchemas.schema_a8f9536c8e956810, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "role": RemoteSchemas.schema_09201de15f15ed50, "type": RemoteSchemas.schema_36b9fe91ec45bcd5, "values": RemoteSchemas.schema_f46da48437a0c164], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_849e43bfc063f1bb = RemoteSchema(type: "object", required: Set(["invocation", "kind", "name", "provider", "scope"]), properties: ["invocation": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2a65cef1bc5905f9, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "provider": RemoteSchemas.schema_36fea325bf1aca70, "scope": RemoteSchemas.schema_ac6ea0fc110d7efb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84af3e97516dc824 = RemoteSchema(type: "object", required: Set(["experimentId"]), properties: ["experimentId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84c6a19f87f29012 = RemoteSchema(type: "array", minItems: 1, maxItems: 8, items: RemoteSchemas.schema_941a12a3ce0aadca, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84ccfb83d8334510 = RemoteSchema(type: "object", required: Set(["every", "kind", "unit"]), properties: ["every": RemoteSchemas.schema_dcf7bba14632f6b7, "kind": RemoteSchemas.schema_6cf695d23ae995e6, "unit": RemoteSchemas.schema_e4a434d61cd0f65f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8532cee498146283 = RemoteSchema(type: "object", required: Set(["text"]), properties: ["text": RemoteSchemas.schema_769c50c6909920b7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85b777c0c99bbbca = RemoteSchema(type: "integer", minimum: 1.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85c1db78d5c7dc29 = RemoteSchema(type: "string", minLength: 1, maxLength: 512, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85cd2a40f756baae = RemoteSchema(type: "object", required: Set(["id", "label"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85d2dd31fd2f4872 = RemoteSchema(type: "object", required: Set(["state", "threadId", "turnId", "type"]), properties: ["state": RemoteSchemas.schema_115555b2d2065a65, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_cdcee850f284e657], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86230e1fa3f38188 = RemoteSchema(type: "string", literals: [.string("wsl-user")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_868bf1042a1bbba1 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86b938ce61c1942e = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_d66267c393bb4ec4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86d5d72e84423420 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_0f732b9fceb2c6ac, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_871fe12f7dc5ccf6 = RemoteSchema(type: "object", required: Set(["answerSdp"]), properties: ["answerSdp": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_872dc7babad00cd3 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1709690cf0edf961, RemoteSchemas.schema_2b7b34c95b23bb0d, RemoteSchemas.schema_0e8f58f429bb1135, RemoteSchemas.schema_d550ef9994fd388f, RemoteSchemas.schema_838adcbcaff5f551, RemoteSchemas.schema_5af10e67b405a136, RemoteSchemas.schema_3f58316dbb160752, RemoteSchemas.schema_d2299af726097d6c, RemoteSchemas.schema_93bef3a552bf787e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_875b3bd94059f8e1 = RemoteSchema(type: "object", required: Set(["kind", "position", "tabId", "targetTabId"]), properties: ["kind": RemoteSchemas.schema_ed1865d937c91a50, "position": RemoteSchemas.schema_3512bd687eb85e90, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "targetTabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8793e380887b215f = RemoteSchema(type: "string", literals: [.string("clone")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8795ea0289d608d6 = RemoteSchema(type: "string", literals: [.string("1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_883b3b8a6153aa17 = RemoteSchema(type: "string", literals: [.string("read-error"), .string("missing-file"), .string("too-large"), .string("missing-frontmatter"), .string("missing-name"), .string("invalid-name"), .string("name-mismatch"), .string("missing-description"), .string("description-too-long")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_88444d52d400622b = RemoteSchema(type: "string", literals: [.string("relocate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_88480e7409f5bc30 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("server")], defaultValue: .string("terminal"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8850f6c7f12f8eb8 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_835d30ad470a686c, "path": RemoteSchemas.schema_bd85a52dd25effae, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89033d459dedce3c = RemoteSchema(type: "object", required: Set(["marketplace", "skills", "total"]), properties: ["marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "skills": RemoteSchemas.schema_2f0b42b84f3f48a0, "total": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8906d017ba691d6f = RemoteSchema(type: "object", required: Set(["kind", "text"]), properties: ["kind": RemoteSchemas.schema_19030914d1c4d410, "text": RemoteSchemas.schema_00876431431924e0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_891e9ab2413a4e77 = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_620971ca171eff87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_892eceb2acf00deb = RemoteSchema(type: "object", properties: ["brew": RemoteSchemas.schema_36fea325bf1aca70, "builtIn": RemoteSchemas.schema_685dee710cb094fd, "homebrewCask": RemoteSchemas.schema_36fea325bf1aca70, "installer": RemoteSchemas.schema_540ab9236f8c36ab, "latestVersionUrls": RemoteSchemas.schema_c2e8606952666d2c, "npm": RemoteSchemas.schema_36fea325bf1aca70, "preferPackageManagerOnWindows": RemoteSchemas.schema_d3ebc3c9a3e4d5bc, "verifyBuiltInVersionChange": RemoteSchemas.schema_feeb8bb50144d96d, "windowsNpmInstallArgs": RemoteSchemas.schema_0f732b9fceb2c6ac, "winget": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89303c6cbb3ecd9a = RemoteSchema(type: "string", pattern: "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8951a961f885eeda = RemoteSchema(type: "object", required: Set(["accounts", "available", "device", "generatedAt", "lifetimeTokens", "models", "peakDayTokens", "providers", "scope", "timezoneOffsetMinutes", "tokenHeatmap", "unavailableProviders", "windowDays"]), properties: ["accounts": RemoteSchemas.schema_d0fa817300598095, "available": RemoteSchemas.schema_feeb8bb50144d96d, "costs": RemoteSchemas.schema_70dc157e5476457b, "device": RemoteSchemas.schema_26f96950d20651b3, "generatedAt": RemoteSchemas.schema_3d06117798bf5171, "lifetimeTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "models": RemoteSchemas.schema_195974ed118a4217, "peakDay": RemoteSchemas.schema_bf0b727f7b1c6d07, "peakDayTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "providers": RemoteSchemas.schema_d0fa817300598095, "scope": RemoteSchemas.schema_b99ee3af304513c2, "timezoneOffsetMinutes": RemoteSchemas.schema_3d06117798bf5171, "tokenHeatmap": RemoteSchemas.schema_c1094a243b47f83c, "unavailableProviders": RemoteSchemas.schema_0f732b9fceb2c6ac, "windowDays": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_898097c5b37c9168 = RemoteSchema(type: "object", required: Set(["nextCursor", "runtimeSummariesByThread", "threads"]), properties: ["gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "inventoryFrontier": RemoteSchemas.schema_36fea325bf1aca70, "nextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "threads": RemoteSchemas.schema_8e7b49eef8ed965c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89a32138dca165c4 = RemoteSchema(type: "object", required: Set(["authorizationUrl", "flowId", "status"]), properties: ["authorizationUrl": RemoteSchemas.schema_36fea325bf1aca70, "flowId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_bd96f28e94e5dff9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89bc4017c2e23cd6 = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_034741cb26a53fe4, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89c223893a706cf8 = RemoteSchema(type: "string", minLength: 1, maxLength: 1000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_8a0ca790b0047a5e = RemoteSchema(type: "object", required: Set(["definition"]), properties: ["definition": RemoteSchemas.schema_02179e6a4b6545d5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8a62b43ffe3b4668 = RemoteSchema(type: "object", required: Set(["skills"]), properties: ["skills": RemoteSchemas.schema_3cc2bb39a7445b48], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ab3ef50febb54d1 = RemoteSchema(type: "object", required: Set(["id", "name", "type"]), properties: ["args": RemoteSchemas.schema_0f732b9fceb2c6ac, "description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "env": RemoteSchemas.schema_e51d77fd6734b53a, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c4197e46f3baa871], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ace86d01d0cc126 = RemoteSchema(type: "object", required: Set(["environment", "error", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "error": RemoteSchemas.schema_f145218b6dee66b6, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_e527c3ee29cd639b, "toolCount": RemoteSchemas.schema_499c88c1c549e934], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b1889f3513fe2b3 = RemoteSchema(type: "object", required: Set(["command"]), properties: ["argumentSubcommands": RemoteSchemas.schema_515482d2104d1efa, "command": RemoteSchemas.schema_36fea325bf1aca70, "controlArguments": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b52512d7a324001 = RemoteSchema(type: "object", required: Set(["projectId", "worktreePaths"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b72b09d5cbe1e7f = RemoteSchema(type: "object", required: Set(["distro", "kind", "linuxPath", "uncPath"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2d8274eae552cc51, "linuxPath": RemoteSchemas.schema_bd85a52dd25effae, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "uncPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8be22931a515cd6d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_7ac92dcb7485437b, RemoteSchemas.schema_455b16a806252fd5, RemoteSchemas.schema_e7cab2d2c052144f, RemoteSchemas.schema_09f700fdeb3e5213], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8be56eea0793828f = RemoteSchema(type: "array", items: RemoteSchemas.schema_7efa4de89a4475c8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c0ef7d6db14930e = RemoteSchema(type: "object", required: Set(["projects", "projectsNextCursor", "reads"]), properties: ["inventoryFrontier": RemoteSchemas.schema_36fea325bf1aca70, "projects": RemoteSchemas.schema_45dc1a0b166d686a, "projectsNextCursor": RemoteSchemas.schema_df704162f3d15808, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c20a3e2d150dfcf = RemoteSchema(type: "object", required: Set(["tabId"]), properties: ["tabId": RemoteSchemas.schema_56aa0e45cbdce0d0, "title": RemoteSchemas.schema_f7ecfe1017b42566, "url": RemoteSchemas.schema_a5af9fa380f11a11], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c61ed237d0ab3d0 = RemoteSchema(type: "string", literals: [.string("inactive"), .string("launching"), .string("working"), .string("idle"), .string("finished"), .string("needs_approval"), .string("needs_reply"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c71be0e7fdf9e1a = RemoteSchema(type: "array", items: RemoteSchemas.schema_9137d8707520f367, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ca5860ab0ec6478 = RemoteSchema(type: "object", required: Set(["cacheRead", "cacheWrite", "cacheWrite1h", "effectiveFrom", "id", "input", "model", "output", "reviewedAt", "source"]), properties: ["cacheRead": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite1h": RemoteSchemas.schema_f696f11685898ba7, "effectiveFrom": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "input": RemoteSchemas.schema_f696f11685898ba7, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "output": RemoteSchemas.schema_f696f11685898ba7, "reviewedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "source": RemoteSchemas.schema_6bb6e13415c8cbba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8cdebfa85eb53602 = RemoteSchema(type: "object", required: Set(["filter"]), properties: ["cursor": RemoteSchemas.schema_5e8c2bfac4c6fcc6, "filter": RemoteSchemas.schema_479fd2dce7e64e29, "limit": RemoteSchemas.schema_f9e7f90793023053, "search": RemoteSchemas.schema_e5bbd3e940039349], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d017de5d26dce37 = RemoteSchema(type: "array", items: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d15f7f900e19f14 = RemoteSchema(type: "object", required: Set(["anchor"]), properties: ["anchor": RemoteSchemas.schema_98ef330d70f2e681], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d3732b59a0dd026 = RemoteSchema(type: "string", literals: [.string("file"), .string("directory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d7cbafc0ecc27cb = RemoteSchema(type: "number", literals: [.int(14)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8df7f0ad187ea598 = RemoteSchema(type: "object", required: Set(["completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"]), properties: ["backgroundTasks": RemoteSchemas.schema_00675d64d428c3d1, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "historyProjection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeItems": RemoteSchemas.schema_5d3ac76d9a521e1d, "runtimeNextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "runtimeResumeCursor": RemoteSchemas.schema_36fea325bf1aca70, "runtimeStateCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalScrollback": RemoteSchemas.schema_bf0b727f7b1c6d07, "terminalSize": RemoteSchemas.schema_55ee222c096690dc, "thread": RemoteSchemas.schema_c84f860f0ebf373b, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8dfc34ff217d09b7 = RemoteSchema(type: "object", required: Set(["filesPhase", "numTurns", "outcome", "providerPhase", "removedCompletedTurnAnchors", "replayed", "truncatePhase"]), properties: ["filesPhase": RemoteSchemas.schema_efc124973b411d28, "numTurns": RemoteSchemas.schema_3d06117798bf5171, "outcome": RemoteSchemas.schema_08ce03e6077b28a9, "providerPhase": RemoteSchemas.schema_11ada4e73a793b0d, "removedCompletedTurnAnchors": RemoteSchemas.schema_0f732b9fceb2c6ac, "replayed": RemoteSchemas.schema_feeb8bb50144d96d, "truncatePhase": RemoteSchemas.schema_35962a43ae5cecce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e43cad70cd70de7 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e7b49eef8ed965c = RemoteSchema(type: "array", items: RemoteSchemas.schema_c84f860f0ebf373b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e7b4d097aa71417 = RemoteSchema(type: "string", literals: [.string("reorder-flat")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f483f0889171da1 = RemoteSchema(type: "string", literals: [.string("session:read"), .string("session:operate"), .string("terminal:read"), .string("terminal:operate"), .string("requests:resolve"), .string("projects:manage"), .string("ports:forward")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f58c1d1acd8bc3c = RemoteSchema(type: "object", required: Set(["data", "metadata", "tabId", "type"]), properties: ["data": RemoteSchemas.schema_36fea325bf1aca70, "metadata": RemoteSchemas.schema_7d9e4e8a681070bb, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c2894654f12fb350], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f739487924008df = RemoteSchema(type: "string", literals: [.string("cli_hook"), .string("terminal_parse"), .string("server")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f8e73cb353005a1 = RemoteSchema(type: "string", maxLength: 64, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f934fd77b3e45dd = RemoteSchema(type: "object", required: Set(["deviceId"]), properties: ["deviceId": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8fa99a81fa4d20fb = RemoteSchema(type: "object", required: Set(["id", "state", "streams", "type"]), properties: ["detailsDeferred": RemoteSchemas.schema_d2dd3595e1b5e5dc, "id": RemoteSchemas.schema_36fea325bf1aca70, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "state": RemoteSchemas.schema_2472eab79ad4b307, "streams": RemoteSchemas.schema_e51d77fd6734b53a, "type": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_902ee7904a410968 = RemoteSchema(type: "string", literals: [.string("page"), .string("inventory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9063020a6c5ad8b3 = RemoteSchema(type: "string", literals: [.string("navigate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_913674349845fda9 = RemoteSchema(type: "string", literals: [.string("thread-transcript"), .string("context-file")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9137d8707520f367 = RemoteSchema(type: "object", required: Set(["displayName", "kind", "name", "runCount"]), properties: ["displayName": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_b096158c792e0431, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "runCount": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91766049dfdea029 = RemoteSchema(type: "string", literals: [.string("managed"), .string("external"), .string("built-in"), .string("plugin")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9189c3f251645aa9 = RemoteSchema(type: "string", literals: [.string("item.updated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9199b6e9ea61b83e = RemoteSchema(type: "object", required: Set(["comments", "id", "isOutdated", "isResolved"]), properties: ["comments": RemoteSchemas.schema_971eac5c1ec68beb, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isOutdated": RemoteSchemas.schema_feeb8bb50144d96d, "isResolved": RemoteSchemas.schema_feeb8bb50144d96d, "line": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91a5d2d349991a6a = RemoteSchema(type: "string", literals: [.string("cumulative"), .string("per-call")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91b38b813d4e4091 = RemoteSchema(type: "string", literals: [.string("unsupported")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91dcfb42aac98166 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_0174a8d738e73980, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_920e2e5db293bc41 = RemoteSchema(type: "object", required: Set(["fastForward", "merged"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "conflicting": RemoteSchemas.schema_feeb8bb50144d96d, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastForward": RemoteSchemas.schema_feeb8bb50144d96d, "merged": RemoteSchemas.schema_feeb8bb50144d96d, "needsStash": RemoteSchemas.schema_feeb8bb50144d96d, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashCommit": RemoteSchemas.schema_bf0b727f7b1c6d07, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_922ae6d8b34c9e29 = RemoteSchema(type: "object", required: Set(["activeWorktreePaths", "projectLocation"]), properties: ["activeWorktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_92ee84dadabef210 = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_55bad6da24b769c6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9358a37bbc89d2ef = RemoteSchema(type: "string", literals: [.string("github"), .string("gitlab"), .string("bitbucket"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9368b22ce42bb60e = RemoteSchema(type: "string", literals: [.string("preferred"), .string("powershell")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_938414fbfa27a773 = RemoteSchema(type: "object", required: Set(["capturedAt", "checkpointItemId", "commit", "ref", "threadId"]), properties: ["capturedAt": RemoteSchemas.schema_36fea325bf1aca70, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "commit": RemoteSchemas.schema_36fea325bf1aca70, "ref": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_939b432562853e88 = RemoteSchema(type: "object", required: Set(["expectedRevision"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_93bef3a552bf787e = RemoteSchema(type: "object", required: Set(["threadIds", "type"]), properties: ["threadIds": RemoteSchemas.schema_39d8d7cbf4384109, "type": RemoteSchemas.schema_25e47114d380c1fb], additionalAllowed: true, unknownPolicy: .strip)
}
