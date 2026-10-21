// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_4b43828b172de36c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accessibility", "id", "input", "name", "platform", "state"), properties = mapOf("accessibility" to schema_feeb8bb50144d96d, "controls" to schema_edaad5a427ee5ae6, "id" to schema_97d85a5eaee82b97, "input" to schema_feeb8bb50144d96d, "name" to schema_f1deff8504bbc0a3, "platform" to schema_61e54b5f6751c7a6, "state" to schema_51b8dd645024c82d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4bc21f7698ec2e7b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("created" to schema_feeb8bb50144d96d, "ok" to schema_d2dd3595e1b5e5dc, "project" to schema_cac3b973979876dd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c1171296b6868a1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "state", "streams", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "state" to schema_2472eab79ad4b307, "streams" to schema_e51d77fd6734b53a, "type" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c20b501501c0ba4: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_df96bd315b4c0dae, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c967d4ed16edbc1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("args", "command", "env", "type"), properties = mapOf("args" to schema_aac2a4e83d2823be, "command" to schema_36fea325bf1aca70, "cwd" to schema_36fea325bf1aca70, "env" to schema_c3ac2139868061bb, "type" to schema_01f71c4e26e7ecde), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4caa9ebeea5fe346: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message"), properties = mapOf("message" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4cb4c9750289b975: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("add-existing")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4cd2587996458d8d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("distro", "kind"), properties = mapOf("distro" to schema_36fea325bf1aca70, "kind" to schema_2d8274eae552cc51), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4ce9d2f234c3a468: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 1000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4d34acc64dd77a5d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("probe")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4d5989d27d26b612: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4dced7b84600297c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "instructions" to schema_e8ae3938f73bbe3d, "language" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4de8e3eae98ee9e2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("batches", "completedTurns", "contextUsage", "kind", "runtimeResumeCursor", "snapshotSeq", "thread"), properties = mapOf("backgroundTasks" to schema_00675d64d428c3d1, "batches" to schema_e0fc3c3d350deb38, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "kind" to schema_e1a91348d83820fb, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "thread" to schema_131fd1869b52ef74), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4dea101cb65656f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "marketplace", "name", "official", "rank", "skillId", "source"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "installs" to schema_56aa0e45cbdce0d0, "marketplace" to schema_118f67a0fa6bb27d, "name" to schema_36fea325bf1aca70, "official" to schema_feeb8bb50144d96d, "rank" to schema_23e05d248383ea40, "securityGrade" to schema_e987f23b082616d2, "securityScore" to schema_a581e67cd137ad59, "skillId" to schema_36fea325bf1aca70, "source" to schema_36fea325bf1aca70, "sourcePath" to schema_36fea325bf1aca70, "sourceRef" to schema_36fea325bf1aca70, "sourceUrl" to schema_6bb6e13415c8cbba, "stars" to schema_56aa0e45cbdce0d0, "updatedAt" to schema_36fea325bf1aca70, "votes" to schema_56aa0e45cbdce0d0, "weeklyInstalls" to schema_4666c29660989480), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4df989d5459165c8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_56a9bf5bf312d537, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4e014bc9e6085564: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 5, items = schema_4ce9d2f234c3a468, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4e1c353012bcb7ec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conclusion", "name", "number", "status"), properties = mapOf("completedAt" to schema_bf0b727f7b1c6d07, "conclusion" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "number" to schema_3d06117798bf5171, "startedAt" to schema_bf0b727f7b1c6d07, "status" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4eb37bd43cbe100e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ahead", "behind", "branch", "created", "tracking"), properties = mapOf("ahead" to schema_3d06117798bf5171, "behind" to schema_3d06117798bf5171, "branch" to schema_bf0b727f7b1c6d07, "created" to schema_feeb8bb50144d96d, "tracking" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4ec1299a984102e2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("acknowledge")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4ec1d31e87eeb7a4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_046f6b1ae10fa4ef), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4f399075769723a3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "payload"), properties = mapOf("id" to schema_f355c9e66a3091a2, "payload" to schema_5cb1759d88da4b15), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4f84b56b06f60ea1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("http")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_500ee3799383d21f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_3e68ba0d03654c68, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_501221cdcb9cd48b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind", "name"), properties = mapOf("id" to schema_36fea325bf1aca70, "kind" to schema_c669b4e26b2b7569, "name" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5027b509e87ee5fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation", "type"), properties = mapOf("path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_505ae61467accdeb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpoint"), properties = mapOf("checkpoint" to schema_09b66dd237e8c823), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_506f036707472345: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("accepted"), JsonPrimitive("declined"), JsonPrimitive("answered"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5093c62d05bf0072: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeThreadId", "autoMerge", "blockedReason", "headBranch", "lastCheckKey", "lastCommentCursor", "lastError", "lastReviewCommentCursor", "lastReviewCursor", "prNumber", "projectId", "watchEnabled"), properties = mapOf("activeThreadId" to schema_2d0b6ec9f2b2decf, "agentKind" to schema_36fea325bf1aca70, "autoMerge" to schema_feeb8bb50144d96d, "blockedReason" to schema_7dccd2754fedc801, "config" to schema_f69100925fc0e774, "headBranch" to schema_36fea325bf1aca70, "lastCheckKey" to schema_2d0b6ec9f2b2decf, "lastCommentCursor" to schema_2d0b6ec9f2b2decf, "lastError" to schema_2d0b6ec9f2b2decf, "lastReviewCommentCursor" to schema_2d0b6ec9f2b2decf, "lastReviewCursor" to schema_2d0b6ec9f2b2decf, "prNumber" to schema_f58a8b771657d037, "projectId" to schema_36fea325bf1aca70, "reviewScope" to schema_464dbc5abe96a4c9, "reviewScopeUnsupported" to schema_d2dd3595e1b5e5dc, "watchEnabled" to schema_feeb8bb50144d96d, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("pr-watch.agent-required-when-enabled"))
}

internal val schema_50d5adf9e97ef8bd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "prompt", "threadId"), properties = mapOf("expectedStagedAt" to schema_80c415b6e27c6ebd, "id" to schema_36fea325bf1aca70, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_50e8e4265cb34b55: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_513dd8593f33208a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "workflowId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_515482d2104d1efa: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51733da614782090: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authenticatedUrls"), properties = mapOf("authenticatedUrls" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_518b8374aca2de65: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("update-available")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51b8dd645024c82d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("stopped"), JsonPrimitive("starting")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51cc694dc5da9f2a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_47fd370c6dedf4fa, schema_43639d56ca3f1150), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51d89a5cbbb635e7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("actions"), properties = mapOf("actions" to schema_9f0df99b7a4b0249, "cleanupScript" to schema_bf0b727f7b1c6d07, "setupScript" to schema_bf0b727f7b1c6d07, "worktreeCopyPatterns" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51e99f5d3372fb77: RemoteSchema by lazy {
    RemoteSchema(type = "string", format = "uri", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("push.web.endpoint-https"))
}

internal val schema_51f2acb99ea96b5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_3df0ab0b4ea7223c, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51fc061b3ecc735c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("newLocation", "projectId"), properties = mapOf("newLocation" to schema_080f9cc154af9e27, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_522b0d7f41276332: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hash", "message"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "hash" to schema_bf0b727f7b1c6d07, "message" to schema_bf0b727f7b1c6d07, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_528726e6ad6aefbd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("counter", "counterKind", "epoch", "sampleId", "scopeId"), properties = mapOf("cost" to schema_ad6bb2de51c0e05f, "counter" to schema_56aa0e45cbdce0d0, "counterKind" to schema_91a5d2d349991a6a, "epoch" to schema_56aa0e45cbdce0d0, "fresh" to schema_feeb8bb50144d96d, "model" to schema_bf0b727f7b1c6d07, "occurredAt" to schema_56aa0e45cbdce0d0, "sampleId" to schema_36fea325bf1aca70, "scopeId" to schema_36fea325bf1aca70, "tokens" to schema_e70be7a06d8baea6, "turnId" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5296d6b04d46b630: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4c967d4ed16edbc1, schema_e0da1e0a5e3cd077, schema_a66324f9a46c480b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53996e5a27a5b0c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format = "uuid", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("push.routing.client-connection-id.lowercase"))
}

internal val schema_53ceafeed27db1df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("archive")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53f3c1938556e280: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 59.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_540ab9236f8c36ab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("posix", "windows"), properties = mapOf("posix" to schema_685dee710cb094fd, "windows" to schema_685dee710cb094fd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5455d140717a50b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user_message"), JsonPrimitive("assistant_message"), JsonPrimitive("reasoning"), JsonPrimitive("plan"), JsonPrimitive("goal"), JsonPrimitive("command_execution"), JsonPrimitive("file_change"), JsonPrimitive("tool_call"), JsonPrimitive("mcp_tool_call"), JsonPrimitive("image_view"), JsonPrimitive("dynamic_tool_call"), JsonPrimitive("web_search"), JsonPrimitive("question_answer"), JsonPrimitive("provider_handoff"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5465dd986b32b774: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("windows")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_54c83506378cf7c8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_f3c2d2c49187a75b, schema_43d29f1d5a2e1f23), unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.goal.objective.trim"))
}

internal val schema_54e79a700cdcdd03: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("heartbeat")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5513eb6f6fbb46a0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("filePath" to schema_bf0b727f7b1c6d07, "projectLocation" to schema_080f9cc154af9e27, "staged" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_551f784ecdbbf2f4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "baseModifiedAtMs", "content", "projectLocation"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "baseModifiedAtMs" to schema_f696f11685898ba7, "content" to schema_bf0b727f7b1c6d07, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_552de755ef856a71: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("already")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_553c5c509350e4e7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_6508684ba659826b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_55723acd91303073: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capabilities", "forge", "host", "remote", "repository"), properties = mapOf("account" to schema_c2bb40b82b330cd4, "capabilities" to schema_71731d44e94842e0, "forge" to schema_eaed3cfbf46d5d81, "host" to schema_36fea325bf1aca70, "remote" to schema_36fea325bf1aca70, "repository" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_55bad6da24b769c6: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_5093c62d05bf0072, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("pr-watch.agent-required-when-enabled"))
}

internal val schema_55c4cb32b40db3a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "expectedOwnerToken" to schema_8e43cad70cd70de7, "force" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("git.delete-branch.remote-cannot-have-owner"))
}

internal val schema_55ee222c096690dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cols", "rows"), properties = mapOf("cols" to schema_9980c767412d708b, "rows" to schema_1fa1b7f79d80e44d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5604f00f2a788035: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bc731d8f39fdb4bc, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_560a7abcaf51999f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authenticatedServerIds", "kind"), properties = mapOf("authenticatedServerIds" to schema_515482d2104d1efa, "kind" to schema_274e069cdc933ee1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56296b74a9501a6f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("manual"), JsonPrimitive("scheduled"), JsonPrimitive("retry")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5646cf57ff3aebe0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("host", "login"), properties = mapOf("host" to schema_36fea325bf1aca70, "login" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56a9bf5bf312d537: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "description", "enabled", "folderName", "id", "linked", "mutable", "name", "origin", "providerId", "providerLabel", "rootPath", "scope", "scopeLabel", "skillFilePath", "valid"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "availability" to schema_9c8337f42f233534, "description" to schema_bf0b727f7b1c6d07, "enabled" to schema_feeb8bb50144d96d, "folderName" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "importState" to schema_5cfe15b2e7d4fc30, "invalidReason" to schema_883b3b8a6153aa17, "invocation" to schema_ee6af1c3c62ad32f, "linked" to schema_feeb8bb50144d96d, "mutable" to schema_feeb8bb50144d96d, "name" to schema_36fea325bf1aca70, "origin" to schema_91766049dfdea029, "pluginId" to schema_36fea325bf1aca70, "pluginName" to schema_36fea325bf1aca70, "portable" to schema_feeb8bb50144d96d, "providerGroupId" to schema_36fea325bf1aca70, "providerGroupLabel" to schema_36fea325bf1aca70, "providerGroupOrder" to schema_3d06117798bf5171, "providerId" to schema_36fea325bf1aca70, "providerLabel" to schema_36fea325bf1aca70, "rootPath" to schema_36fea325bf1aca70, "scope" to schema_ac6ea0fc110d7efb, "scopeLabel" to schema_36fea325bf1aca70, "skillFilePath" to schema_36fea325bf1aca70, "sourcePath" to schema_36fea325bf1aca70, "valid" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56aa0e45cbdce0d0: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56df8e6416f18e3e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56ee97530dcbb64f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5760038b3ac1009b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision", "patch"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037, "patch" to schema_2a5c67603fdb726c), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_580efa06e9547a64: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "placement", "projectId", "targetProjectId"), properties = mapOf("kind" to schema_701d7d6274e152f6, "placement" to schema_3512bd687eb85e90, "projectId" to schema_36fea325bf1aca70, "targetProjectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_581f3fd03959d5f7: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 50.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58317133a27c74f8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9c01de6b080eca40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_587e72c508e2943a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("fork")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5894304151eb6a79: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("endLine", "path", "side", "startLine", "text"), properties = mapOf("endLine" to schema_23e05d248383ea40, "path" to schema_36fea325bf1aca70, "side" to schema_598c25a2e687258b, "startLine" to schema_23e05d248383ea40, "text" to schema_6d40bf61903aed2d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58a226c992f64fc4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58c75b9ad5972758: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_40aab29508fb3256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58edfaf9f73b8db4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none"), JsonPrimitive("working"), JsonPrimitive("needs_approval"), JsonPrimitive("needs_reply"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58f9a3fda2694c76: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "hour", "label"), properties = mapOf("count" to schema_56aa0e45cbdce0d0, "hour" to schema_47c50d7349a5a322, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59152790354c604a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("guide", "stale", "status"), properties = mapOf("diffHash" to schema_ec221fdc1494d0b1, "guide" to schema_c591e31c389e744f, "stale" to schema_feeb8bb50144d96d, "status" to schema_e25509dad8a191fe), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_591e7e71be40d4d4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_6b98eaede59b512a, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_592634b8956b6cd0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("permission")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59599d21a24ed95c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("beforeId", "id", "threadId"), properties = mapOf("beforeId" to schema_df704162f3d15808, "id" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_595da89b21b7ca56: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_38adcf16c79023ce, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_596b826e9125183e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enabled", "type"), properties = mapOf("enabled" to schema_feeb8bb50144d96d, "type" to schema_d4757acfcddc86a6), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_598c25a2e687258b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("LEFT"), JsonPrimitive("RIGHT")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59cd628901920f3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agents", "title"), properties = mapOf("agents" to schema_cbad4936b49ad671, "detail" to schema_bf0b727f7b1c6d07, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a17efba356f5500: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("queued"), JsonPrimitive("running"), JsonPrimitive("done"), JsonPrimitive("failed"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a931a4108dce660: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"), properties = mapOf("appVersion" to schema_36fea325bf1aca70, "auth" to schema_2a8bc62fab6ac143, "capabilities" to schema_48ca3a84cd4a6f59, "desktopId" to schema_36fea325bf1aca70, "endpoints" to schema_17c2b8a25332cd3a, "hostMode" to schema_d1d1696e7dc33885, "label" to schema_36fea325bf1aca70, "platform" to schema_7583b8d37fafbf18, "protocolVersion" to schema_8d7cbafc0ecc27cb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5aa9e435f68d585e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("summary"), JsonPrimitive("transcript")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ae95e3b3c8a9ee1: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 2000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5af10e67b405a136: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "type" to schema_af6b6f72d4304b97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5bb2b4a4a0c3c485: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5bbcf9e4750fbaa3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ai-evaluated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5c07f5964567e9f0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 16000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5c6957eaa59e2ae2: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 2000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_5cb1759d88da4b15: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_3cdb2ff0de916278, propertyNames = schema_e847e321fbb6435b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5cb704413fbdf0b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message"), properties = mapOf("authScheme" to schema_2d52ff1140653b18, "code" to schema_2fb9be13c54e7688, "message" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ce0ae73fb12b141: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"), properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "commitGenSelection" to schema_32c3720f649f40a1, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "conflictResolverSelection" to schema_32c3720f649f40a1, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_65899fb957cb9421, "enabledMcpServers" to schema_2d677fb04187d46b, "experimentJudgeSelection" to schema_32c3720f649f40a1, "followUpBehavior" to schema_6fcb1a55c059e655, "hiddenModels" to schema_86d5d72e84423420, "prAutomationDefault" to schema_6df05d56a8273d4c, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "titleGenSelection" to schema_32c3720f649f40a1, "usage" to schema_18dc352c9a615faa, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslCommitGenSelection" to schema_32c3720f649f40a1, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverSelection" to schema_32c3720f649f40a1, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenSelection" to schema_32c3720f649f40a1, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5cfe15b2e7d4fc30: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("available"), JsonPrimitive("already-imported"), JsonPrimitive("conflict")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d04b357c40b2734: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authState", "authUsesProviderLogin", "capabilities", "installed", "presentationMode"), properties = mapOf("authLogoutSupported" to schema_feeb8bb50144d96d, "authMethods" to schema_cd0a57f27ae4fccb, "authState" to schema_2363c4dd0a78ce9d, "authUsesProviderLogin" to schema_feeb8bb50144d96d, "capabilities" to schema_66496e59a33f7747, "installationSource" to schema_36fea325bf1aca70, "installed" to schema_feeb8bb50144d96d, "loginCommand" to schema_36fea325bf1aca70, "loginCommandDisplay" to schema_36fea325bf1aca70, "preferTerminalLogin" to schema_feeb8bb50144d96d, "presentationMode" to schema_6508684ba659826b, "providerMetadata" to schema_197c2b8c01d7f4ed, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d3ac76d9a521e1d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8fa99a81fa4d20fb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d401c152e12e715: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemCount"), properties = mapOf("contextUsage" to schema_e47ad2358cf0df53, "itemCount" to schema_56aa0e45cbdce0d0, "latestItemId" to schema_36fea325bf1aca70, "latestItemState" to schema_2472eab79ad4b307, "latestItemType" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d4b39004bf5c532: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = 0.0, maximum = 1.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d5cc3aa0a1f3291: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("update-not-available")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d8849075c27ee38: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "prune" to schema_f8b6dd8128e8bfe0, "remote" to schema_bfc0c020a52f85b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d9c5341a06760dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("run"), properties = mapOf("run" to schema_95bca512ea5c155a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5da64eb8d698413e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d0ecd43b5f1b261a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5de54f0b1df69cc9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9199b6e9ea61b83e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e1b33a49482671a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cursor" to schema_36fea325bf1aca70, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "mode" to schema_902ee7904a410968, "order" to schema_42146530bc4d74c4, "projectLimit" to schema_85b777c0c99bbbca, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e3a19fb856f8915: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e8c2bfac4c6fcc6: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ea95607826c2d23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("content", "kind"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "kind" to schema_3ad514880db80c82), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
