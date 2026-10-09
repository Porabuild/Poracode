// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_4348fdb13264571d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "queued"), properties = mapOf("active" to schema_56aa0e45cbdce0d0, "queued" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43639d56ca3f1150: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "status"), properties = mapOf("message" to schema_36fea325bf1aca70, "status" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_437e2d5d20b6b495: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checks"), properties = mapOf("checks" to schema_3c115ff749c28304), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4392338ffc80bed7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_a399fbc7541223f3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43d29f1d5a2e1f23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_2d862d697d08c085), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_441bce375b64f3d0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_442f4438e0362260: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("replace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4492692f82322049: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("failedOnly" to schema_f8b6dd8128e8bfe0, "ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_452c70feefa496c6: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_a4457c545e0e0489, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_452e07a326fbbba7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("family-member")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_458a4508393abce2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "current"), properties = mapOf("branches" to schema_6b97469fe43177d6, "current" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45d8e163d2ea2910: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fingerprint", "keyType"), properties = mapOf("fingerprint" to schema_d3359b6d5db5b90d, "keyType" to schema_7d62681c6488867d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4655073d71f8e50b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_c533fb875972ec60, "id" to schema_36fea325bf1aca70, "type" to schema_07971608588bb2db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4659e6d395f41e16: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("bounded-v1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4666c29660989480: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_56aa0e45cbdce0d0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_468209f9bb01c8a9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_4cb4c9750289b975, "name" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_473e9b7f4728cf72: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_feeb8bb50144d96d, "terminal" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_475f91db7d51b153: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("weekly")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47a6c9970249e96b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "path", "projectLocation"), properties = mapOf("access" to schema_8423ce6905ffd393, "path" to schema_bd85a52dd25effae, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47c3f1ae81cfac00: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("nextParentPath" to schema_38d1a07d3b9b1c82, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47c50d7349a5a322: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 23.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47e02a8368712956: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-state")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47eb55b96bbf5d77: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("contextSize" to schema_0f732b9fceb2c6ac, "effort" to schema_0f732b9fceb2c6ac, "fast" to schema_3c40bff8b05543d7, "thinking" to schema_3c40bff8b05543d7), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_47fd370c6dedf4fa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status"), properties = mapOf("status" to schema_32773ce5899289ad), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_482895ec9172a79a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "parentLocation", "source"), properties = mapOf("name" to schema_36fea325bf1aca70, "parentLocation" to schema_080f9cc154af9e27, "source" to schema_76b2c94b29aad9b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_483d5aa44fc0eaba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_c39ba2db208f4f7c, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_485fa06696a88681: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4864c5f65afc8a79: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commitsAhead", "sourceAhead", "sourceBranch"), properties = mapOf("commitsAhead" to schema_3d06117798bf5171, "sourceAhead" to schema_3d06117798bf5171, "sourceBranch" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4878a3657a97dce6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("role"), properties = mapOf("role" to schema_7e386bfca48a8819, "text" to schema_bf0b727f7b1c6d07, "timestamp" to schema_bf0b727f7b1c6d07, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4886facc92937666: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("notice")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48de96c42130e156: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_82e8027595898a28, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48ed3fa6cae99861: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prs"), properties = mapOf("prs" to schema_0660587dd1508064), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49162371ff415b49: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("steer"), JsonPrimitive("queue")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_499c88c1c549e934: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(0.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49f72e8cc565067e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-worktree")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a10e57442c165ec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("changesTransferred" to schema_feeb8bb50144d96d, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a22ffc9b41926c0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("nextName", "path", "projectLocation"), properties = mapOf("nextName" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a927b60e49ddae0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pairing"), properties = mapOf("pairing" to schema_3f3680e5774b47dd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4bb9a58c89dd8a3b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "connectionId", "offerSdp", "threadId"), properties = mapOf("config" to schema_c721e8abc0a20d4a, "connectionId" to schema_d855999aed5e6438, "offerSdp" to schema_e78ddc126c04f09d, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c1171296b6868a1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "state", "streams", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "state" to schema_2472eab79ad4b307, "streams" to schema_e51d77fd6734b53a, "type" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c20b501501c0ba4: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_df96bd315b4c0dae, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c858ee6a42cac59: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_5a8fe22d39b2c89d, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_4d34acc64dd77a5d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("probe")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4d5989d27d26b612: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4dea101cb65656f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "marketplace", "name", "official", "rank", "skillId", "source"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "installs" to schema_56aa0e45cbdce0d0, "marketplace" to schema_118f67a0fa6bb27d, "name" to schema_36fea325bf1aca70, "official" to schema_feeb8bb50144d96d, "rank" to schema_23e05d248383ea40, "securityGrade" to schema_e987f23b082616d2, "securityScore" to schema_a581e67cd137ad59, "skillId" to schema_36fea325bf1aca70, "source" to schema_36fea325bf1aca70, "sourcePath" to schema_36fea325bf1aca70, "sourceRef" to schema_36fea325bf1aca70, "sourceUrl" to schema_6bb6e13415c8cbba, "stars" to schema_56aa0e45cbdce0d0, "updatedAt" to schema_36fea325bf1aca70, "votes" to schema_56aa0e45cbdce0d0, "weeklyInstalls" to schema_4666c29660989480), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4df989d5459165c8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_56a9bf5bf312d537, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5296d6b04d46b630: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4c967d4ed16edbc1, schema_e0da1e0a5e3cd077, schema_a66324f9a46c480b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53996e5a27a5b0c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format = "uuid", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("push.routing.client-connection-id.lowercase"))
}

internal val schema_53ceafeed27db1df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("archive")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53e4143ffe216d6e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_c721e8abc0a20d4a, "numTurns" to schema_56aa0e45cbdce0d0, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_55a090c12a60cd7e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d9ae4e225fe9170f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5646cf57ff3aebe0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("host", "login"), properties = mapOf("host" to schema_36fea325bf1aca70, "login" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_567aa4ef7f92d006: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("details"), properties = mapOf("details" to schema_9f1da8cf549c341e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_58c75b9ad5972758: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_40aab29508fb3256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58edfaf9f73b8db4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none"), JsonPrimitive("working"), JsonPrimitive("needs_approval"), JsonPrimitive("needs_reply"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58f9a3fda2694c76: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "hour", "label"), properties = mapOf("count" to schema_56aa0e45cbdce0d0, "hour" to schema_47c50d7349a5a322, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_591e7e71be40d4d4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_6b98eaede59b512a, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59599d21a24ed95c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("beforeId", "id", "threadId"), properties = mapOf("beforeId" to schema_df704162f3d15808, "id" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_595da89b21b7ca56: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_38adcf16c79023ce, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59cd628901920f3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agents", "title"), properties = mapOf("agents" to schema_cbad4936b49ad671, "detail" to schema_bf0b727f7b1c6d07, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a17efba356f5500: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("queued"), JsonPrimitive("running"), JsonPrimitive("done"), JsonPrimitive("failed"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a8fe22d39b2c89d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "freshness", "ref"), properties = mapOf("data" to schema_a4457c545e0e0489, "details" to schema_9f1da8cf549c341e, "diff" to schema_bf0b727f7b1c6d07, "files" to schema_0abd6180b71e8684, "freshness" to schema_0bd7710eac491f27, "ref" to schema_255898614500bbb9, "reviewThreads" to schema_5de54f0b1df69cc9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5aa9e435f68d585e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("summary"), JsonPrimitive("transcript")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5af10e67b405a136: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "type" to schema_af6b6f72d4304b97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5bb2b4a4a0c3c485: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5cb704413fbdf0b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message"), properties = mapOf("authScheme" to schema_2d52ff1140653b18, "code" to schema_2fb9be13c54e7688, "message" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ce0ae73fb12b141: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"), properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "commitGenSelection" to schema_32c3720f649f40a1, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "conflictResolverSelection" to schema_32c3720f649f40a1, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_65899fb957cb9421, "enabledMcpServers" to schema_2d677fb04187d46b, "experimentJudgeSelection" to schema_32c3720f649f40a1, "followUpBehavior" to schema_6fcb1a55c059e655, "hiddenModels" to schema_86d5d72e84423420, "prAutomationDefault" to schema_6df05d56a8273d4c, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "titleGenSelection" to schema_32c3720f649f40a1, "usage" to schema_18dc352c9a615faa, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslCommitGenSelection" to schema_32c3720f649f40a1, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverSelection" to schema_32c3720f649f40a1, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenSelection" to schema_32c3720f649f40a1, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
