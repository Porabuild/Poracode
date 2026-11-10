// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_409712bfaed84392: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_e9e7b28a3dddd9fd, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_40aab29508fb3256: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("port", "protocol"), properties = mapOf("label" to schema_36fea325bf1aca70, "port" to schema_279eee1efa9da6c8, "protocol" to schema_cb34d50832b1e60d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_40f9a6009bf15988: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpointItemId", "operationKey"), properties = mapOf("checkpointItemId" to schema_36fea325bf1aca70, "operationKey" to schema_96967a6998f6cab7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41148a177ba98c21: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("stale")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_412fb1bbf466cf98: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpointItemId", "projectLocation", "threadId"), properties = mapOf("checkpointItemId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_413ace8627552254: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model", "selections"), properties = mapOf("effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70, "selections" to schema_e51d77fd6734b53a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4147389dac614b3a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("amount", "currency", "estimated", "period"), properties = mapOf("amount" to schema_f696f11685898ba7, "currency" to schema_bf0b727f7b1c6d07, "estimated" to schema_feeb8bb50144d96d, "period" to schema_776626d20373881d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41be750b567a2144: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reload")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41bff5c7300a37e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("success"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "error" to schema_bf0b727f7b1c6d07, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d, "success" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41d0cf68976485ec: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ios"), JsonPrimitive("android"), JsonPrimitive("web")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41ffeb2050e1e71c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deltaX", "deltaY", "kind", "x", "y"), properties = mapOf("deltaX" to schema_80c415b6e27c6ebd, "deltaY" to schema_80c415b6e27c6ebd, "kind" to schema_00ebeb8fef40c2a6, "x" to schema_80c415b6e27c6ebd, "y" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42146530bc4d74c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("manual"), JsonPrimitive("updated"), JsonPrimitive("created")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42293281b655edaa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "clientDeviceId", "expiresAt", "generation", "id", "mode", "platform", "sessionId", "version"), properties = mapOf("access" to schema_9ca4aec6d46ade2e, "clientDeviceId" to schema_97d85a5eaee82b97, "expiresAt" to schema_80c415b6e27c6ebd, "generation" to schema_d855999aed5e6438, "id" to schema_d855999aed5e6438, "mode" to schema_a8565e7811b17010, "platform" to schema_61e54b5f6751c7a6, "sessionId" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_422b1e8c8be5e2c0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 4000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_423ec18ef5ab4596: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "login"), properties = mapOf("avatarUrl" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "login" to schema_36fea325bf1aca70, "name" to schema_bf0b727f7b1c6d07, "team" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4244283735615c22: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "turnId", "type"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_9f20fb68ee791598), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_429303c2d6a42977: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42dfa7eae97f945c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "releaseWslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_431000cfcca50793: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("add", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "remove"), properties = mapOf("add" to schema_340c8f8b68b6e2b5, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "remove" to schema_340c8f8b68b6e2b5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4311a74adde583c6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("orientation")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_431be1ab7e1b0dc9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_53ceafeed27db1df), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43372628accc1dd8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_7db74ec55cf0af32, "mimeType" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4348fdb13264571d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "queued"), properties = mapOf("active" to schema_56aa0e45cbdce0d0, "queued" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43639d56ca3f1150: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "status"), properties = mapOf("message" to schema_36fea325bf1aca70, "status" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_437e2d5d20b6b495: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checks"), properties = mapOf("checks" to schema_3c115ff749c28304), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4392338ffc80bed7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_a399fbc7541223f3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43d29f1d5a2e1f23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_2d862d697d08c085), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_441bce375b64f3d0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_442f4438e0362260: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("replace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4492692f82322049: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("failedOnly" to schema_f8b6dd8128e8bfe0, "ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_452e07a326fbbba7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("family-member")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4535713ebdcc5c37: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 60.0, maximum = 86400.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4545388132b77b29: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_c028422c57a7c557), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_455b16a806252fd5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind", "task"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_cbc64d14585e9a92, "task" to schema_7ab420c1b78efb1d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4563be6a1eff8ba8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "title"), properties = mapOf("description" to schema_2d0b6ec9f2b2decf, "title" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45cf23babef96be9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("blocked")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45d8e163d2ea2910: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fingerprint", "keyType"), properties = mapOf("fingerprint" to schema_d3359b6d5db5b90d, "keyType" to schema_7d62681c6488867d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45e52f032f196485: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_60708133c8c8f499, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45f37b4e852ad753: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_045e333a691dd990, schema_aafcd63530265fa8, schema_c133c6f7b7129d49), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_46060d35e2ab13d1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_1a747af71da81871, schema_a04ed367065645a0, schema_e6b4674777255816, schema_fc3e1f61a45e621e, schema_812ec408f30828f2), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_464dbc5abe96a4c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("account", "forge", "host", "repository", "version"), properties = mapOf("account" to schema_c2bb40b82b330cd4, "forge" to schema_eaed3cfbf46d5d81, "host" to schema_2365fa95161a3294, "repository" to schema_36fea325bf1aca70, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT, semanticIds = listOf("forge.watch.scope-identity"))
}

internal val schema_4655073d71f8e50b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_c533fb875972ec60, "id" to schema_36fea325bf1aca70, "type" to schema_07971608588bb2db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4659e6d395f41e16: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("bounded-v1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4666c29660989480: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_56aa0e45cbdce0d0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_46790b95411c12d0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("anchor", "threadId"), properties = mapOf("anchor" to schema_98ef330d70f2e681, "config" to schema_281d24bbbaa46745, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_468209f9bb01c8a9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_4cb4c9750289b975, "name" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_46a8742e5750f74f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1e3c3dda8e348c4b, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_46c9cbbd3df64c2a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("conversation"), JsonPrimitive("inline")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4721d11b498e9a74: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("npm-global"), JsonPrimitive("pnpm-global"), JsonPrimitive("bun-global")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_473e9b7f4728cf72: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_feeb8bb50144d96d, "terminal" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_475f45061f4eecab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_813e06bfce03eec3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_475f91db7d51b153: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("weekly")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_479fd2dce7e64e29: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unread"), JsonPrimitive("all"), JsonPrimitive("archived")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47c3f1ae81cfac00: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("nextParentPath" to schema_38d1a07d3b9b1c82, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47c50d7349a5a322: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 23.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47e02a8368712956: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-state")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47eb55b96bbf5d77: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("contextSize" to schema_0f732b9fceb2c6ac, "effort" to schema_0f732b9fceb2c6ac, "fast" to schema_3c40bff8b05543d7, "thinking" to schema_3c40bff8b05543d7), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_47fd370c6dedf4fa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status"), properties = mapOf("status" to schema_32773ce5899289ad), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_482895ec9172a79a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "parentLocation", "source"), properties = mapOf("name" to schema_36fea325bf1aca70, "parentLocation" to schema_080f9cc154af9e27, "source" to schema_76b2c94b29aad9b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_482c9282715722ac: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cancel")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_483d5aa44fc0eaba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_c39ba2db208f4f7c, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_485fa06696a88681: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4864c5f65afc8a79: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commitsAhead", "sourceAhead", "sourceBranch"), properties = mapOf("commitsAhead" to schema_3d06117798bf5171, "sourceAhead" to schema_3d06117798bf5171, "sourceBranch" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4878a3657a97dce6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("role"), properties = mapOf("role" to schema_7e386bfca48a8819, "text" to schema_bf0b727f7b1c6d07, "timestamp" to schema_bf0b727f7b1c6d07, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4886facc92937666: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("notice")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48916cddaaeb3b09: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "vision", "watchId"), properties = mapOf("type" to schema_83c210ec93e40e2c, "vision" to schema_af80d040598805ef, "watchId" to schema_8e43cad70cd70de7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48946bc0ed691a38: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("content" to schema_5d217030abf89f29, "structuredContent" to schema_e6958017dac6cd3b, "type" to schema_7611350a61fc2c31), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48de96c42130e156: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_82e8027595898a28, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49162371ff415b49: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("steer"), JsonPrimitive("queue")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_495564cff4cc6688: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_76767b687c50a873, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49834fb5a406b494: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("remove_engine")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_499c88c1c549e934: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(0.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49f72e8cc565067e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-worktree")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a10e57442c165ec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("changesTransferred" to schema_feeb8bb50144d96d, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a22ffc9b41926c0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("nextName", "path", "projectLocation"), properties = mapOf("nextName" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a5ba059d38b8eac: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_94a8055a7bc1b620, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a927b60e49ddae0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pairing"), properties = mapOf("pairing" to schema_3f3680e5774b47dd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4b43828b172de36c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accessibility", "id", "input", "name", "platform", "state"), properties = mapOf("accessibility" to schema_feeb8bb50144d96d, "controls" to schema_edaad5a427ee5ae6, "id" to schema_97d85a5eaee82b97, "input" to schema_feeb8bb50144d96d, "name" to schema_f1deff8504bbc0a3, "platform" to schema_61e54b5f6751c7a6, "state" to schema_51b8dd645024c82d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c1171296b6868a1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "state", "streams", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "state" to schema_2472eab79ad4b307, "streams" to schema_e51d77fd6734b53a, "type" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c20b501501c0ba4: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_df96bd315b4c0dae, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c967d4ed16edbc1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("args", "command", "env", "type"), properties = mapOf("args" to schema_aac2a4e83d2823be, "command" to schema_36fea325bf1aca70, "cwd" to schema_36fea325bf1aca70, "env" to schema_c3ac2139868061bb, "type" to schema_01f71c4e26e7ecde), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4caa9ebeea5fe346: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message"), properties = mapOf("message" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4cb4c9750289b975: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("add-existing")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4cd2587996458d8d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("distro", "kind"), properties = mapOf("distro" to schema_36fea325bf1aca70, "kind" to schema_2d8274eae552cc51), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4ce9d2f234c3a468: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 1000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4d34acc64dd77a5d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("probe")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4d5989d27d26b612: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4d59c815dfec80c4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("questions"), properties = mapOf("questions" to schema_6ccb3f9f839a5656, "sourceItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4dced7b84600297c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "instructions" to schema_e8ae3938f73bbe3d, "language" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4dea101cb65656f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "marketplace", "name", "official", "rank", "skillId", "source"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "installs" to schema_56aa0e45cbdce0d0, "marketplace" to schema_118f67a0fa6bb27d, "name" to schema_36fea325bf1aca70, "official" to schema_feeb8bb50144d96d, "rank" to schema_23e05d248383ea40, "securityGrade" to schema_e987f23b082616d2, "securityScore" to schema_a581e67cd137ad59, "skillId" to schema_36fea325bf1aca70, "source" to schema_36fea325bf1aca70, "sourcePath" to schema_36fea325bf1aca70, "sourceRef" to schema_36fea325bf1aca70, "sourceUrl" to schema_6bb6e13415c8cbba, "stars" to schema_56aa0e45cbdce0d0, "updatedAt" to schema_36fea325bf1aca70, "votes" to schema_56aa0e45cbdce0d0, "weeklyInstalls" to schema_4666c29660989480), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4df989d5459165c8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_56a9bf5bf312d537, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4e014bc9e6085564: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 5, items = schema_4ce9d2f234c3a468, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4e1c353012bcb7ec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conclusion", "name", "number", "status"), properties = mapOf("completedAt" to schema_bf0b727f7b1c6d07, "conclusion" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "number" to schema_3d06117798bf5171, "startedAt" to schema_bf0b727f7b1c6d07, "status" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4e4370de4368f09a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_a627cf0d1237385c, schema_543fbae99d61b8d1), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4e9b40f6024250fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("installed"), properties = mapOf("installed" to schema_495564cff4cc6688), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4eb37bd43cbe100e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ahead", "behind", "branch", "created", "tracking"), properties = mapOf("ahead" to schema_3d06117798bf5171, "behind" to schema_3d06117798bf5171, "branch" to schema_bf0b727f7b1c6d07, "created" to schema_feeb8bb50144d96d, "tracking" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
