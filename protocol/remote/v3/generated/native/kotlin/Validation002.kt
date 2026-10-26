// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

internal val schema_13762c62f0c23527: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("seq", "type"), properties = mapOf("seq" to schema_56aa0e45cbdce0d0, "type" to schema_0200f968d21b338b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_1544bc59ff42b21c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("command", "id", "name"), properties = mapOf("command" to schema_36fea325bf1aca70, "icon" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_15838a9e80c7867f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("file")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_15cae388d0cdd5b6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("summary"), JsonPrimitive("full")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_160c1ab9b7f11a56: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "fingerprint", "model", "stops", "summary", "version"), properties = mapOf("createdAt" to schema_bf0b727f7b1c6d07, "fingerprint" to schema_36fea325bf1aca70, "model" to schema_bf0b727f7b1c6d07, "stops" to schema_b8f3bd9de101caa0, "summary" to schema_5c07f5964567e9f0, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1618be77eba1d732: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentSessions", "generationHelpers", "refusals", "terminalShells", "total"), properties = mapOf("agentSessions" to schema_402930e3e48d3bdd, "generationHelpers" to schema_402930e3e48d3bdd, "refusals" to schema_56aa0e45cbdce0d0, "terminalShells" to schema_402930e3e48d3bdd, "total" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1631cf63b0b9b49c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fingerprint", "forgeAccount", "forgeRepository", "path", "prNumber", "projectLocation"), properties = mapOf("fingerprint" to schema_7738b69937d794b0, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "path" to schema_bd85a52dd25effae, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_164937b9a51028fa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "limit", "maxActive", "queued"), properties = mapOf("active" to schema_56aa0e45cbdce0d0, "executionMs" to schema_f696f11685898ba7, "limit" to schema_f58a8b771657d037, "maxActive" to schema_56aa0e45cbdce0d0, "maxExecutionMs" to schema_f696f11685898ba7, "maxQueueWaitMs" to schema_f696f11685898ba7, "queueWaitMs" to schema_f696f11685898ba7, "queued" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1709690cf0edf961: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("id" to schema_36fea325bf1aca70, "sentAt" to schema_80c415b6e27c6ebd, "type" to schema_fe79d48b8af45e7d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_174f77d24d01fc57: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_7324613e41acced2, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_17b50a5a251b31ce: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("receivedAt", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "receivedAt" to schema_80c415b6e27c6ebd, "sentAt" to schema_80c415b6e27c6ebd, "type" to schema_d8768c073f68fc35), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_17c2b8a25332cd3a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("httpBaseUrl", "wsBaseUrl"), properties = mapOf("httpBaseUrl" to schema_6bb6e13415c8cbba, "wsBaseUrl" to schema_6bb6e13415c8cbba), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1806ffb1da5fcacb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "threadId", "title"), properties = mapOf("kind" to schema_0a08597c6c22cade, "threadId" to schema_36fea325bf1aca70, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_189279e83c3a2ce4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "prNumber", "projectLocation"), properties = mapOf("body" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_18a5d3fa6e42f4ef: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ref", "refreshedAt"), properties = mapOf("branches" to schema_458a4508393abce2, "ghAvailable" to schema_feeb8bb50144d96d, "ref" to schema_83470ce63973b6e2, "refreshedAt" to schema_bf0b727f7b1c6d07, "status" to schema_c1d4a9f752e166b1, "worktrees" to schema_cd357f47aa772b6a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_18b29df576abb2b9: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("setupScript" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_18dc352c9a615faa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoRefresh", "collapsedProviders", "disabledProviders", "providerOrder", "providerRefreshIntervals", "refreshIntervalMinutes", "selectedRingGroups", "showEstimatedCost", "showInSidebar", "sidebarHiddenProviders"), properties = mapOf("autoRefresh" to schema_a6ba34cd39bf30c5, "collapsedProviders" to schema_aac2a4e83d2823be, "disabledProviders" to schema_aac2a4e83d2823be, "providerOrder" to schema_aac2a4e83d2823be, "providerRefreshIntervals" to schema_ea08f63f22aa2011, "refreshIntervalMinutes" to schema_ea193ab85993872c, "selectedRingGroups" to schema_c3ac2139868061bb, "showEstimatedCost" to schema_f8b6dd8128e8bfe0, "showInSidebar" to schema_a6ba34cd39bf30c5, "sidebarHiddenProviders" to schema_aac2a4e83d2823be), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_19030914d1c4d410: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("insert-text")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_191ccdb4e41abc75: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events", "seq"), properties = mapOf("events" to schema_6227384f8fe3c509, "seq" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_195974ed118a4217: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9fe1fe9bbcff3ecd, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_197c2b8c01d7f4ed: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("authMethod" to schema_36fea325bf1aca70, "authenticatedAs" to schema_36fea325bf1aca70, "connectedProviders" to schema_7fdc1b397391e8f3, "organization" to schema_36fea325bf1aca70, "plan" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1994cc63e450a4bd: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bf0b727f7b1c6d07, schema_80c415b6e27c6ebd, schema_feeb8bb50144d96d), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_19bc3ac82d723fad: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("serial"), properties = mapOf("serial" to schema_97d85a5eaee82b97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_19cc91cdde8419f3: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9edd0cfb1cd802d2, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1a0723da99007052: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("location")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1a5502ed59b02d53: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_cac3b973979876dd, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1aa020e871f1c07e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("event")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1ae7de2180f145f4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_03fdf2ff7afe440b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1b0d78a3430b7087: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("desktopId"), properties = mapOf("desktopId" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_1b2373270569d6e5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("statuses"), properties = mapOf("statuses" to schema_745963f66484f8a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1b3dc298a6f3cf15: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "tokens"), properties = mapOf("id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "tokens" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_1d8def7ed78e9628: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4878a3657a97dce6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1da6db5f13bd36e1: RemoteSchema by lazy {
    RemoteSchema(type = "integer", defaultValue = JsonPrimitive(30000), maximum = 9007199254740991.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1da8031b611dee7d: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_18a5d3fa6e42f4ef, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1dff9447e3354b05: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("exponential")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1e25c599a64f5b9d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("source", "status", "toolName", "updatedAt", "version"), properties = mapOf("capturedAt" to schema_80c415b6e27c6ebd, "image" to schema_c1862c8cf975e3dc, "source" to schema_9addfc34d28f29dc, "status" to schema_cf7eae9345350df4, "streamVersion" to schema_7f9f5a0d72de0d9a, "target" to schema_bf0b727f7b1c6d07, "toolName" to schema_bf0b727f7b1c6d07, "updatedAt" to schema_80c415b6e27c6ebd, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_2363c4dd0a78ce9d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authenticated"), JsonPrimitive("missing"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2365fa95161a3294: RemoteSchema by lazy {
    RemoteSchema(type = "string", format = "uri", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("forge.host.https"))
}

internal val schema_23a1c447c059f0da: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("throughCursor", "version", "watchId"), properties = mapOf("throughCursor" to schema_56aa0e45cbdce0d0, "version" to schema_f8ba039a2f32fad1, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_23e05d248383ea40: RemoteSchema by lazy {
    RemoteSchema(type = "integer", maximum = 9007199254740991.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_241bff8fc91fc9b5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects"), properties = mapOf("created" to schema_feeb8bb50144d96d, "project" to schema_cac3b973979876dd, "projects" to schema_1a5502ed59b02d53), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_242a5ef77d1f8924: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2465ffaaf2ca280d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries", "totalIndexed"), properties = mapOf("entries" to schema_3615f9310cd4ee9d, "totalIndexed" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2472eab79ad4b307: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("started"), JsonPrimitive("updated"), JsonPrimitive("completed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_247ec4acb49e6522: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "id", "listenPort", "targetPort"), properties = mapOf("createdAt" to schema_56aa0e45cbdce0d0, "id" to schema_36fea325bf1aca70, "listenPort" to schema_279eee1efa9da6c8, "targetPort" to schema_279eee1efa9da6c8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_24a221c9609f967e: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, pattern = "^[A-Za-z0-9][A-Za-z0-9_.-]*$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_24cb35c8f91ba9a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("files"), properties = mapOf("files" to schema_0abd6180b71e8684), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_252e94a758743ab1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_48916cddaaeb3b09, schema_13762c62f0c23527, schema_3897f50212cb0b25, schema_a633f9a256d1d0c9, schema_17b50a5a251b31ce, schema_bd23acb1d60bc91b, schema_8f58c1d1acd8bc3c, schema_0ad133ee5894107b, schema_95d0adeb5b1f4c44, schema_4655073d71f8e50b, schema_e65689e97e7d91c3, schema_f1c1581e1729d48e), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2556bf4896893601: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authentication"), JsonPrimitive("tool-restrictions"), JsonPrimitive("sensitive-values")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_255898614500bbb9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hostId", "prNumber", "projectId"), properties = mapOf("hostId" to schema_bf0b727f7b1c6d07, "prNumber" to schema_23e05d248383ea40, "projectId" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_25a3e0b2a9eecdfb: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^\\/(?!\\/)(?:[^?#]*)$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
