// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_e6da2ef0eeb6a138: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "baseBranch", "branch", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "baseBranch" to schema_36fea325bf1aca70, "branch" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e761211b82c40573: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("servers"), properties = mapOf("servers" to schema_dc97711e2c23c867), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e78ddc126c04f09d: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 64000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e7c244bd461f7229: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_93ea7778107ef974, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e7cab2d2c052144f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_4d5989d27d26b612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e80087031872d26b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("confidenceThreshold", "kind", "stopWhen"), properties = mapOf("confidenceThreshold" to schema_5d4b39004bf5c532, "kind" to schema_5bbcf9e4750fbaa3, "stopWhen" to schema_5c6957eaa59e2ae2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e82ae39cda9f878d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_f9e7f90793023053, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e841af2cbd75708d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("toggle")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e847e321fbb6435b: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e86709003d111155: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "prompt" to schema_bf0b727f7b1c6d07, "questionAnswer" to schema_a22ff042f4e542fc, "segments" to schema_4392338ffc80bed7, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e8dd61708d6e7a63: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_fae7eb18b0573204, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e8fbf0f2cbb425a8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_20d706a189398fff, schema_37eeca9f5377b6e4, schema_66021940878f3abc, schema_7a00457b3e3294c1, schema_81440643a0f1796d), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e96ebdc8b8af5200: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27, "rebase" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e987f23b082616d2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("A"), JsonPrimitive("B"), JsonPrimitive("C"), JsonPrimitive("D"), JsonPrimitive("F")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e9df8b4f3dcc8aae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("flowId"), properties = mapOf("flowId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e9e7b28a3dddd9fd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enabled", "id", "name", "timeoutMs", "transport"), properties = mapOf("enabled" to schema_feeb8bb50144d96d, "id" to schema_36fea325bf1aca70, "name" to schema_24a221c9609f967e, "timeoutMs" to schema_23e05d248383ea40, "transport" to schema_5296d6b04d46b630, "unsupportedReason" to schema_2556bf4896893601), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e9f57f9b4751d6e1: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 3600.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea08f63f22aa2011: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_3a38f5dc8038f065, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea193ab85993872c: RemoteSchema by lazy {
    RemoteSchema(type = "integer", defaultValue = JsonPrimitive(5), minimum = 2.0, maximum = 120.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea3d1d70c1876de4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("account", "runtime"), properties = mapOf("account" to schema_5646cf57ff3aebe0, "runtime" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea993e5b2d87f77f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("detected", "forwards"), properties = mapOf("detected" to schema_58c75b9ad5972758, "forwards" to schema_2c93150c89b253f9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaa8e54151cd7fc2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expiresAt", "ticket"), properties = mapOf("expiresAt" to schema_36fea325bf1aca70, "ticket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaed5114fa77917e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pinned")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaf8a91849801b20: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "modifiedAtMs" to schema_f696f11685898ba7, "status" to schema_949f0ec1c2b67829), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb12aad2875e1908: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb148d7195a1780a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("downloaded")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb2405f61baf028b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("bytesPerSecond", "percent", "total", "transferred", "type"), properties = mapOf("bytesPerSecond" to schema_80c415b6e27c6ebd, "percent" to schema_80c415b6e27c6ebd, "total" to schema_80c415b6e27c6ebd, "transferred" to schema_80c415b6e27c6ebd, "type" to schema_bd136ee4bcce8b07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb2798e2ccc8bf65: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_5646cf57ff3aebe0, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb5b966723ac7023: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("agentKind" to schema_36fea325bf1aca70, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ebd70a208b453fe1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "starred"), properties = mapOf("kind" to schema_833ef472e7760fae, "starred" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ebfa6f1c64210a5f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId", "workspaceId"), properties = mapOf("kind" to schema_96cd458fa9bae303, "projectId" to schema_36fea325bf1aca70, "workspaceId" to schema_df704162f3d15808), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ec221fdc1494d0b1: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[a-f0-9]{64}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ec438f4fd047a2a3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ec76fa076d16485a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "version"), properties = mapOf("type" to schema_eb148d7195a1780a, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecbd7591c9493c90: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("diff"), properties = mapOf("diff" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecc6edb6166acda9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeTabId", "tabs"), properties = mapOf("activeTabId" to schema_2d0b6ec9f2b2decf, "tabs" to schema_bf3a4ed0e5798352), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecde1f3c1f09bdc0: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_1fb6f9ae5f6d1a02, schema_6f5cce5ce127f97f, schema_e213e5cbde87bf9f), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecf46d016507c672: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("BEHIND"), JsonPrimitive("BLOCKED"), JsonPrimitive("CLEAN"), JsonPrimitive("DIRTY"), JsonPrimitive("DRAFT"), JsonPrimitive("HAS_HOOKS"), JsonPrimitive("UNKNOWN"), JsonPrimitive("UNSTABLE")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ed1865d937c91a50: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("move-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ed3d9773342dac2c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries"), properties = mapOf("entries" to schema_bdb4eecbb625c500), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee4a36083d770366: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "prompt", "stagedAt"), properties = mapOf("id" to schema_36fea325bf1aca70, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "stagedAt" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee5346688873f70f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_af9e7187ee39d2c1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee6af1c3c62ad32f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("slash"), JsonPrimitive("dollar"), JsonPrimitive("prompt"), JsonPrimitive("skill")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee8a6a87417deae2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok", "revision"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc, "revision" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eeb5c5f788e7f258: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filePath", "projectLocation", "staged"), properties = mapOf("filePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "staged" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ef917452dcccd356: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("tap")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efc124973b411d28: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("skipped_no_location"), JsonPrimitive("skipped_missing_checkpoint")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efd9410c7543c4c0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "placement", "projectId", "targetThreadId"), properties = mapOf("kind" to schema_8e7b4d097aa71417, "placement" to schema_3512bd687eb85e90, "projectId" to schema_36fea325bf1aca70, "targetThreadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efedb06a4d7088a5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "name", "options", "required", "type"), properties = mapOf("defaultValue" to schema_1994cc63e450a4bd, "description" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "options" to schema_0f732b9fceb2c6ac, "required" to schema_feeb8bb50144d96d, "type" to schema_f450768848c5befd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f04c7b0573aff59c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_5d5cc3aa0a1f3291), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f0c513c0146099c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("publicKey"), properties = mapOf("publicKey" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f145218b6dee66b6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message"), properties = mapOf("authScheme" to schema_2d52ff1140653b18, "code" to schema_e527c3ee29cd639b, "message" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

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

internal val schema_f22a438b8392693b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "threadId"), properties = mapOf("name" to schema_9bc1c08248602f5c, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f252df24b49da178: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("current", "outcome"), properties = mapOf("current" to schema_f550638b8241897c, "outcome" to schema_41148a177ba98c21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_f30afbf29e9d6e24: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "record", "threads"), properties = mapOf("kind" to schema_1f4518886240126e, "record" to schema_1be5ac91cc4357cb, "threads" to schema_4d7f9a55217d713f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_f4cab1817a71aa36: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skills")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_f7164d030c9bbeaf: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 2.0, maximum = 6.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f71a677b4df4bd5e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("groups"), properties = mapOf("groups" to schema_f3d89ffd4842a73f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f76e77baaeec46d5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("utcOffsetMinutes"), properties = mapOf("deviceId" to schema_bf0b727f7b1c6d07, "provider" to schema_bf0b727f7b1c6d07, "scope" to schema_b99ee3af304513c2, "utcOffsetMinutes" to schema_80c415b6e27c6ebd, "window" to schema_ae26bc52b712b00c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7a8f7639015cad8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "threadId", "type"), properties = mapOf("message" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7b2db2c4c7fbdd3: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_384bb6ef598ad698, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7ecfe1017b42566: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 300, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f806b382027c278d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_468209f9bb01c8a9, schema_2b7595c3da8bc0e9, schema_da66851500474562, schema_9bdd26dd832b19ef, schema_27aa97567424846c, schema_37addcca5b32752c, schema_580efa06e9547a64, schema_ebfa6f1c64210a5f, schema_45f6b50cb938a8c1), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f80bf20556c43632: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("admitted", "cancellations", "long", "queueFullRefusals", "short", "waitTimeoutRefusals"), properties = mapOf("admitted" to schema_56aa0e45cbdce0d0, "cancellations" to schema_56aa0e45cbdce0d0, "environments" to schema_2f4c1755c2d3a402, "long" to schema_164937b9a51028fa, "queueFullRefusals" to schema_56aa0e45cbdce0d0, "short" to schema_164937b9a51028fa, "slowFetches" to schema_56aa0e45cbdce0d0, "waitTimeoutRefusals" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f83001b0f92b1535: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects"), properties = mapOf("created" to schema_feeb8bb50144d96d, "project" to schema_3bac601a40e32bf3, "projects" to schema_45dc1a0b166d686a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_fae7eb18b0573204: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events", "seq"), properties = mapOf("events" to schema_d8a759ff11f9b49b, "seq" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fb3dd6021c9a98a4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("default", "description", "env", "key", "label", "type"), properties = mapOf("default" to schema_feeb8bb50144d96d, "description" to schema_bf0b727f7b1c6d07, "env" to schema_e51d77fd6734b53a, "key" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "platforms" to schema_0f732b9fceb2c6ac, "type" to schema_e841af2cbd75708d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc24a3f2860a27ad: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4545388132b77b29, schema_e80087031872d26b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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
