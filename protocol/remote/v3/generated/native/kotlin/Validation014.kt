// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_fa4a387c10f5125f: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, pattern = "^[a-z0-9][a-z0-9_\\-:.]*$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fa6200026d51830f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_de21ef9b8d9f6aad, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_fc49e8b0b6ac2911: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "threadId", "worktreeBranch", "worktreeOwnerToken", "worktreeState"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "agentLabel" to schema_36fea325bf1aca70, "effort" to schema_36fea325bf1aca70, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_36fea325bf1aca70, "worktreeOwnerToken" to schema_8e43cad70cd70de7, "worktreePath" to schema_36fea325bf1aca70, "worktreeState" to schema_a8b4490d4a4f6745), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc779c522d442c13: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("target")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc86f743e97b3bb4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("settings"), properties = mapOf("settings" to schema_487e00940a36735a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_fddc83889925e752: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("created" to schema_feeb8bb50144d96d, "ok" to schema_d2dd3595e1b5e5dc, "project" to schema_b23c12daec7b7521), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_ffd105e9cca567eb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("history"), properties = mapOf("history" to schema_6227384f8fe3c509), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ffdf9008e6986c48: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_fed486f9f6e73521, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
