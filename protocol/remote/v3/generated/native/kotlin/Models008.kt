// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6(
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("installs") val installs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("marketplace") val marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa,
    @SerialName("name") val name: String,
    @SerialName("official") val official: Boolean,
    @SerialName("rank") val rank: Long,
    @SerialName("securityGrade") val securityGrade: RemoteField<ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08> = RemoteField.Missing,
    @SerialName("securityScore") val securityScore: RemoteField<Double> = RemoteField.Missing,
    @SerialName("skillId") val skillId: String,
    @SerialName("source") val source: String,
    @SerialName("sourcePath") val sourcePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("sourceRef") val sourceRef: RemoteField<String> = RemoteField.Missing,
    @SerialName("sourceUrl") val sourceUrl: RemoteField<String> = RemoteField.Missing,
    @SerialName("stars") val stars: RemoteField<Long> = RemoteField.Missing,
    @SerialName("updatedAt") val updatedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("votes") val votes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("weeklyInstalls") val weeklyInstalls: RemoteField<List<Long>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installs", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("marketplace", "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("official", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rank", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("securityGrade", "ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("securityScore", "Double", false, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skillId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourcePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceRef", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceUrl", "String", false, false, null, null, null, null, null, null, null, "uri", listOf()),
            RemoteFieldDescriptor("stars", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("votes", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("weeklyInstalls", "List<Long>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistSkillMarketplaceResult_89033d459d(
    @SerialName("marketplace") val marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa,
    @SerialName("skills") val skills: List<ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6>,
    @SerialName("total") val total: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("marketplace", "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremoveProjectEntryRequest_47c3f1ae81(
    @SerialName("nextParentPath") val nextParentPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("nextParentPath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepauseThreadFollowUpsRequest_d42717fff2(
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5 {
    @SerialName("host") HOST,
    @SerialName("wsl") WSL,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d(
    @SerialName("projectScoped") val projectScoped: Boolean,
    @SerialName("runtime") val runtime: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectScoped", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtime", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a(
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f {
    @SerialName("available") AVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("serverInfo") val serverInfo: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a> = RemoteField.Missing,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f,
    @SerialName("toolCount") val toolCount: Long,
    @SerialName("tools") val tools: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverInfo", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tools", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140 {
    @SerialName("oauth") OAUTH,
    @SerialName("bearer") BEARER,
    @SerialName("other") OTHER,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29 {
    @SerialName("auth-required") AUTHU2DREQUIRED,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d(
    @SerialName("authScheme") val authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = RemoteField.Missing,
    @SerialName("code") val code: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29,
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authScheme", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("code", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5 = Double

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("error") val error: ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29,
    @SerialName("toolCount") val toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5 {
    @SerialName("auth-required") AUTHU2DREQUIRED,
    @SerialName("timeout") TIMEOUT,
    @SerialName("command-not-found") COMMANDU2DNOTU2DFOUND,
    @SerialName("connection-failed") CONNECTIONU2DFAILED,
    @SerialName("protocol-error") PROTOCOLU2DERROR,
    @SerialName("invalid-config") INVALIDU2DCONFIG,
    @SerialName("probe-unavailable") PROBEU2DUNAVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f(
    @SerialName("authScheme") val authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = RemoteField.Missing,
    @SerialName("code") val code: ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5,
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authScheme", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("code", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65 {
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("error") val error: ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65,
    @SerialName("toolCount") val toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureprobeMcpServerResult_bea1bdef18.Serializer::class)
sealed interface ProcedureprobeMcpServerResult_bea1bdef18 {
    data class Option1(val value: ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c) : ProcedureprobeMcpServerResult_bea1bdef18
    data class Option2(val value: ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d) : ProcedureprobeMcpServerResult_bea1bdef18
    data class Option3(val value: ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6) : ProcedureprobeMcpServerResult_bea1bdef18
    object Serializer : KSerializer<ProcedureprobeMcpServerResult_bea1bdef18> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureprobeMcpServerResult_bea1bdef18")
        override fun deserialize(decoder: Decoder): ProcedureprobeMcpServerResult_bea1bdef18 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureprobeMcpServerResult_bea1bdef18 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureprobeMcpServerResult_bea1bdef18>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("available")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("auth-required")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("unavailable")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6>(element)) }
            return RemoteUnionCodec.single("ProcedureprobeMcpServerResult_bea1bdef18", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureprobeMcpServerResult_bea1bdef18) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureprobeMcpServerResult_bea1bdef18 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurequeueThreadFollowUpRequestU2DConfigU2DExecutionEnvironment_4cd2587996(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurequeueThreadFollowUpRequestU2DConfigU2DMode_01e21946e9 {
    @SerialName("agent") AGENT,
    @SerialName("plan") PLAN,
    @SerialName("autopilot") AUTOPILOT,
}

@Serializable
data class ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089(
    @SerialName("approvalPolicy") val approvalPolicy: RemoteField<String> = RemoteField.Missing,
    @SerialName("approvalsReviewer") val approvalsReviewer: RemoteField<String> = RemoteField.Missing,
    @SerialName("browserMcp") val browserMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("chromeMcp") val chromeMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("computerUse") val computerUse: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("contextSize") val contextSize: RemoteField<String> = RemoteField.Missing,
    @SerialName("crossagentMcp") val crossagentMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("executionEnvironment") val executionEnvironment: RemoteField<ProcedurequeueThreadFollowUpRequestU2DConfigU2DExecutionEnvironment_4cd2587996> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<ProcedurequeueThreadFollowUpRequestU2DConfigU2DMode_01e21946e9> = RemoteField.Missing,
    @SerialName("model") val model: String,
    @SerialName("sandboxMode") val sandboxMode: RemoteField<String> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("approvalPolicy", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalsReviewer", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("browserMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chromeMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("computerUse", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSize", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executionEnvironment", "ProcedurequeueThreadFollowUpRequestU2DConfigU2DExecutionEnvironment_4cd2587996", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "ProcedurequeueThreadFollowUpRequestU2DConfigU2DMode_01e21946e9", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxMode", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurequeueThreadFollowUpRequest_9ae2178554(
    @SerialName("config") val config: ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089,
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurereadAbsoluteFileRequest_f6983a322f(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2 {
    @SerialName("ready") READY,
    @SerialName("binary") BINARY,
    @SerialName("too_large") TOOU5FLARGE,
    @SerialName("unsupported") UNSUPPORTED,
    @SerialName("missing") MISSING,
}

@Serializable
data class ProcedurereadAbsoluteFileResult_eaf8a91849(
    @SerialName("content") val content: RemoteField<String> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("status") val status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73 {
    @SerialName("lf") LF,
    @SerialName("crlf") CRLF,
}

@Serializable
data class ProcedurereadExternalFileResult_9ba1e93599(
    @SerialName("content") val content: RemoteField<String> = RemoteField.Missing,
    @SerialName("contentBase64") val contentBase64: RemoteField<String> = RemoteField.Missing,
    @SerialName("hasBom") val hasBom: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("lineEnding") val lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
    @SerialName("path") val path: String,
    @SerialName("status") val status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contentBase64", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hasBom", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lineEnding", "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurereadProjectFileResultU2DStatus_620971ca17 {
    @SerialName("ready") READY,
    @SerialName("binary") BINARY,
    @SerialName("too_large") TOOU5FLARGE,
    @SerialName("unsupported") UNSUPPORTED,
}

@Serializable
data class ProcedurereadProjectFileResult_891e9ab241(
    @SerialName("content") val content: RemoteField<String> = RemoteField.Missing,
    @SerialName("contentBase64") val contentBase64: RemoteField<String> = RemoteField.Missing,
    @SerialName("hasBom") val hasBom: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("lineEnding") val lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
    @SerialName("path") val path: String,
    @SerialName("status") val status: ProcedurereadProjectFileResultU2DStatus_620971ca17,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contentBase64", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hasBom", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lineEnding", "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurereadProjectFileResultU2DStatus_620971ca17", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
