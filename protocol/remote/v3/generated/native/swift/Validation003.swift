// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_3e412d7b328b3f5a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_3ccadafaab48b090, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e68ba0d03654c68 = RemoteSchema(type: "string", literals: [.string("forward")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f5bcd72f92b6f9f = RemoteSchema(type: "string", literals: [.string("browser-watch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4067ad04bfbe200c = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_409712bfaed84392 = RemoteSchema(type: "array", items: RemoteSchemas.schema_e9e7b28a3dddd9fd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40aab29508fb3256 = RemoteSchema(type: "object", required: Set(["port", "protocol"]), properties: ["label": RemoteSchemas.schema_36fea325bf1aca70, "port": RemoteSchemas.schema_279eee1efa9da6c8, "protocol": RemoteSchemas.schema_cb34d50832b1e60d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_412fb1bbf466cf98 = RemoteSchema(type: "object", required: Set(["checkpointItemId", "projectLocation", "threadId"]), properties: ["checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4147389dac614b3a = RemoteSchema(type: "object", required: Set(["amount", "currency", "estimated", "period"]), properties: ["amount": RemoteSchemas.schema_f696f11685898ba7, "currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "estimated": RemoteSchemas.schema_feeb8bb50144d96d, "period": RemoteSchemas.schema_776626d20373881d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41be750b567a2144 = RemoteSchema(type: "string", literals: [.string("reload")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41bff5c7300a37e4 = RemoteSchema(type: "object", required: Set(["success"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d, "success": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41d0cf68976485ec = RemoteSchema(type: "string", literals: [.string("ios"), .string("android"), .string("web")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41ffeb2050e1e71c = RemoteSchema(type: "object", required: Set(["deltaX", "deltaY", "kind", "x", "y"]), properties: ["deltaX": RemoteSchemas.schema_80c415b6e27c6ebd, "deltaY": RemoteSchemas.schema_80c415b6e27c6ebd, "kind": RemoteSchemas.schema_00ebeb8fef40c2a6, "x": RemoteSchemas.schema_80c415b6e27c6ebd, "y": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_422b1e8c8be5e2c0 = RemoteSchema(type: "string", minLength: 1, maxLength: 4000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_4244283735615c22 = RemoteSchema(type: "object", required: Set(["threadId", "turnId", "type"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9f20fb68ee791598], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_427601a9d9ee2f62 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_b3a47e8838c4a831, "terminal": RemoteSchemas.schema_b3a47e8838c4a831], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_429303c2d6a42977 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_01e21946e943d3eb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_431be1ab7e1b0dc9 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_53ceafeed27db1df], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4331716fe2cf5702 = RemoteSchema(type: "object", required: Set(["projectPullRequestLists", "projects", "pullRequestKeyByBranch", "pullRequests", "revision", "targets"]), properties: ["projectPullRequestLists": RemoteSchemas.schema_d8ae5c3a60a788cd, "projects": RemoteSchemas.schema_1da8031b611dee7d, "pullRequestKeyByBranch": RemoteSchemas.schema_e51d77fd6734b53a, "pullRequests": RemoteSchemas.schema_4c858ee6a42cac59, "revision": RemoteSchemas.schema_56aa0e45cbdce0d0, "targets": RemoteSchemas.schema_7675a7cd6ae22dbd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43372628accc1dd8 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_7db74ec55cf0af32, "mimeType": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43639d56ca3f1150 = RemoteSchema(type: "object", required: Set(["message", "status"]), properties: ["message": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_437e2d5d20b6b495 = RemoteSchema(type: "object", required: Set(["checks"]), properties: ["checks": RemoteSchemas.schema_3c115ff749c28304], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43d29f1d5a2e1f23 = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_2d862d697d08c085], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_441bce375b64f3d0 = RemoteSchema(type: "string", literals: [.string("item.started")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_452c70feefa496c6 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_a4457c545e0e0489, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_458a4508393abce2 = RemoteSchema(type: "object", required: Set(["branches", "current"]), properties: ["branches": RemoteSchemas.schema_6b97469fe43177d6, "current": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4666c29660989480 = RemoteSchema(type: "array", items: RemoteSchemas.schema_56aa0e45cbdce0d0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_473e9b7f4728cf72 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_feeb8bb50144d96d, "terminal": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_475f91db7d51b153 = RemoteSchema(type: "string", literals: [.string("weekly")], unknownPolicy: .strip)
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
  static let schema_47fd370c6dedf4fa = RemoteSchema(type: "object", required: Set(["status"]), properties: ["status": RemoteSchemas.schema_32773ce5899289ad], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_48de96c42130e156 = RemoteSchema(type: "array", items: RemoteSchemas.schema_82e8027595898a28, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48ed3fa6cae99861 = RemoteSchema(type: "object", required: Set(["prs"]), properties: ["prs": RemoteSchemas.schema_0660587dd1508064], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_4aa55712229a85ad = RemoteSchema(type: "object", required: Set(["agentKind", "baseBranch", "branch", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "branch": RemoteSchemas.schema_36fea325bf1aca70, "effort": RemoteSchemas.schema_36fea325bf1aca70, "language": RemoteSchemas.schema_36fea325bf1aca70, "model": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c08f56d9358b723 = RemoteSchema(type: "object", required: Set(["kind", "patch", "projectId"]), properties: ["kind": RemoteSchemas.schema_cbc64d14585e9a92, "patch": RemoteSchemas.schema_352050e671edc6e9, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c1171296b6868a1 = RemoteSchema(type: "object", required: Set(["id", "state", "streams", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "state": RemoteSchemas.schema_2472eab79ad4b307, "streams": RemoteSchemas.schema_e51d77fd6734b53a, "type": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c20b501501c0ba4 = RemoteSchema(type: "array", items: RemoteSchemas.schema_df96bd315b4c0dae, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c858ee6a42cac59 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_5a8fe22d39b2c89d, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
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
  static let schema_4d5989d27d26b612 = RemoteSchema(type: "string", literals: [.string("delete")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4dde56e240bff50e = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1709690cf0edf961, RemoteSchemas.schema_2b7b34c95b23bb0d, RemoteSchemas.schema_0e8f58f429bb1135, RemoteSchemas.schema_d550ef9994fd388f, RemoteSchemas.schema_863be77948ff8e01, RemoteSchemas.schema_5af10e67b405a136, RemoteSchemas.schema_d2299af726097d6c, RemoteSchemas.schema_93bef3a552bf787e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4dea101cb65656f3 = RemoteSchema(type: "object", required: Set(["id", "marketplace", "name", "official", "rank", "skillId", "source"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "installs": RemoteSchemas.schema_56aa0e45cbdce0d0, "marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "name": RemoteSchemas.schema_36fea325bf1aca70, "official": RemoteSchemas.schema_feeb8bb50144d96d, "rank": RemoteSchemas.schema_23e05d248383ea40, "securityGrade": RemoteSchemas.schema_e987f23b082616d2, "securityScore": RemoteSchemas.schema_a581e67cd137ad59, "skillId": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_36fea325bf1aca70, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "sourceRef": RemoteSchemas.schema_36fea325bf1aca70, "sourceUrl": RemoteSchemas.schema_6bb6e13415c8cbba, "stars": RemoteSchemas.schema_56aa0e45cbdce0d0, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "votes": RemoteSchemas.schema_56aa0e45cbdce0d0, "weeklyInstalls": RemoteSchemas.schema_4666c29660989480], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_50e8e4265cb34b55 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_522b0d7f41276332 = RemoteSchema(type: "object", required: Set(["hash", "message"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "hash": RemoteSchemas.schema_bf0b727f7b1c6d07, "message": RemoteSchemas.schema_bf0b727f7b1c6d07, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5296d6b04d46b630 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4c967d4ed16edbc1, RemoteSchemas.schema_e0da1e0a5e3cd077, RemoteSchemas.schema_a66324f9a46c480b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_52bd1574b5a0b432 = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_f0266e8ace51b0e7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_53996e5a27a5b0c4 = RemoteSchema(type: "string", pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", unknownPolicy: .strip, transformIds: ["push.routing.client-connection-id.lowercase"])
}

public extension RemoteSchemas {
  static let schema_53ceafeed27db1df = RemoteSchema(type: "string", literals: [.string("archive")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_53f3c1938556e280 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 59.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_540ab9236f8c36ab = RemoteSchema(type: "object", required: Set(["posix", "windows"]), properties: ["posix": RemoteSchemas.schema_685dee710cb094fd, "windows": RemoteSchemas.schema_685dee710cb094fd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5465dd986b32b774 = RemoteSchema(type: "string", literals: [.string("windows")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_54c83506378cf7c8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_f3c2d2c49187a75b, RemoteSchemas.schema_43d29f1d5a2e1f23], unknownPolicy: .strip, semanticIds: ["thread.goal.objective.trim"])
}

public extension RemoteSchemas {
  static let schema_5513eb6f6fbb46a0 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["filePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "staged": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_551f784ecdbbf2f4 = RemoteSchema(type: "object", required: Set(["absolutePath", "baseModifiedAtMs", "content", "projectLocation"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "baseModifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "content": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_553c5c509350e4e7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_6508684ba659826b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_55a090c12a60cd7e = RemoteSchema(type: "array", items: RemoteSchemas.schema_d9ae4e225fe9170f, unknownPolicy: .strip)
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
  static let schema_5646cf57ff3aebe0 = RemoteSchema(type: "object", required: Set(["host", "login"]), properties: ["host": RemoteSchemas.schema_36fea325bf1aca70, "login": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_567aa4ef7f92d006 = RemoteSchema(type: "object", required: Set(["details"]), properties: ["details": RemoteSchemas.schema_9f1da8cf549c341e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56aa0e45cbdce0d0 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56df8e6416f18e3e = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_57033b19c3e2750e = RemoteSchema(type: "object", required: Set(["items", "nextCursor"]), properties: ["items": RemoteSchemas.schema_d3749f0d30f56447, "nextCursor": RemoteSchemas.schema_60e901bdbc3f78cd], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_591e7e71be40d4d4 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_6b98eaede59b512a, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59a69c0935c5e482 = RemoteSchema(type: "object", required: Set(["path"]), properties: ["access_token": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59cd628901920f3f = RemoteSchema(type: "object", required: Set(["agents", "title"]), properties: ["agents": RemoteSchemas.schema_cbad4936b49ad671, "detail": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a17efba356f5500 = RemoteSchema(type: "string", literals: [.string("queued"), .string("running"), .string("done"), .string("failed"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a8fe22d39b2c89d = RemoteSchema(type: "object", required: Set(["data", "freshness", "ref"]), properties: ["data": RemoteSchemas.schema_a4457c545e0e0489, "details": RemoteSchemas.schema_9f1da8cf549c341e, "diff": RemoteSchemas.schema_bf0b727f7b1c6d07, "files": RemoteSchemas.schema_0abd6180b71e8684, "freshness": RemoteSchemas.schema_0bd7710eac491f27, "ref": RemoteSchemas.schema_255898614500bbb9, "reviewThreads": RemoteSchemas.schema_5de54f0b1df69cc9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5af10e67b405a136 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_af6b6f72d4304b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5bb2b4a4a0c3c485 = RemoteSchema(type: "object", properties: ["stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5cb704413fbdf0b3 = RemoteSchema(type: "object", required: Set(["code", "message"]), properties: ["authScheme": RemoteSchemas.schema_2d52ff1140653b18, "code": RemoteSchemas.schema_2fb9be13c54e7688, "message": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5cfe15b2e7d4fc30 = RemoteSchema(type: "string", literals: [.string("available"), .string("already-imported"), .string("conflict")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d401c152e12e715 = RemoteSchema(type: "object", required: Set(["itemCount"]), properties: ["contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "itemCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "latestItemId": RemoteSchemas.schema_36fea325bf1aca70, "latestItemState": RemoteSchemas.schema_2472eab79ad4b307, "latestItemType": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d5cc3aa0a1f3291 = RemoteSchema(type: "string", literals: [.string("update-not-available")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d8849075c27ee38 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prune": RemoteSchemas.schema_f8b6dd8128e8bfe0, "remote": RemoteSchemas.schema_bfc0c020a52f85b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d9c5341a06760dc = RemoteSchema(type: "object", required: Set(["run"]), properties: ["run": RemoteSchemas.schema_95bca512ea5c155a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5da64eb8d698413e = RemoteSchema(type: "array", items: RemoteSchemas.schema_d0ecd43b5f1b261a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5de54f0b1df69cc9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9199b6e9ea61b83e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e3a19fb856f8915 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ea95607826c2d23 = RemoteSchema(type: "object", required: Set(["content", "kind"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_3ad514880db80c82], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5f1cf4ab237639a7 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_835d30ad470a686c, "path": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
