// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_152c40e616898dd2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("availableVersion", "downloadBytes", "source", "state", "version"), properties = mapOf("availableVersion" to schema_bf0b727f7b1c6d07, "downloadBytes" to schema_78830b3d6ec86f55, "error" to schema_522013c70826ee65, "progress" to schema_a581e67cd137ad59, "source" to schema_54e62eb98f37e953, "state" to schema_fd20949193e6879d, "version" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_15fcce03de60030d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_33250cfe650a4571, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_174bab0c7c772746: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "kind", "offset"), properties = mapOf("data" to schema_682961f5d2dbd9ba, "kind" to schema_6f5fd1f7837ee8fe, "offset" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_18b29df576abb2b9: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("setupScript" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_18dc352c9a615faa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoRefresh", "collapsedProviders", "disabledProviders", "providerOrder", "providerRefreshIntervals", "refreshIntervalMinutes", "selectedRingGroups", "showEstimatedCost", "showInSidebar", "sidebarHiddenProviders"), properties = mapOf("autoRefresh" to schema_a6ba34cd39bf30c5, "collapsedProviders" to schema_aac2a4e83d2823be, "disabledProviders" to schema_aac2a4e83d2823be, "providerOrder" to schema_aac2a4e83d2823be, "providerRefreshIntervals" to schema_ea08f63f22aa2011, "refreshIntervalMinutes" to schema_ea193ab85993872c, "selectedRingGroups" to schema_c3ac2139868061bb, "showEstimatedCost" to schema_f8b6dd8128e8bfe0, "showInSidebar" to schema_a6ba34cd39bf30c5, "sidebarHiddenProviders" to schema_aac2a4e83d2823be), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_18e932ea73363819: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("catalog")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_19030914d1c4d410: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("insert-text")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_1a747af71da81871: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "setup"), properties = mapOf("kind" to schema_8d030d3e3d2256ff, "setup" to schema_5f8990d59acdf5a7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_1b36bab0d2cb9dde: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("offset", "sha256", "total"), properties = mapOf("offset" to schema_56aa0e45cbdce0d0, "sha256" to schema_980dbd0a7a812034, "total" to schema_0dde37d4b96304ba), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1b3dc298a6f3cf15: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "tokens"), properties = mapOf("id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "tokens" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
