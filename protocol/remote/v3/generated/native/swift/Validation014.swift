// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_f2e3da83f3088e10 = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_04569d9eea76ae2b, "result": RemoteSchemas.schema_51cc694dc5da9f2a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f30731ffd8c57b5c = RemoteSchema(type: "string", literals: [.string("content.delta")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f34e1c0e37ed0c00 = RemoteSchema(type: "object", required: Set(["message", "projectLocation"]), properties: ["addAll": RemoteSchemas.schema_f8b6dd8128e8bfe0, "message": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "reapplyStashCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f355c9e66a3091a2 = RemoteSchema(type: "string", minLength: 1, maxLength: 120, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f399af5f8dcf6035 = RemoteSchema(type: "string", literals: [.string("set-group")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f3c2d2c49187a75b = RemoteSchema(type: "object", required: Set(["action", "objective"]), properties: ["action": RemoteSchemas.schema_10209383e3295873, "objective": RemoteSchemas.schema_422b1e8c8be5e2c0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f3d89ffd4842a73f = RemoteSchema(type: "array", items: RemoteSchemas.schema_b92447920382853b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f450768848c5befd = RemoteSchema(type: "string", literals: [.string("boolean"), .string("choice"), .string("environment"), .string("number"), .string("string")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f46da48437a0c164 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0465e7aaae9c70d7, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4812bd0938d0d6b = RemoteSchema(type: "array", items: RemoteSchemas.schema_1d3e5368baf49e21, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4cab1817a71aa36 = RemoteSchema(type: "string", literals: [.string("skills")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4e43b71651c06ad = RemoteSchema(type: "string", minLength: 1, maxLength: 32, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f550638b8241897c = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c66f09c6212330ba, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f58a8b771657d037 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f614b14ae0e3bbca = RemoteSchema(type: "object", required: Set(["actionId", "payload", "threadId"]), properties: ["actionId": RemoteSchemas.schema_f355c9e66a3091a2, "payload": RemoteSchemas.schema_e6958017dac6cd3b, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f67f6cbe63879b24 = RemoteSchema(type: "string", literals: [.string("v1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f69100925fc0e774 = RemoteSchema(type: "object", required: Set(["model"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_36fea325bf1aca70, "selectionBinding": RemoteSchemas.schema_a11ab76af3bce730, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_f696f11685898ba7 = RemoteSchema(type: "number", minimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6983a322fa14ff5 = RemoteSchema(type: "object", required: Set(["absolutePath", "projectLocation"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

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
  static let schema_f97770a7e3ba8e29 = RemoteSchema(type: "object", required: Set(["account", "kind", "nameWithOwner"]), properties: ["account": RemoteSchemas.schema_5646cf57ff3aebe0, "kind": RemoteSchemas.schema_cc1f68c41f086183, "nameWithOwner": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f983f1aded87bea9 = RemoteSchema(type: "object", required: Set(["process", "remote"]), properties: ["hostResourceAdmission": RemoteSchemas.schema_710b6ecb781e06cd, "process": RemoteSchemas.schema_9f6e05a566c74be3, "remote": RemoteSchemas.schema_99cf08bb5da33962], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f9b76467f6b16682 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_3120d80990432c9a, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_f9c97c26b130e744 = RemoteSchema(type: "object", properties: ["activeTab": RemoteSchemas.schema_8c20a3e2d150dfcf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f9da03570b6c69fa = RemoteSchema(type: "object", required: Set(["agentCount", "phases", "runId", "status", "unphasedAgents"]), properties: ["agentCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "defaultModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "durationMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "phases": RemoteSchemas.schema_fae23683c505297d, "runId": RemoteSchemas.schema_36fea325bf1aca70, "scriptPath": RemoteSchemas.schema_bf0b727f7b1c6d07, "startTime": RemoteSchemas.schema_3d06117798bf5171, "status": RemoteSchemas.schema_3a008e3c404a93c8, "summary": RemoteSchemas.schema_bf0b727f7b1c6d07, "taskId": RemoteSchemas.schema_bf0b727f7b1c6d07, "totalTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalToolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0, "unphasedAgents": RemoteSchemas.schema_cbad4936b49ad671, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f9e7f90793023053 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 100.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fa41f0033e95da89 = RemoteSchema(type: "object", required: Set(["distro", "kind", "linuxPath", "uncPath"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2d8274eae552cc51, "linuxPath": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "uncPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fa4a387c10f5125f = RemoteSchema(type: "string", minLength: 1, maxLength: 120, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fae23683c505297d = RemoteSchema(type: "array", items: RemoteSchemas.schema_59cd628901920f3f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fb0686e874c29254 = RemoteSchema(type: "object", required: Set(["additions", "baseBranch", "body", "changedFiles", "checks", "comments", "commits", "deletions", "headBranch", "number", "reviews", "title"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "author": RemoteSchemas.schema_a99c73e81a312991, "baseBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "changedFiles": RemoteSchemas.schema_3d06117798bf5171, "checks": RemoteSchemas.schema_3c115ff749c28304, "closedAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "comments": RemoteSchemas.schema_ac3d09b5c7f361d2, "commits": RemoteSchemas.schema_19cc91cdde8419f3, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "deletions": RemoteSchemas.schema_3d06117798bf5171, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "labels": RemoteSchemas.schema_0e31d5342d99e6b9, "mergedAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "mergedBy": RemoteSchemas.schema_da37aeddd0e606ac, "number": RemoteSchemas.schema_23e05d248383ea40, "reactions": RemoteSchemas.schema_45e52f032f196485, "requestedReviewers": RemoteSchemas.schema_1d261f6c634ca0b3, "reviewThreads": RemoteSchemas.schema_7f88819389c3ccc9, "reviews": RemoteSchemas.schema_1fc25f3569e514e5, "source": RemoteSchemas.schema_2e68c47efd6e1f9c, "timeline": RemoteSchemas.schema_edf7721bcc428be5, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fb3dd6021c9a98a4 = RemoteSchema(type: "object", required: Set(["default", "description", "env", "key", "label", "type"]), properties: ["default": RemoteSchemas.schema_feeb8bb50144d96d, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "env": RemoteSchemas.schema_e51d77fd6734b53a, "key": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "platforms": RemoteSchemas.schema_0f732b9fceb2c6ac, "type": RemoteSchemas.schema_e841af2cbd75708d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc24a3f2860a27ad = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4545388132b77b29, RemoteSchemas.schema_e80087031872d26b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc3e1f61a45e621e = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_da78bdce10e9cf0f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc49e8b0b6ac2911 = RemoteSchema(type: "object", required: Set(["agentKind", "threadId", "worktreeBranch", "worktreeOwnerToken", "worktreeState"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "agentLabel": RemoteSchemas.schema_36fea325bf1aca70, "effort": RemoteSchemas.schema_36fea325bf1aca70, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70, "worktreeState": RemoteSchemas.schema_a8b4490d4a4f6745], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc779c522d442c13 = RemoteSchema(type: "string", literals: [.string("target")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc9d6f4c2617a24d = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_5d401c152e12e715, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fcb2eed91b3e89ce = RemoteSchema(type: "string", literals: [.string("request.opened")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fcec19cd11bed7c3 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_8457056778d19fdf, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd056ca894e30f21 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd20949193e6879d = RemoteSchema(type: "string", literals: [.string("missing"), .string("installed"), .string("installing"), .string("unsupported"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd4fd2eb416ae002 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_d585eadabc094972], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_fd6258ac6546d705 = RemoteSchema(type: "string", literals: [.string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd8574a70c8187db = RemoteSchema(type: "object", required: Set(["endpoint", "expirationTime", "keys"]), properties: ["endpoint": RemoteSchemas.schema_51e99f5d3372fb77, "expirationTime": RemoteSchemas.schema_60e901bdbc3f78cd, "keys": RemoteSchemas.schema_29fba8fe9f5724e0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd95a83e5b156564 = RemoteSchema(type: "object", required: Set(["summary"]), properties: ["details": RemoteSchemas.schema_ca3d163bab055381, "multiSelect": RemoteSchemas.schema_feeb8bb50144d96d, "options": RemoteSchemas.schema_302783bd5327b877, "summary": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fdad254a8bac8914 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fdddba9ec6ce269e = RemoteSchema(type: "object", required: Set(["completionPolicy", "maxIterations", "maxRuntimeSeconds", "misfirePolicy", "mode", "retryPolicy", "stopOnError", "version"]), properties: ["completionPolicy": RemoteSchemas.schema_fc24a3f2860a27ad, "maxIterations": RemoteSchemas.schema_e82ae39cda9f878d, "maxRuntimeSeconds": RemoteSchemas.schema_4535713ebdcc5c37, "misfirePolicy": RemoteSchemas.schema_bb479bc5848b9f45, "mode": RemoteSchemas.schema_b588ef57ebadea7a, "retryPolicy": RemoteSchemas.schema_de13949691e24afd, "stopOnError": RemoteSchemas.schema_feeb8bb50144d96d, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["schedule.automation"])
}

public extension RemoteSchemas {
  static let schema_fe73ac6ba621dd72 = RemoteSchema(type: "object", required: Set(["version"]), properties: ["version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe7522595f5637c3 = RemoteSchema(type: "object", required: Set(["itemId", "itemType", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "itemType": RemoteSchemas.schema_5455d140717a50b3, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_441bce375b64f3d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe79d48b8af45e7d = RemoteSchema(type: "string", literals: [.string("ping")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe7aea0f55ed142e = RemoteSchema(type: "array", items: RemoteSchemas.schema_8b1889f3513fe2b3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe8cce293da1b3f5 = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_413ace8627552254, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fece443c82df794e = RemoteSchema(type: "array", maxItems: 30, items: RemoteSchemas.schema_5894304151eb6a79, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fed486f9f6e73521 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_c6b76607f48c889e, RemoteSchemas.schema_ca0c8b8a7fbb7b5d, RemoteSchemas.schema_f04c7b0573aff59c, RemoteSchemas.schema_eb2405f61baf028b, RemoteSchemas.schema_ec76fa076d16485a, RemoteSchemas.schema_d1df243f455504fc], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fee1e07039137fc5 = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_9bf3994f2546a7d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_feeb8bb50144d96d = RemoteSchema(type: "boolean", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_feff20c88bde0c4c = RemoteSchema(type: "object", required: Set(["type", "value"]), properties: ["type": RemoteSchemas.schema_4311a74adde583c6, "value": RemoteSchemas.schema_d61b01c8cb5f5718], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_ff05783d57039aa1 = RemoteSchema(type: "string", literals: [.string("user"), .string("assistant")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ff3b9b0284fcd244 = RemoteSchema(type: "string", maxLength: 320, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ff495aee3e719fab = RemoteSchema(type: "object", required: Set(["parentItemId", "threadId"]), properties: ["parentItemId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ff4e0a6efa5fd888 = RemoteSchema(type: "string", literals: [.string("grant"), .string("revoke")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ffc64b31e09ad873 = RemoteSchema(type: "string", literals: [.string("update-state")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ffdf9008e6986c48 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_fed486f9f6e73521, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fff3547caad99f85 = RemoteSchema(type: "object", required: Set(["authState", "capabilities", "installed", "kind", "label"]), properties: ["acpSessionEstablished": RemoteSchemas.schema_feeb8bb50144d96d, "authLogoutSupported": RemoteSchemas.schema_feeb8bb50144d96d, "authMethods": RemoteSchemas.schema_cd0a57f27ae4fccb, "authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "capabilities": RemoteSchemas.schema_e0845a6e4a3f765e, "envDistro": RemoteSchemas.schema_bf0b727f7b1c6d07, "envKind": RemoteSchemas.schema_9eed5c4959909cfe, "executablePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "loginCommand": RemoteSchemas.schema_36fea325bf1aca70, "loginCommandDisplay": RemoteSchemas.schema_36fea325bf1aca70, "preferTerminalLogin": RemoteSchemas.schema_feeb8bb50144d96d, "presentationAuthStates": RemoteSchemas.schema_678d084ee287670a, "presentationAuthUsesProviderLogin": RemoteSchemas.schema_473e9b7f4728cf72, "providerMetadata": RemoteSchemas.schema_197c2b8c01d7f4ed, "runtimeVariants": RemoteSchemas.schema_9ced215a757add76, "sessionRuntimeRouting": RemoteSchemas.schema_d221b1853eb0ef37, "update": RemoteSchemas.schema_892eceb2acf00deb, "version": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}
