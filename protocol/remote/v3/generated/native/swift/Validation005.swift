// GENERATED FILE. Do not edit by hand.
import Foundation
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
  static let schema_4878a3657a97dce6 = RemoteSchema(type: "object", required: Set(["role"]), properties: ["role": RemoteSchemas.schema_7e386bfca48a8819, "text": RemoteSchemas.schema_bf0b727f7b1c6d07, "timestamp": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4886facc92937666 = RemoteSchema(type: "string", literals: [.string("notice")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48916cddaaeb3b09 = RemoteSchema(type: "object", required: Set(["type", "vision", "watchId"]), properties: ["type": RemoteSchemas.schema_83c210ec93e40e2c, "vision": RemoteSchemas.schema_af80d040598805ef, "watchId": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48ca3a84cd4a6f59 = RemoteSchema(type: "object", properties: ["boundedCatalogChanges": RemoteSchemas.schema_a9266ff57466f267, "browserForward": RemoteSchemas.schema_a9266ff57466f267, "catalogMutations": RemoteSchemas.schema_a9266ff57466f267, "conversationSearch": RemoteSchemas.schema_a9266ff57466f267, "conversationSnapshots": RemoteSchemas.schema_a9266ff57466f267, "deviceWorkspace": RemoteSchemas.schema_c288e6607451a3b8, "experiments": RemoteSchemas.schema_a9266ff57466f267, "flatThreadReorder": RemoteSchemas.schema_a9266ff57466f267, "historyDetails": RemoteSchemas.schema_a9266ff57466f267, "projectCommandResults": RemoteSchemas.schema_a9266ff57466f267, "pushRouting": RemoteSchemas.schema_a9266ff57466f267, "runtimeHistoryNotices": RemoteSchemas.schema_a9266ff57466f267, "sshEnvironments": RemoteSchemas.schema_a9266ff57466f267, "terminalCursorSync": RemoteSchemas.schema_a9266ff57466f267, "threadForks": RemoteSchemas.schema_a9266ff57466f267, "threadHistoryResume": RemoteSchemas.schema_a9266ff57466f267, "threadLaunchMetadata": RemoteSchemas.schema_a9266ff57466f267], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48de96c42130e156 = RemoteSchema(type: "array", items: RemoteSchemas.schema_82e8027595898a28, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49162371ff415b49 = RemoteSchema(type: "string", literals: [.string("steer"), .string("queue")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_499c88c1c549e934 = RemoteSchema(type: "number", literals: [.int(0)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49f72e8cc565067e = RemoteSchema(type: "string", literals: [.string("set-worktree")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a10e57442c165ec = RemoteSchema(type: "object", required: Set(["path"]), properties: ["changesTransferred": RemoteSchemas.schema_feeb8bb50144d96d, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a22ffc9b41926c0 = RemoteSchema(type: "object", required: Set(["nextName", "path", "projectLocation"]), properties: ["nextName": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a927b60e49ddae0 = RemoteSchema(type: "object", required: Set(["pairing"]), properties: ["pairing": RemoteSchemas.schema_3f3680e5774b47dd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4b43828b172de36c = RemoteSchema(type: "object", required: Set(["accessibility", "id", "input", "name", "platform", "state"]), properties: ["accessibility": RemoteSchemas.schema_feeb8bb50144d96d, "controls": RemoteSchemas.schema_edaad5a427ee5ae6, "id": RemoteSchemas.schema_97d85a5eaee82b97, "input": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_f1deff8504bbc0a3, "platform": RemoteSchemas.schema_61e54b5f6751c7a6, "state": RemoteSchemas.schema_51b8dd645024c82d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4bc21f7698ec2e7b = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "project": RemoteSchemas.schema_cac3b973979876dd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c1171296b6868a1 = RemoteSchema(type: "object", required: Set(["id", "state", "streams", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "state": RemoteSchemas.schema_2472eab79ad4b307, "streams": RemoteSchemas.schema_e51d77fd6734b53a, "type": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c20b501501c0ba4 = RemoteSchema(type: "array", items: RemoteSchemas.schema_df96bd315b4c0dae, unknownPolicy: .strip)
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
  static let schema_4cd2587996458d8d = RemoteSchema(type: "object", required: Set(["distro", "kind"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2d8274eae552cc51], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ce9d2f234c3a468 = RemoteSchema(type: "string", minLength: 1, maxLength: 1000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d34acc64dd77a5d = RemoteSchema(type: "string", literals: [.string("probe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d5989d27d26b612 = RemoteSchema(type: "string", literals: [.string("delete")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d59c815dfec80c4 = RemoteSchema(type: "object", required: Set(["questions"]), properties: ["questions": RemoteSchemas.schema_6ccb3f9f839a5656, "sourceItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4dced7b84600297c = RemoteSchema(type: "object", required: Set(["agentKind", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "instructions": RemoteSchemas.schema_e8ae3938f73bbe3d, "language": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4de8e3eae98ee9e2 = RemoteSchema(type: "object", required: Set(["batches", "completedTurns", "contextUsage", "kind", "runtimeResumeCursor", "snapshotSeq", "thread"]), properties: ["backgroundTasks": RemoteSchemas.schema_00675d64d428c3d1, "batches": RemoteSchemas.schema_e0fc3c3d350deb38, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "kind": RemoteSchemas.schema_e1a91348d83820fb, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "runtimeResumeCursor": RemoteSchemas.schema_36fea325bf1aca70, "runtimeStateCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "thread": RemoteSchemas.schema_131fd1869b52ef74], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_4eb37bd43cbe100e = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "created", "tracking"]), properties: ["ahead": RemoteSchemas.schema_3d06117798bf5171, "behind": RemoteSchemas.schema_3d06117798bf5171, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "created": RemoteSchemas.schema_feeb8bb50144d96d, "tracking": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ec1299a984102e2 = RemoteSchema(type: "string", literals: [.string("acknowledge")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ec1d31e87eeb7a4 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_046f6b1ae10fa4ef], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f399075769723a3 = RemoteSchema(type: "object", required: Set(["id", "payload"]), properties: ["id": RemoteSchemas.schema_f355c9e66a3091a2, "payload": RemoteSchemas.schema_5cb1759d88da4b15], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f84b56b06f60ea1 = RemoteSchema(type: "string", literals: [.string("http")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_500ee3799383d21f = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_3e68ba0d03654c68, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_501221cdcb9cd48b = RemoteSchema(type: "object", required: Set(["id", "kind", "name"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_c669b4e26b2b7569, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5027b509e87ee5fb = RemoteSchema(type: "object", required: Set(["path", "projectLocation", "type"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_505ae61467accdeb = RemoteSchema(type: "object", required: Set(["checkpoint"]), properties: ["checkpoint": RemoteSchemas.schema_09b66dd237e8c823], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_506f036707472345 = RemoteSchema(type: "string", literals: [.string("accepted"), .string("declined"), .string("answered"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5093c62d05bf0072 = RemoteSchema(type: "object", required: Set(["activeThreadId", "autoMerge", "blockedReason", "headBranch", "lastCheckKey", "lastCommentCursor", "lastError", "lastReviewCommentCursor", "lastReviewCursor", "prNumber", "projectId", "watchEnabled"]), properties: ["activeThreadId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "blockedReason": RemoteSchemas.schema_7dccd2754fedc801, "config": RemoteSchemas.schema_f69100925fc0e774, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "lastCheckKey": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastError": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "reviewScope": RemoteSchemas.schema_464dbc5abe96a4c9, "reviewScopeUnsupported": RemoteSchemas.schema_d2dd3595e1b5e5dc, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_50d5adf9e97ef8bd = RemoteSchema(type: "object", required: Set(["id", "prompt", "threadId"]), properties: ["expectedStagedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "id": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_50e8e4265cb34b55 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_513dd8593f33208a = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_515482d2104d1efa = RemoteSchema(type: "array", items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51733da614782090 = RemoteSchema(type: "object", required: Set(["authenticatedUrls"]), properties: ["authenticatedUrls": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_518b8374aca2de65 = RemoteSchema(type: "string", literals: [.string("update-available")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51b8dd645024c82d = RemoteSchema(type: "string", literals: [.string("running"), .string("stopped"), .string("starting")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51cc694dc5da9f2a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_47fd370c6dedf4fa, RemoteSchemas.schema_43639d56ca3f1150], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51d89a5cbbb635e7 = RemoteSchema(type: "object", required: Set(["actions"]), properties: ["actions": RemoteSchemas.schema_9f0df99b7a4b0249, "cleanupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeCopyPatterns": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51e99f5d3372fb77 = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip, semanticIds: ["push.web.endpoint-https"])
}

public extension RemoteSchemas {
  static let schema_51f2acb99ea96b5b = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_3df0ab0b4ea7223c, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51fc061b3ecc735c = RemoteSchema(type: "object", required: Set(["newLocation", "projectId"]), properties: ["newLocation": RemoteSchemas.schema_080f9cc154af9e27, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_522b0d7f41276332 = RemoteSchema(type: "object", required: Set(["hash", "message"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "hash": RemoteSchemas.schema_bf0b727f7b1c6d07, "message": RemoteSchemas.schema_bf0b727f7b1c6d07, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_528726e6ad6aefbd = RemoteSchema(type: "object", required: Set(["counter", "counterKind", "epoch", "sampleId", "scopeId"]), properties: ["cost": RemoteSchemas.schema_ad6bb2de51c0e05f, "counter": RemoteSchemas.schema_56aa0e45cbdce0d0, "counterKind": RemoteSchemas.schema_91a5d2d349991a6a, "epoch": RemoteSchemas.schema_56aa0e45cbdce0d0, "fresh": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "occurredAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "sampleId": RemoteSchemas.schema_36fea325bf1aca70, "scopeId": RemoteSchemas.schema_36fea325bf1aca70, "tokens": RemoteSchemas.schema_e70be7a06d8baea6, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5296d6b04d46b630 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4c967d4ed16edbc1, RemoteSchemas.schema_e0da1e0a5e3cd077, RemoteSchemas.schema_a66324f9a46c480b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_53996e5a27a5b0c4 = RemoteSchema(type: "string", pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", unknownPolicy: .strip, transformIds: ["push.routing.client-connection-id.lowercase"])
}

public extension RemoteSchemas {
  static let schema_53ceafeed27db1df = RemoteSchema(type: "string", literals: [.string("archive")], unknownPolicy: .strip)
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
  static let schema_5455d140717a50b3 = RemoteSchema(type: "string", literals: [.string("user_message"), .string("assistant_message"), .string("reasoning"), .string("plan"), .string("goal"), .string("command_execution"), .string("file_change"), .string("tool_call"), .string("mcp_tool_call"), .string("image_view"), .string("dynamic_tool_call"), .string("web_search"), .string("question_answer"), .string("provider_handoff"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5465dd986b32b774 = RemoteSchema(type: "string", literals: [.string("windows")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_54c83506378cf7c8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_f3c2d2c49187a75b, RemoteSchemas.schema_43d29f1d5a2e1f23], unknownPolicy: .strip, semanticIds: ["thread.goal.objective.trim"])
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
  static let schema_55bad6da24b769c6 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_5093c62d05bf0072, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_55c4cb32b40db3a8 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "expectedOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "force": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["git.delete-branch.remote-cannot-have-owner"])
}

public extension RemoteSchemas {
  static let schema_55ee222c096690dc = RemoteSchema(type: "object", required: Set(["cols", "rows"]), properties: ["cols": RemoteSchemas.schema_9980c767412d708b, "rows": RemoteSchemas.schema_1fa1b7f79d80e44d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5604f00f2a788035 = RemoteSchema(type: "array", items: RemoteSchemas.schema_bc731d8f39fdb4bc, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_560a7abcaf51999f = RemoteSchema(type: "object", required: Set(["authenticatedServerIds", "kind"]), properties: ["authenticatedServerIds": RemoteSchemas.schema_515482d2104d1efa, "kind": RemoteSchemas.schema_274e069cdc933ee1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56296b74a9501a6f = RemoteSchema(type: "string", literals: [.string("manual"), .string("scheduled"), .string("retry")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5646cf57ff3aebe0 = RemoteSchema(type: "object", required: Set(["host", "login"]), properties: ["host": RemoteSchemas.schema_36fea325bf1aca70, "login": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56a9bf5bf312d537 = RemoteSchema(type: "object", required: Set(["absolutePath", "description", "enabled", "folderName", "id", "linked", "mutable", "name", "origin", "providerId", "providerLabel", "rootPath", "scope", "scopeLabel", "skillFilePath", "valid"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "availability": RemoteSchemas.schema_9c8337f42f233534, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "folderName": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "importState": RemoteSchemas.schema_5cfe15b2e7d4fc30, "invalidReason": RemoteSchemas.schema_883b3b8a6153aa17, "invocation": RemoteSchemas.schema_ee6af1c3c62ad32f, "linked": RemoteSchemas.schema_feeb8bb50144d96d, "mutable": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_36fea325bf1aca70, "origin": RemoteSchemas.schema_91766049dfdea029, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "portable": RemoteSchemas.schema_feeb8bb50144d96d, "providerGroupId": RemoteSchemas.schema_36fea325bf1aca70, "providerGroupLabel": RemoteSchemas.schema_36fea325bf1aca70, "providerGroupOrder": RemoteSchemas.schema_3d06117798bf5171, "providerId": RemoteSchemas.schema_36fea325bf1aca70, "providerLabel": RemoteSchemas.schema_36fea325bf1aca70, "rootPath": RemoteSchemas.schema_36fea325bf1aca70, "scope": RemoteSchemas.schema_ac6ea0fc110d7efb, "scopeLabel": RemoteSchemas.schema_36fea325bf1aca70, "skillFilePath": RemoteSchemas.schema_36fea325bf1aca70, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "valid": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56aa0e45cbdce0d0 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56df8e6416f18e3e = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56ee97530dcbb64f = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "language": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5760038b3ac1009b = RemoteSchema(type: "object", required: Set(["expectedRevision", "patch"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037, "patch": RemoteSchemas.schema_2a5c67603fdb726c], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_580efa06e9547a64 = RemoteSchema(type: "object", required: Set(["kind", "placement", "projectId", "targetProjectId"]), properties: ["kind": RemoteSchemas.schema_701d7d6274e152f6, "placement": RemoteSchemas.schema_3512bd687eb85e90, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "targetProjectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_581f3fd03959d5f7 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 50.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58317133a27c74f8 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9c01de6b080eca40, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_587e72c508e2943a = RemoteSchema(type: "string", literals: [.string("fork")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5894304151eb6a79 = RemoteSchema(type: "object", required: Set(["endLine", "path", "side", "startLine", "text"]), properties: ["endLine": RemoteSchemas.schema_23e05d248383ea40, "path": RemoteSchemas.schema_36fea325bf1aca70, "side": RemoteSchemas.schema_598c25a2e687258b, "startLine": RemoteSchemas.schema_23e05d248383ea40, "text": RemoteSchemas.schema_6d40bf61903aed2d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58a226c992f64fc4 = RemoteSchema(type: "object", required: Set(["label"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58c75b9ad5972758 = RemoteSchema(type: "array", items: RemoteSchemas.schema_40aab29508fb3256, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58edfaf9f73b8db4 = RemoteSchema(type: "string", literals: [.string("none"), .string("working"), .string("needs_approval"), .string("needs_reply"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58f9a3fda2694c76 = RemoteSchema(type: "object", required: Set(["count", "hour", "label"]), properties: ["count": RemoteSchemas.schema_56aa0e45cbdce0d0, "hour": RemoteSchemas.schema_47c50d7349a5a322, "label": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59152790354c604a = RemoteSchema(type: "object", required: Set(["guide", "stale", "status"]), properties: ["diffHash": RemoteSchemas.schema_ec221fdc1494d0b1, "guide": RemoteSchemas.schema_c591e31c389e744f, "stale": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_e25509dad8a191fe], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_591e7e71be40d4d4 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_6b98eaede59b512a, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_592634b8956b6cd0 = RemoteSchema(type: "string", literals: [.string("permission")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59599d21a24ed95c = RemoteSchema(type: "object", required: Set(["beforeId", "id", "threadId"]), properties: ["beforeId": RemoteSchemas.schema_df704162f3d15808, "id": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_595da89b21b7ca56 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_38adcf16c79023ce, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_596b826e9125183e = RemoteSchema(type: "object", required: Set(["enabled", "type"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "type": RemoteSchemas.schema_d4757acfcddc86a6], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_598c25a2e687258b = RemoteSchema(type: "string", literals: [.string("LEFT"), .string("RIGHT")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59cd628901920f3f = RemoteSchema(type: "object", required: Set(["agents", "title"]), properties: ["agents": RemoteSchemas.schema_cbad4936b49ad671, "detail": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a17efba356f5500 = RemoteSchema(type: "string", literals: [.string("queued"), .string("running"), .string("done"), .string("failed"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a931a4108dce660 = RemoteSchema(type: "object", required: Set(["appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"]), properties: ["appVersion": RemoteSchemas.schema_36fea325bf1aca70, "auth": RemoteSchemas.schema_2a8bc62fab6ac143, "capabilities": RemoteSchemas.schema_48ca3a84cd4a6f59, "desktopId": RemoteSchemas.schema_36fea325bf1aca70, "endpoints": RemoteSchemas.schema_17c2b8a25332cd3a, "hostMode": RemoteSchemas.schema_d1d1696e7dc33885, "label": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_7583b8d37fafbf18, "protocolVersion": RemoteSchemas.schema_8d7cbafc0ecc27cb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5aa9e435f68d585e = RemoteSchema(type: "string", literals: [.string("summary"), .string("transcript")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5aba12c8b801732a = RemoteSchema(type: "object", required: Set(["body", "comments", "decision", "expectedHeadSha", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_866aaf9918167eb9, "comments": RemoteSchemas.schema_0d1cc1ca31f4769d, "decision": RemoteSchemas.schema_c0551fbf082fff0f, "expectedHeadSha": RemoteSchemas.schema_ef369ae84db5485c, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ae95e3b3c8a9ee1 = RemoteSchema(type: "string", minLength: 1, maxLength: 2000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5af10e67b405a136 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_af6b6f72d4304b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5bb2b4a4a0c3c485 = RemoteSchema(type: "object", properties: ["stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5bbcf9e4750fbaa3 = RemoteSchema(type: "string", literals: [.string("ai-evaluated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5c07f5964567e9f0 = RemoteSchema(type: "string", minLength: 1, maxLength: 16000, unknownPolicy: .strip)
}
