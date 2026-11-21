// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_80ac3a097b3c79c7: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("breakdown" to schema_3008927746cc013b, "maxTokens" to schema_23e05d248383ea40, "usedTokens" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80c415b6e27c6ebd: RemoteSchema by lazy {
    RemoteSchema(type = "number", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80c5703401a577fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_4b47ae3fc75a3ec0, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80f7976aee3c4505: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_ab08aad343958c81, schema_b9d24da8425fcc77), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80fe2d5ae5950377: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("disabled" to schema_feeb8bb50144d96d, "ghAccount" to schema_eb2798e2ccc8bf65, "icon" to schema_df704162f3d15808, "mcpServers" to schema_637f685cb2418b8c, "name" to schema_36fea325bf1aca70, "pinnedBranches" to schema_f26d9689fe341b94, "pluginOverrides" to schema_636da2bdcbf5818d, "scripts" to schema_3155b0e8649e47af, "searchSettings" to schema_3e412d7b328b3f5a, "worktreeBaseBranch" to schema_df704162f3d15808, "worktreeLocation" to schema_137e14636e0bc235), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8103808258c2d166: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name"), properties = mapOf("label" to schema_2d0b6ec9f2b2decf, "name" to schema_36fea325bf1aca70, "optional" to schema_feeb8bb50144d96d, "secret" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8103b4e6f4958c4c: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 2000, items = schema_f249cae06596abcd, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_81055c9199569630: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_81073d419643b803: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("inputs", "maxDepth", "maxInputBytes", "maxItems", "maxNodes", "version"), properties = mapOf("inputs" to schema_aa36e30f2962353e, "maxDepth" to schema_7aa755d21efd1447, "maxInputBytes" to schema_bed38fc7e15d070f, "maxItems" to schema_8580fa8375e39340, "maxNodes" to schema_1b1b9bdadcd8934d, "version" to schema_76be41b15fd4c56a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_812ec408f30828f2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "kind"), properties = mapOf("code" to schema_522013c70826ee65, "kind" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_813e06bfce03eec3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cancel_install")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_81440643a0f1796d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_61fc4b3eaedeba13, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_815909fa96d68d7b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "threadId"), properties = mapOf("itemId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_820293e02a103abf: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("name" to schema_36fea325bf1aca70, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_82088d0ad1ba613a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("imported"), properties = mapOf("imported" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_825afc62b855f7e6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("actions"), properties = mapOf("actions" to schema_c286f4704a09cde8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_828172bf1752b0f1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("marketplace"), properties = mapOf("marketplace" to schema_118f67a0fa6bb27d, "query" to schema_e5bbd3e940039349, "sort" to schema_1eaf563a1e9fa631), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
