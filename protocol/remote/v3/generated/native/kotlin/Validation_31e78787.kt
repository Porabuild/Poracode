// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_1b5ac9c6b0c4832b: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_2f2654f61b052491, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1b6b610bba2774d6: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 16384.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1b7f16955dbf0b33: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("state"), properties = mapOf("state" to schema_ecc6edb6166acda9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1be16061d2974772: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 65536, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1be1630ac362ee37: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("bindings", "label", "members", "model", "selectors"), properties = mapOf("bindings" to schema_369773f70316d070, "label" to schema_36fea325bf1aca70, "members" to schema_fe8cce293da1b3f5, "model" to schema_36fea325bf1aca70, "redundantValues" to schema_47eb55b96bbf5d77, "selectors" to schema_36ebafd43b47829a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1be5ac91cc4357cb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseBranch", "baseCommit", "candidates", "createdAt", "id", "projectId", "prompt", "status", "title", "updatedAt"), properties = mapOf("baseBranch" to schema_36fea325bf1aca70, "baseCommit" to schema_bb2e0e6d90c93ccf, "candidates" to schema_6c24d6b835735b69, "createdAt" to schema_36fea325bf1aca70, "crown" to schema_208e24a5c5aa618a, "id" to schema_36fea325bf1aca70, "projectId" to schema_36fea325bf1aca70, "prompt" to schema_7f6bd58bd8881ec0, "segments" to schema_4392338ffc80bed7, "status" to schema_c5efb303b347362f, "title" to schema_36fea325bf1aca70, "updatedAt" to schema_36fea325bf1aca70, "winnerThreadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1c2823e73ee0c1dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("owner", "platform", "repo", "url"), properties = mapOf("owner" to schema_bf0b727f7b1c6d07, "platform" to schema_9358a37bbc89d2ef, "repo" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1c58197f2405018b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("isDraft", "number", "state", "title", "url"), properties = mapOf("checksStatus" to schema_bf0b727f7b1c6d07, "isDraft" to schema_feeb8bb50144d96d, "number" to schema_3d06117798bf5171, "state" to schema_79fd49e14d0e7e17, "title" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1c60a16c12c10c8f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("forgeAccount", "forgeRepository", "prNumber", "projectLocation"), properties = mapOf("forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1d261f6c634ca0b3: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_423ec18ef5ab4596, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1d53b68fd3881a00: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_85cd2a40f756baae, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1d58a09e28f725df: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 4096, pattern = "^ui:\\/\\/.*", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1d8def7ed78e9628: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4878a3657a97dce6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1da6db5f13bd36e1: RemoteSchema by lazy {
    RemoteSchema(type = "integer", defaultValue = JsonPrimitive(30000), maximum = 9007199254740991.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1dff9447e3354b05: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("exponential")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1e25c599a64f5b9d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("source", "status", "toolName", "updatedAt", "version"), properties = mapOf("capturedAt" to schema_80c415b6e27c6ebd, "image" to schema_c1862c8cf975e3dc, "source" to schema_9addfc34d28f29dc, "status" to schema_cf7eae9345350df4, "streamVersion" to schema_7f9f5a0d72de0d9a, "target" to schema_bf0b727f7b1c6d07, "toolName" to schema_bf0b727f7b1c6d07, "updatedAt" to schema_80c415b6e27c6ebd, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1e3c3dda8e348c4b: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_c18ccc2aa36fdad0, schema_7053ed3816efd9d2), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1e591a20b9e55743: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d855999aed5e6438, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1eaf563a1e9fa631: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("rank"), JsonPrimitive("stars"), JsonPrimitive("recent"), JsonPrimitive("votes")), defaultValue = JsonPrimitive("rank"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f06d1e58958e5d9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "source", "threadId"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "modelLabel" to schema_ca3d163bab055381, "rationale" to schema_ca3d163bab055381, "snapshotHash" to schema_36fea325bf1aca70, "source" to schema_6a2600edfb55d776, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f21330aa47e4036: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f4518886240126e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("create")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f6ff7bae56a790b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("host"), JsonPrimitive("wsl")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f8c0bbd106d043e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedTurnsNextCursor", "reads", "turns"), properties = mapOf("completedTurnsNextCursor" to schema_df704162f3d15808, "reads" to schema_4659e6d395f41e16, "turns" to schema_4c20b501501c0ba4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fa1b7f79d80e44d: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 5.0, maximum = 200.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fb6f9ae5f6d1a02: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("state"), properties = mapOf("state" to schema_7ee0d4255fd8c330), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_1fbc0e0d793ae9f1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("context.updated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fc25f3569e514e5: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_dba220fea45f4f88, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fcbd5bc41d865ae: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("commit")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_203e1407dc2d843e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_09b66dd237e8c823, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2062bc5ac9057c02: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "placement", "projectId", "targetThreadId", "threadIds"), properties = mapOf("kind" to schema_701d7d6274e152f6, "placement" to schema_3512bd687eb85e90, "projectId" to schema_36fea325bf1aca70, "targetThreadId" to schema_36fea325bf1aca70, "threadIds" to schema_0c6254245418ba4c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_208e24a5c5aa618a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_2fc59eb755b48806, schema_1f06d1e58958e5d9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_20b48750f1f97bcf: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_bb3cd72cf9e1b0cc, schema_560a7abcaf51999f, schema_2798cb9d2dca7539, schema_f2e3da83f3088e10, schema_3ac3526f6a2607f3), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_20b56c9f2266c25a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_962b214fbc91a2f5, schema_0463d43632698ad7), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_20d706a189398fff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_4d34acc64dd77a5d, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_20d7b1e748f886c3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fetchedAt", "providerId", "status", "windows"), properties = mapOf("authenticatedAs" to schema_bf0b727f7b1c6d07, "cost" to schema_4147389dac614b3a, "credits" to schema_a39dd0410456fe31, "error" to schema_bf0b727f7b1c6d07, "fetchedAt" to schema_56aa0e45cbdce0d0, "plan" to schema_bf0b727f7b1c6d07, "providerId" to schema_bf0b727f7b1c6d07, "rateLimitedUntil" to schema_56aa0e45cbdce0d0, "status" to schema_3466b9b69cc5e0cc, "tokens" to schema_36a14ea6cf3d0316, "windows" to schema_d59f3565f41b247f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2127b6212a816df5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("error"), JsonPrimitive("restart")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_212ab189f2321de4: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2130fba9cf5ae781: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("delaySeconds", "kind", "maxAttempts"), properties = mapOf("delaySeconds" to schema_e9f57f9b4751d6e1, "kind" to schema_82e9f889c9c5a99f, "maxAttempts" to schema_f7164d030c9bbeaf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_214ae58e6e08f2d4: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1468dfe9a2db9c9d, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2151c8edcffb30bf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("waiting-for-approval"), JsonPrimitive("succeeded"), JsonPrimitive("failed"), JsonPrimitive("cancelled"), JsonPrimitive("interrupted"), JsonPrimitive("skipped")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2197834f1e6c8426: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "state"), properties = mapOf("forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "state" to schema_ef49c6f9f5f7ce2b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_21c479c8dedbe09d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("checking")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_21cd039cb32b3851: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("groupId" to schema_36fea325bf1aca70, "groupName" to schema_36fea325bf1aca70, "kind" to schema_f399af5f8dcf6035), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_225e53f995988ddf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-unwatch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_228757711c5e4b37: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId"), properties = mapOf("itemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_22c1b4b934fdb197: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ipc"), JsonPrimitive("loopback")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_22c8bcdab9edbc02: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_41be750b567a2144, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_22f14841c064490b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accessToken", "expiresAt", "scopes", "tokenType"), properties = mapOf("accessToken" to schema_36fea325bf1aca70, "expiresAt" to schema_36fea325bf1aca70, "refreshToken" to schema_36fea325bf1aca70, "refreshTokenExpiresAt" to schema_36fea325bf1aca70, "scopes" to schema_515482d2104d1efa, "sessionId" to schema_36fea325bf1aca70, "tokenType" to schema_7c8fd050dd5e98a8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_22f3597ef077b931: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeDays", "currentStreakDays", "goalsSet", "longestStreakDays", "longestTaskMs", "messagesSent", "totalPrompts", "totalThreads"), properties = mapOf("activeDays" to schema_56aa0e45cbdce0d0, "currentStreakDays" to schema_56aa0e45cbdce0d0, "goalsSet" to schema_56aa0e45cbdce0d0, "longestStreakDays" to schema_56aa0e45cbdce0d0, "longestTaskMs" to schema_56aa0e45cbdce0d0, "messagesSent" to schema_56aa0e45cbdce0d0, "totalPrompts" to schema_56aa0e45cbdce0d0, "totalThreads" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_22fb635ee9412c65: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectId"), properties = mapOf("prNumber" to schema_f58a8b771657d037, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2351864622b834c7: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_c1f4a31c98798d12, schema_c24d062f64579ed9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
