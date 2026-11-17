// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_39d6579ca7450396: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("admin" to schema_f8b6dd8128e8bfe0, "method" to schema_72373308389f2027, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39d8d7cbf4384109: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 200, items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39f0b40d9df37da7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filePath", "projectLocation"), properties = mapOf("filePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a008e3c404a93c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("cancelled"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a27703aead13583: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ownerToken"), properties = mapOf("ownerToken" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a38f5dc8038f065: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 2.0, maximum = 120.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a762c9b6eacc492: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = -90.0, maximum = 90.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ac0e8087f32acdf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reduceMotion")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ac3526f6a2607f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_61fc4b3eaedeba13), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ad15ffc16029f9a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("adminMerge", "autoFix", "autoMerge", "checks", "draft", "edit", "expectedHeadMerge", "mergeMethods", "rebaseBranch", "reopen", "reviewDecisions", "reviewThreads", "updateBranch"), properties = mapOf("adminMerge" to schema_feeb8bb50144d96d, "autoFix" to schema_feeb8bb50144d96d, "autoMerge" to schema_feeb8bb50144d96d, "checks" to schema_feeb8bb50144d96d, "commentEditing" to schema_78ecc0eb2955fb7f, "commitDiffs" to schema_d2dd3595e1b5e5dc, "convertToDraft" to schema_d2dd3595e1b5e5dc, "draft" to schema_feeb8bb50144d96d, "edit" to schema_feeb8bb50144d96d, "expectedHeadMerge" to schema_feeb8bb50144d96d, "labels" to schema_d2dd3595e1b5e5dc, "mergeMethods" to schema_58317133a27c74f8, "reactions" to schema_30057dd734d040ce, "rebaseBranch" to schema_feeb8bb50144d96d, "reopen" to schema_feeb8bb50144d96d, "reviewDecisions" to schema_cdc4a9f3587d0382, "reviewDrafts" to schema_d2dd3595e1b5e5dc, "reviewGuides" to schema_d2dd3595e1b5e5dc, "reviewRequests" to schema_d2dd3595e1b5e5dc, "reviewThreads" to schema_feeb8bb50144d96d, "updateBranch" to schema_feeb8bb50144d96d, "viewedFiles" to schema_ae682752b1c14d17), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ad514880db80c82: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("text")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3b681a533b5fa621: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notices"), properties = mapOf("notices" to schema_f67f6cbe63879b24), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c115ff749c28304: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0d39188d7ce690df, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c40bff8b05543d7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_feeb8bb50144d96d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c594c99571d82f9: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^factory:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c702b70b3eb4220: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ios"), JsonPrimitive("ios-video"), JsonPrimitive("android")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cc2bb39a7445b48: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_a02c812507215fb8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ccadafaab48b090: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("exclude" to schema_cda18ebe4af54c5c, "useIgnoreFiles" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cd19b85f5490a72: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("url")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cdb2ff0de916278: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 512, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d06117798bf5171: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = -9007199254740991.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d188d85aa0799fe: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_2d29c7255e1cf1b1, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d1908a6bccf4864: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-begin")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d3e7c3b5882bbbe: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_8d889103a9834b21, schema_891d4598b0ce7d6d, schema_b01e26e0438140cd, schema_5aa949613e8394ce, schema_21cd039cb32b3851, schema_1ae7de2180f145f4, schema_2e4d2aaed030369e, schema_c3363423bb669510, schema_80906c6ddc7c6c9e, schema_ebd70a208b453fe1, schema_b79d8f64de4f41bd, schema_09765c7778825d10, schema_431be1ab7e1b0dc9, schema_a93ba7bf23f9b121, schema_370ff0ec0af5649a, schema_2062bc5ac9057c02, schema_efd9410c7543c4c0, schema_69af29ff385f1e03, schema_c26b952dfa583dcd), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3dd69184dc64b745: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_adaa80878b467841, schema_d1624ea0ecc46dc6, schema_2840caeaedca16a2, schema_94dda13e1cf59dea), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df0ab0b4ea7223c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("close-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df4f14bf23d248d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df8195e9076bb2b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("method", "requestId", "response"), properties = mapOf("method" to schema_36fea325bf1aca70, "requestId" to schema_a44865d83be28e9f, "response" to schema_ca3d163bab055381), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e412d7b328b3f5a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_3ccadafaab48b090, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e58e9f152d76240: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_468209f9bb01c8a9, schema_2b7595c3da8bc0e9, schema_da66851500474562, schema_36ba3d858bc826c9, schema_27aa97567424846c, schema_37addcca5b32752c, schema_580efa06e9547a64, schema_ebfa6f1c64210a5f, schema_8573967ac3b77c66), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e5dc6593b33f225: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prs"), properties = mapOf("prs" to schema_a7a958b1f69d54ee), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e6404f86586fcab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "usedPercent"), properties = mapOf("currency" to schema_bf0b727f7b1c6d07, "id" to schema_29b52750e42441f8, "label" to schema_bf0b727f7b1c6d07, "limit" to schema_f696f11685898ba7, "resetsAt" to schema_56aa0e45cbdce0d0, "unit" to schema_c263982707afed92, "used" to schema_f696f11685898ba7, "usedPercent" to schema_a581e67cd137ad59), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e68ba0d03654c68: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forward")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ee9ee08aa6a662d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("baseBranch" to schema_36fea325bf1aca70, "body" to schema_bf0b727f7b1c6d07, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("forge.edit.fields"))
}

internal val schema_3f02a5451ac550c4: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 100, items = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3f3680e5774b47dd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("childDesktopId", "endpoint", "environmentId", "pairingCredential"), properties = mapOf("childDesktopId" to schema_97d85a5eaee82b97, "endpoint" to schema_85c1db78d5c7dc29, "environmentId" to schema_d855999aed5e6438, "pairingCredential" to schema_85c1db78d5c7dc29), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3f58316dbb160752: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_23a1c447c059f0da, "id" to schema_36fea325bf1aca70, "type" to schema_740c7dc82a88634a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3f5bcd72f92b6f9f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-watch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_402930e3e48d3bdd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "pending", "retiring"), properties = mapOf("active" to schema_56aa0e45cbdce0d0, "pending" to schema_56aa0e45cbdce0d0, "retiring" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_404d099c5c6a9b12: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("byteLength", "kind", "projectId", "sha256", "threadId", "transferId"), properties = mapOf("agent" to schema_ad6b325f634f4e2e, "byteLength" to schema_0dde37d4b96304ba, "kind" to schema_1fcbd5bc41d865ae, "projectId" to schema_36fea325bf1aca70, "sha256" to schema_980dbd0a7a812034, "threadId" to schema_36fea325bf1aca70, "transferId" to schema_7f836db787c9df87), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4067ad04bfbe200c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
