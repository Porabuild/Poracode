// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_f156a9bc12c3639a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("exited")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1666190cd652261: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 500, items = schema_ad1d9fe8b3eda038, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1a8832c8ce43a2f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4e1c353012bcb7ec, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1c1581e1729d48e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("event", "seq", "type"), properties = mapOf("event" to schema_ca3d163bab055381, "seq" to schema_23e05d248383ea40, "space" to schema_22c1b4b934fdb197, "type" to schema_829c74ec0aec2226), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1ccd99fb2bc2c2f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("android-uiautomator-xml"), JsonPrimitive("ios-idb-json")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1deff8504bbc0a3: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f22a438b8392693b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "threadId"), properties = mapOf("name" to schema_9bc1c08248602f5c, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f249cae06596abcd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "position", "text"), properties = mapOf("itemId" to schema_36fea325bf1aca70, "position" to schema_56aa0e45cbdce0d0, "text" to schema_b202a6626ea9d1ee), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f252df24b49da178: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("current", "outcome"), properties = mapOf("current" to schema_f550638b8241897c, "outcome" to schema_41148a177ba98c21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f26d9689fe341b94: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_515482d2104d1efa, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2b9759b60404656: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("force" to schema_feeb8bb50144d96d, "providerIds" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2bb61aa3bb8d258: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label", "optionId"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "optionId" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2d54b0f9e07d90a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("old"), JsonPrimitive("new")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2e3da83f3088e10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_04569d9eea76ae2b, "result" to schema_51cc694dc5da9f2a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f30731ffd8c57b5c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("content.delta")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f34e1c0e37ed0c00: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "projectLocation"), properties = mapOf("addAll" to schema_f8b6dd8128e8bfe0, "message" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "reapplyStashCommit" to schema_bb2e0e6d90c93ccf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f355c9e66a3091a2: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f399af5f8dcf6035: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-group")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f3c2d2c49187a75b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "objective"), properties = mapOf("action" to schema_10209383e3295873, "objective" to schema_422b1e8c8be5e2c0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f3d89ffd4842a73f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b92447920382853b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f450768848c5befd: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("boolean"), JsonPrimitive("choice"), JsonPrimitive("environment"), JsonPrimitive("number"), JsonPrimitive("string")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f46da48437a0c164: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0465e7aaae9c70d7, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f4812bd0938d0d6b: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1d3e5368baf49e21, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f4cab1817a71aa36: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skills")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f4e43b71651c06ad: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 32, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f550638b8241897c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_c66f09c6212330ba, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f58a8b771657d037: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f614b14ae0e3bbca: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("actionId", "payload", "threadId"), properties = mapOf("actionId" to schema_f355c9e66a3091a2, "payload" to schema_e6958017dac6cd3b, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f67f6cbe63879b24: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("v1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f69100925fc0e774: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_f696f11685898ba7: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6983a322fa14ff5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "projectLocation"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6a941e10f9feb27: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^codex:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6c555fb5f1777c9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("observed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6dd22a2a9de3244: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("camera"), JsonPrimitive("microphone"), JsonPrimitive("photos"), JsonPrimitive("contacts"), JsonPrimitive("calendar"), JsonPrimitive("location"), JsonPrimitive("notifications"), JsonPrimitive("motion")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7164d030c9bbeaf: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 2.0, maximum = 6.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f71a677b4df4bd5e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("groups"), properties = mapOf("groups" to schema_f3d89ffd4842a73f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f75d628126272292: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_98473b8b464036a4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f76e77baaeec46d5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("utcOffsetMinutes"), properties = mapOf("deviceId" to schema_bf0b727f7b1c6d07, "provider" to schema_bf0b727f7b1c6d07, "scope" to schema_b99ee3af304513c2, "utcOffsetMinutes" to schema_80c415b6e27c6ebd, "window" to schema_ae26bc52b712b00c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7b2db2c4c7fbdd3: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_384bb6ef598ad698, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7ecfe1017b42566: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 300, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f802abb4a32bbf85: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent-vision-unwatch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f80bf20556c43632: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("admitted", "cancellations", "long", "queueFullRefusals", "short", "waitTimeoutRefusals"), properties = mapOf("admitted" to schema_56aa0e45cbdce0d0, "cancellations" to schema_56aa0e45cbdce0d0, "environments" to schema_2f4c1755c2d3a402, "long" to schema_164937b9a51028fa, "queueFullRefusals" to schema_56aa0e45cbdce0d0, "short" to schema_164937b9a51028fa, "slowFetches" to schema_56aa0e45cbdce0d0, "waitTimeoutRefusals" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f82c2aa6f629e6fe: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects"), properties = mapOf("created" to schema_feeb8bb50144d96d, "project" to schema_37cd292a9ef1a3c6, "projects" to schema_9e0169cfe7876c1e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f86171557f2ff456: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_11f20430355ec49c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f87159e7882b195f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("settings"), properties = mapOf("settings" to schema_5a8607ab9974cf4e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f8afe6df005d2978: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("history-incomplete")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f8b6dd8128e8bfe0: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", defaultValue = JsonPrimitive(false), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f8ba039a2f32fad1: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(2.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f8fde013f784c33d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "id", "language", "model"), properties = mapOf("action" to schema_d6b726f850f5dc81, "id" to schema_d855999aed5e6438, "language" to schema_f4e43b71651c06ad, "model" to schema_8e43cad70cd70de7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f92ad486eceff5e1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_8345d2f810cef034, schema_89bc4017c2e23cd6, schema_a087b069daed224f), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f958c6e1fa6d616c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("canLinkToGlobal", "effectiveSkillIds", "invocation", "issues", "skills"), properties = mapOf("canLinkToGlobal" to schema_feeb8bb50144d96d, "effectiveSkillIds" to schema_0f732b9fceb2c6ac, "invocation" to schema_7a20e2f82d6f16d6, "issues" to schema_ee5346688873f70f, "skills" to schema_4df989d5459165c8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f97770a7e3ba8e29: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("account", "kind", "nameWithOwner"), properties = mapOf("account" to schema_5646cf57ff3aebe0, "kind" to schema_cc1f68c41f086183, "nameWithOwner" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f983f1aded87bea9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("process", "remote"), properties = mapOf("hostResourceAdmission" to schema_710b6ecb781e06cd, "process" to schema_9f6e05a566c74be3, "remote" to schema_99cf08bb5da33962), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f9b76467f6b16682: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_3120d80990432c9a, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_f9c97c26b130e744: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("activeTab" to schema_8c20a3e2d150dfcf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f9da03570b6c69fa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentCount", "phases", "runId", "status", "unphasedAgents"), properties = mapOf("agentCount" to schema_56aa0e45cbdce0d0, "defaultModel" to schema_bf0b727f7b1c6d07, "durationMs" to schema_56aa0e45cbdce0d0, "phases" to schema_fae23683c505297d, "runId" to schema_36fea325bf1aca70, "scriptPath" to schema_bf0b727f7b1c6d07, "startTime" to schema_3d06117798bf5171, "status" to schema_3a008e3c404a93c8, "summary" to schema_bf0b727f7b1c6d07, "taskId" to schema_bf0b727f7b1c6d07, "totalTokens" to schema_56aa0e45cbdce0d0, "totalToolCalls" to schema_56aa0e45cbdce0d0, "unphasedAgents" to schema_cbad4936b49ad671, "workflowName" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f9e7f90793023053: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 100.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fa41f0033e95da89: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("distro", "kind", "linuxPath", "uncPath"), properties = mapOf("distro" to schema_36fea325bf1aca70, "kind" to schema_2d8274eae552cc51, "linuxPath" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70, "uncPath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fa4a387c10f5125f: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, pattern = "^[a-z0-9][a-z0-9_\\-:.]*$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fae23683c505297d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_59cd628901920f3f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fb0686e874c29254: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "baseBranch", "body", "changedFiles", "checks", "comments", "commits", "deletions", "headBranch", "number", "reviews", "title"), properties = mapOf("additions" to schema_3d06117798bf5171, "author" to schema_a99c73e81a312991, "baseBranch" to schema_bf0b727f7b1c6d07, "body" to schema_bf0b727f7b1c6d07, "changedFiles" to schema_3d06117798bf5171, "checks" to schema_3c115ff749c28304, "closedAt" to schema_2d0b6ec9f2b2decf, "comments" to schema_ac3d09b5c7f361d2, "commits" to schema_19cc91cdde8419f3, "createdAt" to schema_bf0b727f7b1c6d07, "deletions" to schema_3d06117798bf5171, "headBranch" to schema_bf0b727f7b1c6d07, "labels" to schema_0e31d5342d99e6b9, "mergedAt" to schema_2d0b6ec9f2b2decf, "mergedBy" to schema_da37aeddd0e606ac, "number" to schema_23e05d248383ea40, "reactions" to schema_45e52f032f196485, "requestedReviewers" to schema_1d261f6c634ca0b3, "reviewThreads" to schema_7f88819389c3ccc9, "reviews" to schema_1fc25f3569e514e5, "source" to schema_2e68c47efd6e1f9c, "timeline" to schema_edf7721bcc428be5, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fb3dd6021c9a98a4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("default", "description", "env", "key", "label", "type"), properties = mapOf("default" to schema_feeb8bb50144d96d, "description" to schema_bf0b727f7b1c6d07, "env" to schema_e51d77fd6734b53a, "key" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "platforms" to schema_0f732b9fceb2c6ac, "type" to schema_e841af2cbd75708d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc24a3f2860a27ad: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4545388132b77b29, schema_e80087031872d26b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc3e1f61a45e621e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_da78bdce10e9cf0f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc49e8b0b6ac2911: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "threadId", "worktreeBranch", "worktreeOwnerToken", "worktreeState"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "agentLabel" to schema_36fea325bf1aca70, "effort" to schema_36fea325bf1aca70, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_36fea325bf1aca70, "worktreeOwnerToken" to schema_8e43cad70cd70de7, "worktreePath" to schema_36fea325bf1aca70, "worktreeState" to schema_a8b4490d4a4f6745), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc779c522d442c13: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("target")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc9d6f4c2617a24d: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_5d401c152e12e715, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fcb2eed91b3e89ce: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("request.opened")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fcec19cd11bed7c3: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_8457056778d19fdf, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd056ca894e30f21: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_bf0b727f7b1c6d07, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd20949193e6879d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("missing"), JsonPrimitive("installed"), JsonPrimitive("installing"), JsonPrimitive("unsupported"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd4fd2eb416ae002: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_d585eadabc094972), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_fd6258ac6546d705: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd8574a70c8187db: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("endpoint", "expirationTime", "keys"), properties = mapOf("endpoint" to schema_51e99f5d3372fb77, "expirationTime" to schema_60e901bdbc3f78cd, "keys" to schema_29fba8fe9f5724e0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd95a83e5b156564: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("summary"), properties = mapOf("details" to schema_ca3d163bab055381, "multiSelect" to schema_feeb8bb50144d96d, "options" to schema_302783bd5327b877, "summary" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fdad254a8bac8914: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_515482d2104d1efa, propertyNames = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fdddba9ec6ce269e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completionPolicy", "maxIterations", "maxRuntimeSeconds", "misfirePolicy", "mode", "retryPolicy", "stopOnError", "version"), properties = mapOf("completionPolicy" to schema_fc24a3f2860a27ad, "maxIterations" to schema_e82ae39cda9f878d, "maxRuntimeSeconds" to schema_4535713ebdcc5c37, "misfirePolicy" to schema_bb479bc5848b9f45, "mode" to schema_b588ef57ebadea7a, "retryPolicy" to schema_de13949691e24afd, "stopOnError" to schema_feeb8bb50144d96d, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("schedule.automation"))
}

internal val schema_fe73ac6ba621dd72: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version"), properties = mapOf("version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe7522595f5637c3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "itemType", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "itemType" to schema_5455d140717a50b3, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_441bce375b64f3d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe79d48b8af45e7d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ping")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe7aea0f55ed142e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8b1889f3513fe2b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe8cce293da1b3f5: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_413ace8627552254, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fece443c82df794e: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 30, items = schema_5894304151eb6a79, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fed486f9f6e73521: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_c6b76607f48c889e, schema_ca0c8b8a7fbb7b5d, schema_f04c7b0573aff59c, schema_eb2405f61baf028b, schema_ec76fa076d16485a, schema_d1df243f455504fc), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fee1e07039137fc5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_9bf3994f2546a7d6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_feeb8bb50144d96d: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_feff20c88bde0c4c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "value"), properties = mapOf("type" to schema_4311a74adde583c6, "value" to schema_d61b01c8cb5f5718), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_ff05783d57039aa1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user"), JsonPrimitive("assistant")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ff3b9b0284fcd244: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 320, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ff495aee3e719fab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("parentItemId", "threadId"), properties = mapOf("parentItemId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ff4e0a6efa5fd888: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("grant"), JsonPrimitive("revoke")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ffc64b31e09ad873: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("update-state")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ffdf9008e6986c48: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_fed486f9f6e73521, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fff3547caad99f85: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authState", "capabilities", "installed", "kind", "label"), properties = mapOf("acpSessionEstablished" to schema_feeb8bb50144d96d, "authLogoutSupported" to schema_feeb8bb50144d96d, "authMethods" to schema_cd0a57f27ae4fccb, "authState" to schema_2363c4dd0a78ce9d, "capabilities" to schema_e0845a6e4a3f765e, "envDistro" to schema_bf0b727f7b1c6d07, "envKind" to schema_9eed5c4959909cfe, "executablePath" to schema_bf0b727f7b1c6d07, "icon" to schema_bf0b727f7b1c6d07, "installed" to schema_feeb8bb50144d96d, "kind" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "loginCommand" to schema_36fea325bf1aca70, "loginCommandDisplay" to schema_36fea325bf1aca70, "preferTerminalLogin" to schema_feeb8bb50144d96d, "presentationAuthStates" to schema_678d084ee287670a, "presentationAuthUsesProviderLogin" to schema_473e9b7f4728cf72, "providerMetadata" to schema_197c2b8c01d7f4ed, "runtimeVariants" to schema_9ced215a757add76, "sessionRuntimeRouting" to schema_d221b1853eb0ef37, "update" to schema_892eceb2acf00deb, "version" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
