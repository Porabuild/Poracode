// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_11ada4e73a793b0d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("ambiguous"), JsonPrimitive("skipped_no_turns"), JsonPrimitive("skipped_missing_checkpoint")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_11da754926e41b05: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("append")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_11e04e93bdeaf95b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "agentAccess", "device", "expiresAt", "generation", "id", "threadId", "version"), properties = mapOf("access" to schema_9ca4aec6d46ade2e, "agentAccess" to schema_e6bc2fd97be6dec8, "device" to schema_4b43828b172de36c, "expiresAt" to schema_80c415b6e27c6ebd, "generation" to schema_d855999aed5e6438, "id" to schema_d855999aed5e6438, "threadId" to schema_36fea325bf1aca70, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_11f20430355ec49c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "deletions", "headBranch", "pr", "repository", "reviewRequested"), properties = mapOf("additions" to schema_3d06117798bf5171, "author" to schema_a99c73e81a312991, "deletions" to schema_3d06117798bf5171, "headBranch" to schema_bf0b727f7b1c6d07, "labels" to schema_0e31d5342d99e6b9, "pr" to schema_ea7fc856bb9aa12e, "repository" to schema_bf0b727f7b1c6d07, "reviewRequested" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_12344c6d82d54c6d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_938414fbfa27a773, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_12ca2594dca47145: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_15838a9e80c7867f, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_12f751ee47b47fbd: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_a467b0ed1c0ea208, schema_ac7865b2a567eb07, schema_d1c4cb16ae4c331e, schema_84ccfb83d8334510, schema_0a49efe270718ab9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_13324e3fec19e623: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("location", "manifestPath"), properties = mapOf("includeAgentChats" to schema_feeb8bb50144d96d, "location" to schema_080f9cc154af9e27, "manifestPath" to schema_36fea325bf1aca70, "transcriptDir" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_135288c0feeec2fc: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 16, items = schema_a76106fec07f8e2b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_135f7ef79d6fe306: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(3.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1371f7bedcffbc2e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_ab5271048956dc05), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_137445efd1582c7a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_66504fdb436f3b0e, schema_8b72b09d5cbe1e7f, schema_8850f6c7f12f8eb8), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_137e14636e0bc235: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_7eb7e8f44a304273, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1399799a226dcc71: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_00b1d6328e3a57b5, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_13f43aaaf56911fa: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser"), JsonPrimitive("crossagents"), JsonPrimitive("chrome"), JsonPrimitive("computer-use"), JsonPrimitive("app-controls")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_14221269d858a2f5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("key")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_14377f176c4dfd2a: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 500, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_1468dfe9a2db9c9d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("acknowledgedCount", "firstAcknowledgedAt", "kind", "lastAcknowledgedAt", "reason", "refusedBytes", "refusedEvents", "source"), properties = mapOf("acknowledgedCount" to schema_23e05d248383ea40, "firstAcknowledgedAt" to schema_56aa0e45cbdce0d0, "kind" to schema_f8afe6df005d2978, "lastAcknowledgedAt" to schema_56aa0e45cbdce0d0, "reason" to schema_9780f521bc1dee38, "refusedBytes" to schema_56aa0e45cbdce0d0, "refusedEvents" to schema_56aa0e45cbdce0d0, "source" to schema_77a7dec7edfc464f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_149c9d9dd2191aa3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environmentId"), properties = mapOf("environmentId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_14ac0689f2cc3ba8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts", "aiActions", "availableAccounts", "device", "generatedAt", "identity", "insights", "mcps", "models", "modes", "promptHeatmap", "providers", "scope", "skills", "timezoneOffsetMinutes", "totals"), properties = mapOf("accounts" to schema_195974ed118a4217, "aiActions" to schema_62392c6d6ccb4368, "availableAccounts" to schema_2c4b8c74e6940159, "device" to schema_26f96950d20651b3, "generatedAt" to schema_3d06117798bf5171, "identity" to schema_da76232259cbe6bb, "insights" to schema_d1beee40ea84d2e9, "mcps" to schema_8c71be0e7fdf9e1a, "models" to schema_195974ed118a4217, "modes" to schema_195974ed118a4217, "promptHeatmap" to schema_c1094a243b47f83c, "providers" to schema_195974ed118a4217, "scope" to schema_b99ee3af304513c2, "skills" to schema_8c71be0e7fdf9e1a, "timezoneOffsetMinutes" to schema_3d06117798bf5171, "totals" to schema_22f3597ef077b931), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_14ca57bfe938f3d4: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_9eaa25e68d8e4cf4, schema_107db71e1696908a, schema_1709690cf0edf961, schema_2b7b34c95b23bb0d, schema_0e8f58f429bb1135, schema_d550ef9994fd388f, schema_838adcbcaff5f551, schema_5af10e67b405a136, schema_3f58316dbb160752, schema_d2299af726097d6c, schema_93bef3a552bf787e), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_14f3c332d545bff0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("applicationId", "type"), properties = mapOf("applicationId" to schema_bab85ee50a59610a, "type" to schema_bd9ee7d62499d1b2), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_14f6b52f84064da4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "createdAt", "enabled", "id", "lastCompletedAt", "lastError", "lastResult", "lastRunAt", "lastStatus", "name", "nextRunAt", "prompt", "recurrence", "updatedAt"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "automation" to schema_fdddba9ec6ce269e, "config" to schema_f69100925fc0e774, "createdAt" to schema_38adcf16c79023ce, "enabled" to schema_feeb8bb50144d96d, "id" to schema_d855999aed5e6438, "iterationCount" to schema_56aa0e45cbdce0d0, "lastCompletedAt" to schema_595da89b21b7ca56, "lastError" to schema_2d0b6ec9f2b2decf, "lastResult" to schema_2d0b6ec9f2b2decf, "lastRunAt" to schema_595da89b21b7ca56, "lastStatus" to schema_aa5449703b29a615, "name" to schema_b89c357946c21293, "nextRunAt" to schema_595da89b21b7ca56, "projectId" to schema_2d0b6ec9f2b2decf, "prompt" to schema_30cc89214bd9dffb, "recurrence" to schema_12f751ee47b47fbd, "updatedAt" to schema_38adcf16c79023ce), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_150828825a4ec4d6: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_95bca512ea5c155a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_15179deb98a23815: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("payload", "requestId", "requestType", "threadId", "type"), properties = mapOf("payload" to schema_fd95a83e5b156564, "requestId" to schema_bf0b727f7b1c6d07, "requestType" to schema_c733570a5a247812, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_fcb2eed91b3e89ce), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
