// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_51fc061b3ecc735c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("newLocation", "projectId"), properties = mapOf("newLocation" to schema_080f9cc154af9e27, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_522013c70826ee65: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unavailable"), JsonPrimitive("busy"), JsonPrimitive("invalid_request"), JsonPrimitive("not_ready"), JsonPrimitive("failed"), JsonPrimitive("cancelled"), JsonPrimitive("timeout"), JsonPrimitive("disconnected"), JsonPrimitive("incompatible"), JsonPrimitive("unsupported"), JsonPrimitive("download_failed"), JsonPrimitive("integrity"), JsonPrimitive("permission_denied")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_522b0d7f41276332: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hash", "message"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "hash" to schema_bf0b727f7b1c6d07, "message" to schema_bf0b727f7b1c6d07, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5296d6b04d46b630: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4c967d4ed16edbc1, schema_e0da1e0a5e3cd077, schema_a66324f9a46c480b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_52fb827fec8a0504: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_5cddec4454f9cd6a, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53996e5a27a5b0c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format = "uuid", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("push.routing.client-connection-id.lowercase"))
}

internal val schema_53ceafeed27db1df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("archive")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53dc1dce3c536b94: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("listTools")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53e1ad57ca4daef6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("forgeAccount", "forgeRepository", "prNumber", "projectLocation"), properties = mapOf("forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "query" to schema_e78f40fc5399f7f1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53f3c1938556e280: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 59.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_540ab9236f8c36ab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("posix", "windows"), properties = mapOf("posix" to schema_685dee710cb094fd, "windows" to schema_685dee710cb094fd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_543fbae99d61b8d1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "path", "projectLocation"), properties = mapOf("access" to schema_8423ce6905ffd393, "disposition" to schema_7db74ec55cf0af32, "path" to schema_bd85a52dd25effae, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_54e62eb98f37e953: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ed8928e1a85aa112, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_559c498a020be6ad: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "retry" to schema_feeb8bb50144d96d, "state" to schema_b191f81602296a89), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_55bad6da24b769c6: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_5093c62d05bf0072, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("pr-watch.agent-required-when-enabled"))
}

internal val schema_55c4cb32b40db3a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "expectedOwnerToken" to schema_8e43cad70cd70de7, "force" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("git.delete-branch.remote-cannot-have-owner"))
}
