// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_452e07a326fbbba7 = RemoteSchema(type: "string", literals: [.string("family-member")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4535713ebdcc5c37 = RemoteSchema(type: "integer", minimum: 60.0, maximum: 86400.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4545388132b77b29 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_c028422c57a7c557], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_455b16a806252fd5 = RemoteSchema(type: "object", required: Set(["id", "kind", "task"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_cbc64d14585e9a92, "task": RemoteSchemas.schema_7ab420c1b78efb1d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4563be6a1eff8ba8 = RemoteSchema(type: "object", required: Set(["description", "title"]), properties: ["description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "title": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45cf23babef96be9 = RemoteSchema(type: "string", literals: [.string("blocked")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45d8e163d2ea2910 = RemoteSchema(type: "object", required: Set(["fingerprint", "keyType"]), properties: ["fingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "keyType": RemoteSchemas.schema_7d62681c6488867d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45e52f032f196485 = RemoteSchema(type: "array", items: RemoteSchemas.schema_60708133c8c8f499, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45f37b4e852ad753 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_045e333a691dd990, RemoteSchemas.schema_aafcd63530265fa8, RemoteSchemas.schema_c133c6f7b7129d49], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_464dbc5abe96a4c9 = RemoteSchema(type: "object", required: Set(["account", "forge", "host", "repository", "version"]), properties: ["account": RemoteSchemas.schema_c2bb40b82b330cd4, "forge": RemoteSchemas.schema_eaed3cfbf46d5d81, "host": RemoteSchemas.schema_2365fa95161a3294, "repository": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject, semanticIds: ["forge.watch.scope-identity"])
}

public extension RemoteSchemas {
  static let schema_4655073d71f8e50b = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_c533fb875972ec60, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_07971608588bb2db], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4659e6d395f41e16 = RemoteSchema(type: "string", literals: [.string("bounded-v1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4666c29660989480 = RemoteSchema(type: "array", items: RemoteSchemas.schema_56aa0e45cbdce0d0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46790b95411c12d0 = RemoteSchema(type: "object", required: Set(["anchor", "threadId"]), properties: ["anchor": RemoteSchemas.schema_98ef330d70f2e681, "config": RemoteSchemas.schema_281d24bbbaa46745, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_468209f9bb01c8a9 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_4cb4c9750289b975, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46a8742e5750f74f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1e3c3dda8e348c4b, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46a9830765f014a1 = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_7bf37fd7696952c8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46c9cbbd3df64c2a = RemoteSchema(type: "string", literals: [.string("conversation"), .string("inline")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46f2b301a55ee807 = RemoteSchema(type: "object", required: Set(["action", "id"]), properties: ["action": RemoteSchemas.schema_4d5989d27d26b612, "id": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_4721d11b498e9a74 = RemoteSchema(type: "string", literals: [.string("npm-global"), .string("pnpm-global"), .string("bun-global")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4734a988c0fc7988 = RemoteSchema(type: "object", required: Set(["kind", "transferId"]), properties: ["kind": RemoteSchemas.schema_9083db8e32ed061a, "transferId": RemoteSchemas.schema_7f836db787c9df87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_473e9b7f4728cf72 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_feeb8bb50144d96d, "terminal": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_475f45061f4eecab = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_813e06bfce03eec3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_475f91db7d51b153 = RemoteSchema(type: "string", literals: [.string("weekly")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_479fd2dce7e64e29 = RemoteSchema(type: "string", literals: [.string("unread"), .string("all"), .string("archived")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47c3f1ae81cfac00 = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["nextParentPath": RemoteSchemas.schema_38d1a07d3b9b1c82, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47c50d7349a5a322 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 23.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47e02a8368712956 = RemoteSchema(type: "string", literals: [.string("browser-state")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47eb55b96bbf5d77 = RemoteSchema(type: "object", properties: ["contextSize": RemoteSchemas.schema_0f732b9fceb2c6ac, "effort": RemoteSchemas.schema_0f732b9fceb2c6ac, "fast": RemoteSchemas.schema_3c40bff8b05543d7, "thinking": RemoteSchemas.schema_3c40bff8b05543d7], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_47fd370c6dedf4fa = RemoteSchema(type: "object", required: Set(["status"]), properties: ["status": RemoteSchemas.schema_32773ce5899289ad], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_482895ec9172a79a = RemoteSchema(type: "object", required: Set(["name", "parentLocation", "source"]), properties: ["name": RemoteSchemas.schema_36fea325bf1aca70, "parentLocation": RemoteSchemas.schema_080f9cc154af9e27, "source": RemoteSchemas.schema_76b2c94b29aad9b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_482c9282715722ac = RemoteSchema(type: "string", literals: [.string("cancel")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_483d5aa44fc0eaba = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_c39ba2db208f4f7c, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_485fa06696a88681 = RemoteSchema(type: "string", maxLength: 40, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4864c5f65afc8a79 = RemoteSchema(type: "object", required: Set(["commitsAhead", "sourceAhead", "sourceBranch"]), properties: ["commitsAhead": RemoteSchemas.schema_3d06117798bf5171, "sourceAhead": RemoteSchemas.schema_3d06117798bf5171, "sourceBranch": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_486e485d6ecc8507 = RemoteSchema(type: "array", maxItems: 2, items: RemoteSchemas.schema_73994aff28325b85, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4878a3657a97dce6 = RemoteSchema(type: "object", required: Set(["role"]), properties: ["role": RemoteSchemas.schema_7e386bfca48a8819, "text": RemoteSchemas.schema_bf0b727f7b1c6d07, "timestamp": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4886facc92937666 = RemoteSchema(type: "string", literals: [.string("notice")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48916cddaaeb3b09 = RemoteSchema(type: "object", required: Set(["type", "vision", "watchId"]), properties: ["type": RemoteSchemas.schema_83c210ec93e40e2c, "vision": RemoteSchemas.schema_af80d040598805ef, "watchId": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48946bc0ed691a38 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["content": RemoteSchemas.schema_5d217030abf89f29, "structuredContent": RemoteSchemas.schema_e6958017dac6cd3b, "type": RemoteSchemas.schema_7611350a61fc2c31], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48c9126ae761103f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7e83671a2aefecff, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48de96c42130e156 = RemoteSchema(type: "array", items: RemoteSchemas.schema_82e8027595898a28, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49162371ff415b49 = RemoteSchema(type: "string", literals: [.string("steer"), .string("queue")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_495564cff4cc6688 = RemoteSchema(type: "array", items: RemoteSchemas.schema_76767b687c50a873, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49834fb5a406b494 = RemoteSchema(type: "string", literals: [.string("remove_engine")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_499c88c1c549e934 = RemoteSchema(type: "number", literals: [.int(0)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49f72e8cc565067e = RemoteSchema(type: "string", literals: [.string("set-worktree")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49ffdcc76ea977dd = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1a747af71da81871, RemoteSchemas.schema_a04ed367065645a0, RemoteSchemas.schema_d129d1b0ee9ecb9f, RemoteSchemas.schema_fc3e1f61a45e621e, RemoteSchemas.schema_812ec408f30828f2], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a10e57442c165ec = RemoteSchema(type: "object", required: Set(["path"]), properties: ["changesTransferred": RemoteSchemas.schema_feeb8bb50144d96d, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a22ffc9b41926c0 = RemoteSchema(type: "object", required: Set(["nextName", "path", "projectLocation"]), properties: ["nextName": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a5ba059d38b8eac = RemoteSchema(type: "array", items: RemoteSchemas.schema_94a8055a7bc1b620, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a927b60e49ddae0 = RemoteSchema(type: "object", required: Set(["pairing"]), properties: ["pairing": RemoteSchemas.schema_3f3680e5774b47dd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4b47ae3fc75a3ec0 = RemoteSchema(type: "object", properties: ["innerWindowId": RemoteSchemas.schema_36fea325bf1aca70, "outerWindowId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4b51a86edb3e38b1 = RemoteSchema(type: "object", required: Set(["labels", "source"]), properties: ["labels": RemoteSchemas.schema_202f40856ac8b683, "source": RemoteSchemas.schema_0f2003aeafbcbd0b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ba08f85926d047f = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_bb3cd72cf9e1b0cc, RemoteSchemas.schema_560a7abcaf51999f, RemoteSchemas.schema_2798cb9d2dca7539, RemoteSchemas.schema_f2e3da83f3088e10, RemoteSchemas.schema_540340cca9e4216e, RemoteSchemas.schema_3ac3526f6a2607f3], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c1171296b6868a1 = RemoteSchema(type: "object", required: Set(["id", "state", "streams", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "state": RemoteSchemas.schema_2472eab79ad4b307, "streams": RemoteSchemas.schema_e51d77fd6734b53a, "type": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c20b501501c0ba4 = RemoteSchema(type: "array", items: RemoteSchemas.schema_df96bd315b4c0dae, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c22b67e111cba1f = RemoteSchema(type: "object", required: Set(["fromCache", "snapshots"]), properties: ["fromCache": RemoteSchemas.schema_feeb8bb50144d96d, "ringLayouts": RemoteSchemas.schema_80c5703401a577fc, "snapshots": RemoteSchemas.schema_c5a10234205e6cd2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c967d4ed16edbc1 = RemoteSchema(type: "object", required: Set(["args", "command", "env", "type"]), properties: ["args": RemoteSchemas.schema_aac2a4e83d2823be, "command": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_36fea325bf1aca70, "env": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_01f71c4e26e7ecde], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4caa9ebeea5fe346 = RemoteSchema(type: "object", required: Set(["message"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4cb4c9750289b975 = RemoteSchema(type: "string", literals: [.string("add-existing")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4cba70490147a86e = RemoteSchema(type: "object", required: Set(["alwaysEnabled", "builtInMcpServerIds", "category", "communityMaintained", "defaultEnabled", "featured", "nativePluginNames", "skills"]), properties: ["alwaysEnabled": RemoteSchemas.schema_f8b6dd8128e8bfe0, "builtInMcpServerIds": RemoteSchemas.schema_6290c0f9d5a1b8b5, "category": RemoteSchemas.schema_7b4d49cacb8e1430, "communityMaintained": RemoteSchemas.schema_f8b6dd8128e8bfe0, "coreSkill": RemoteSchemas.schema_36fea325bf1aca70, "defaultEnabled": RemoteSchemas.schema_a6ba34cd39bf30c5, "examplePrompt": RemoteSchemas.schema_36fea325bf1aca70, "featured": RemoteSchemas.schema_f8b6dd8128e8bfe0, "nativeCoreSkill": RemoteSchemas.schema_36fea325bf1aca70, "nativePluginNames": RemoteSchemas.schema_242a5ef77d1f8924, "platforms": RemoteSchemas.schema_62925923e85a96d9, "projectKinds": RemoteSchemas.schema_443cfbe0562322a3, "skills": RemoteSchemas.schema_b199f691eb557bbf, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_4cd2587996458d8d = RemoteSchema(type: "object", required: Set(["distro", "kind"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2d8274eae552cc51], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ce9d2f234c3a468 = RemoteSchema(type: "string", minLength: 1, maxLength: 1000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d34acc64dd77a5d = RemoteSchema(type: "string", literals: [.string("probe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d5808c99a89352a = RemoteSchema(type: "object", required: Set(["angle", "type"]), properties: ["angle": RemoteSchemas.schema_a1221059eae7f5c4, "type": RemoteSchemas.schema_6c7cb6fb412178b1], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_4d5989d27d26b612 = RemoteSchema(type: "string", literals: [.string("delete")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d59c815dfec80c4 = RemoteSchema(type: "object", required: Set(["questions"]), properties: ["questions": RemoteSchemas.schema_6ccb3f9f839a5656, "sourceItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4db742376cbe66fa = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4dced7b84600297c = RemoteSchema(type: "object", required: Set(["agentKind", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "instructions": RemoteSchemas.schema_e8ae3938f73bbe3d, "language": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4dea101cb65656f3 = RemoteSchema(type: "object", required: Set(["id", "marketplace", "name", "official", "rank", "skillId", "source"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "installs": RemoteSchemas.schema_56aa0e45cbdce0d0, "marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "name": RemoteSchemas.schema_36fea325bf1aca70, "official": RemoteSchemas.schema_feeb8bb50144d96d, "rank": RemoteSchemas.schema_23e05d248383ea40, "securityGrade": RemoteSchemas.schema_e987f23b082616d2, "securityScore": RemoteSchemas.schema_a581e67cd137ad59, "skillId": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_36fea325bf1aca70, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "sourceRef": RemoteSchemas.schema_36fea325bf1aca70, "sourceUrl": RemoteSchemas.schema_6bb6e13415c8cbba, "stars": RemoteSchemas.schema_56aa0e45cbdce0d0, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "votes": RemoteSchemas.schema_56aa0e45cbdce0d0, "weeklyInstalls": RemoteSchemas.schema_4666c29660989480], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4df989d5459165c8 = RemoteSchema(type: "array", items: RemoteSchemas.schema_56a9bf5bf312d537, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e014bc9e6085564 = RemoteSchema(type: "array", maxItems: 5, items: RemoteSchemas.schema_4ce9d2f234c3a468, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e1c353012bcb7ec = RemoteSchema(type: "object", required: Set(["conclusion", "name", "number", "status"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "number": RemoteSchemas.schema_3d06117798bf5171, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e3a1013cf1d3a58 = RemoteSchema(type: "string", pattern: "^[0-9a-f]{40}(?:[0-9a-f]{24})?$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e4370de4368f09a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_a627cf0d1237385c, RemoteSchemas.schema_543fbae99d61b8d1], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e9b40f6024250fb = RemoteSchema(type: "object", required: Set(["installed"]), properties: ["installed": RemoteSchemas.schema_495564cff4cc6688], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4eb37bd43cbe100e = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "created", "tracking"]), properties: ["ahead": RemoteSchemas.schema_3d06117798bf5171, "behind": RemoteSchemas.schema_3d06117798bf5171, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "created": RemoteSchemas.schema_feeb8bb50144d96d, "tracking": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}
