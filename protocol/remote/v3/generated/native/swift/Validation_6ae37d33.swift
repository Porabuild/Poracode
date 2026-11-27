// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_c24d062f64579ed9 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "project": RemoteSchemas.schema_9ee4a9aa10a4d238], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c263982707afed92 = RemoteSchema(type: "string", literals: [.string("percent"), .string("tokens"), .string("requests"), .string("credits"), .string("usd")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c26b952dfa583dcd = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "title"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_281d24bbbaa46745, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_1f4518886240126e, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c286f4704a09cde8 = RemoteSchema(type: "array", maxItems: 100, items: RemoteSchemas.schema_2e59da965e611892, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c288e6607451a3b8 = RemoteSchema(type: "object", required: Set(["versions"]), properties: ["livePreview": RemoteSchemas.schema_8b16df449d9a1954, "versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2894654f12fb350 = RemoteSchema(type: "string", literals: [.string("browser-frame")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2956fa26ec0467c = RemoteSchema(type: "object", required: Set(["content", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "reacted"]), properties: ["content": RemoteSchemas.schema_7d62681c6488867d, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "reacted": RemoteSchemas.schema_feeb8bb50144d96d, "subjectId": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c297cb4b3fffa0b1 = RemoteSchema(type: "string", literals: [.string("job")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2bb40b82b330cd4 = RemoteSchema(type: "object", required: Set(["forge", "host", "login"]), properties: ["forge": RemoteSchemas.schema_eaed3cfbf46d5d81, "host": RemoteSchemas.schema_2365fa95161a3294, "login": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2bfd0a01d71483e = RemoteSchema(type: "object", required: Set(["action", "result"]), properties: ["action": RemoteSchemas.schema_a2bcbae622b18cea, "result": RemoteSchemas.schema_ae014c623e1c5229], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2e8606952666d2c = RemoteSchema(type: "array", items: RemoteSchemas.schema_6bb6e13415c8cbba, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c30da54b853babca = RemoteSchema(type: "object", required: Set(["label", "percent", "provider", "tokens"]), properties: ["estimatedCostUsd": RemoteSchemas.schema_80c415b6e27c6ebd, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "provider": RemoteSchemas.schema_bf0b727f7b1c6d07, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3363423bb669510 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_4ec1299a984102e2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c33cd4031b7f99e0 = RemoteSchema(type: "object", required: Set(["itemTypes", "version"]), properties: ["itemTypes": RemoteSchemas.schema_46a9830765f014a1, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c33d76cdf9c7d5d7 = RemoteSchema(type: "object", required: Set(["agentKind", "model"]), properties: ["agentKind": RemoteSchemas.schema_8e43cad70cd70de7, "contextSize": RemoteSchemas.schema_7d62681c6488867d, "effort": RemoteSchemas.schema_7d62681c6488867d, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c39ba2db208f4f7c = RemoteSchema(type: "string", literals: [.string("activate-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3a191d9ad55837f = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_9d4f8a22a3e1fa05, RemoteSchemas.schema_0b5555e2ca059ee2, RemoteSchemas.schema_72a4809a8d48dab8, RemoteSchemas.schema_feff20c88bde0c4c, RemoteSchemas.schema_ca98effeead73f13, RemoteSchemas.schema_596b826e9125183e, RemoteSchemas.schema_dfbf83bd7409c8d7, RemoteSchemas.schema_861b7e521ad93c4b, RemoteSchemas.schema_3935a65be87f52c2, RemoteSchemas.schema_14f3c332d545bff0, RemoteSchemas.schema_fd4fd2eb416ae002, RemoteSchemas.schema_4d5808c99a89352a], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3a4dfd6503d3858 = RemoteSchema(type: "object", required: Set(["notice", "outcome"]), properties: ["notice": RemoteSchemas.schema_1468dfe9a2db9c9d, "outcome": RemoteSchemas.schema_552de755ef856a71], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3ac2139868061bb = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3be644314ca4fd5 = RemoteSchema(type: "string", literals: [.string("learned"), .string("user"), .string("import"), .string("dream")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c408d3b67402af90 = RemoteSchema(type: "string", literals: [.string("finish")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4197e46f3baa871 = RemoteSchema(type: "string", literals: [.string("terminal")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c44733d5a3f1db00 = RemoteSchema(type: "array", items: RemoteSchemas.schema_efedb06a4d7088a5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4921dbeb36e2b97 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e510e581c4f8b523, RemoteSchemas.schema_77c71c73158736b6], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4ad1400e2e98f57 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["limit": RemoteSchemas.schema_039b848cf1c1ad6c, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "query": RemoteSchemas.schema_38d1a07d3b9b1c82, "searchConfig": RemoteSchemas.schema_cbf78da83a6846d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4d99dd3e3a1ba03 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["detail": RemoteSchemas.schema_15cae388d0cdd5b6, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4f6ed0673387892 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_6cb914aa8661083a, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c51ef8291e597045 = RemoteSchema(type: "object", properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c52c624815ab6ea5 = RemoteSchema(type: "object", required: Set(["archived", "excerpt", "itemId", "projectId", "projectName", "role", "threadId", "title"]), properties: ["archived": RemoteSchemas.schema_feeb8bb50144d96d, "excerpt": RemoteSchemas.schema_ff3b9b0284fcd244, "itemId": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "projectName": RemoteSchemas.schema_e78f40fc5399f7f1, "role": RemoteSchemas.schema_ff05783d57039aa1, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_f7ecfe1017b42566], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c538d0467addc4ec = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_236d6f96ed0a17bc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c55a346c739cb16c = RemoteSchema(type: "object", required: Set(["itemId", "payload", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9189c3f251645aa9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c56ccbd7844cd002 = RemoteSchema(type: "array", items: RemoteSchemas.schema_714864208ed5dad7, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c591e31c389e744f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_160c1ab9b7f11a56, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5a25a432208abbf = RemoteSchema(type: "string", literals: [.string("appearance")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c17f76a21e5ff1 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c2ecebbae5cd01 = RemoteSchema(type: "object", required: Set(["modifiedAtMs"]), properties: ["modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c5a6d768bddd81 = RemoteSchema(type: "integer", minimum: 100.0, maximum: 2000.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5efb303b347362f = RemoteSchema(type: "string", literals: [.string("running"), .string("decided")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c6137caf0119356f = RemoteSchema(type: "object", required: Set(["action", "catalogId", "entryName"]), properties: ["action": RemoteSchemas.schema_bb92475a93f16082, "catalogId": RemoteSchemas.schema_d855999aed5e6438, "entryName": RemoteSchemas.schema_84c77ee2ad6c219b], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c6173f708ba6a476 = RemoteSchema(type: "object", required: Set(["accounts", "available", "device", "generatedAt", "lifetimeTokens", "models", "peakDayTokens", "providers", "scope", "timezoneOffsetMinutes", "tokenHeatmap", "unavailableProviders", "windowDays"]), properties: ["accounts": RemoteSchemas.schema_d0fa817300598095, "available": RemoteSchemas.schema_feeb8bb50144d96d, "costs": RemoteSchemas.schema_9f69a3eb5854c7b1, "device": RemoteSchemas.schema_26f96950d20651b3, "generatedAt": RemoteSchemas.schema_3d06117798bf5171, "lifetimeTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "models": RemoteSchemas.schema_195974ed118a4217, "peakDay": RemoteSchemas.schema_bf0b727f7b1c6d07, "peakDayTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "providers": RemoteSchemas.schema_d0fa817300598095, "recent": RemoteSchemas.schema_2cc17d220c2ecf6d, "scope": RemoteSchemas.schema_b99ee3af304513c2, "timezoneOffsetMinutes": RemoteSchemas.schema_3d06117798bf5171, "tokenHeatmap": RemoteSchemas.schema_c1094a243b47f83c, "unavailableProviders": RemoteSchemas.schema_0f732b9fceb2c6ac, "windowDays": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c61abfd0f3a8ad5d = RemoteSchema(type: "object", required: Set(["action", "agentKind", "env"]), properties: ["action": RemoteSchemas.schema_5deb110d954820af, "agentKind": RemoteSchemas.schema_8e43cad70cd70de7, "env": RemoteSchemas.schema_2583fd799237ae71, "target": RemoteSchemas.schema_172d5c08125b0df4], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["agent-plugins.target-required"])
}
