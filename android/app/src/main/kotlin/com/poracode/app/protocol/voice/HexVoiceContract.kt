package com.poracode.app.protocol.voice

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.remote.v3.generated.*
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Generated-codec contract for the `hexVoice` desktop procedure (`POST /api/git/call`),
 * matching iOS `VoiceHexGateway.swift` & `VoiceWav.swift`.
 */
object HexVoiceContract {
    const val PROCEDURE_NAME = "hexVoice"
    const val PROCEDURE_PATH = "/api/git/call"
    const val SAMPLE_RATE_HZ = 16_000
    const val CHANNELS = 1
    const val BITS_PER_SAMPLE = 16
    private val json = Json { ignoreUnknownKeys = true; isLenient = false }

    fun encodeRequest(payload: JsonObject): String {
        if (RemoteContractMetadata.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            throw invalid("Incompatible protocol version.")
        }
        val metadata = RemoteContractMetadata.procedures.firstOrNull { it.name == PROCEDURE_NAME }
            ?: throw invalid("Missing hexVoice procedure metadata.")
        if (metadata.scope != "session:operate" || metadata.owner != "desktop" || metadata.resultKind != "json") {
            throw invalid("Incompatible hexVoice procedure contract.")
        }
        val canonicalPayload = canonical(
            RemoteRootCodecs.procedureU2EHexVoiceU2ERequest,
            payload.toString(),
        )
        val envelope = buildJsonObject {
            put("procedure", PROCEDURE_NAME)
            put("payload", json.parseToJsonElement(canonicalPayload))
        }
        return canonical(RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest, envelope.toString())
    }

    fun decodeResponse(rawJson: String): JsonObject {
        val root = json.parseToJsonElement(rawJson).jsonObject
        val resultElement: JsonElement = root["result"]
            ?: throw invalid("Missing result in hexVoice response.")
        if (root.size != 1) {
            throw invalid("Unexpected envelope fields in hexVoice response.")
        }
        val canonicalResult = canonical(
            RemoteRootCodecs.procedureU2EHexVoiceU2EResult,
            resultElement.toString(),
        )
        val obj = json.parseToJsonElement(canonicalResult).jsonObject
        if (obj["kind"]?.jsonPrimitive?.contentOrNull == "error") {
            val code = obj["code"]?.jsonPrimitive?.contentOrNull ?: "hex_voice_error"
            throw RemoteClientException(message = "hexVoice returned error: $code", status = 400, code = code)
        }
        return obj
    }

    /** Encodes 16-bit mono PCM samples at 16 kHz into a standard RIFF WAVE byte array. */
    fun encodePcm16ToWav(pcmSamples: ShortArray, sampleRateHz: Int = SAMPLE_RATE_HZ): ByteArray {
        val dataSize = pcmSamples.size * 2
        val byteRate = sampleRateHz * CHANNELS * (BITS_PER_SAMPLE / 8)
        val blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8)
        val out = ByteArrayOutputStream(44 + dataSize)
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray(Charsets.US_ASCII))
        header.putInt(36 + dataSize)
        header.put("WAVE".toByteArray(Charsets.US_ASCII))
        header.put("fmt ".toByteArray(Charsets.US_ASCII))
        header.putInt(16)
        header.putShort(1)
        header.putShort(CHANNELS.toShort())
        header.putInt(sampleRateHz)
        header.putInt(byteRate)
        header.putShort(blockAlign.toShort())
        header.putShort(BITS_PER_SAMPLE.toShort())
        header.put("data".toByteArray(Charsets.US_ASCII))
        header.putInt(dataSize)
        out.write(header.array())
        val pcmBuf = ByteBuffer.allocate(dataSize).order(ByteOrder.LITTLE_ENDIAN)
        for (sample in pcmSamples) pcmBuf.putShort(sample)
        out.write(pcmBuf.array())
        return out.toByteArray()
    }

    private fun <T> canonical(codec: RemoteRootCodec<T>, rawJson: String): String = try {
        codec.encodeSnapshot(codec.decode(rawJson))
    } catch (error: Throwable) {
        throw invalid("Generated contract validation failed: ${error.message}")
    }

    private fun invalid(message: String): RemoteClientException =
        RemoteClientException(message = message, status = 400, code = "invalid_response")
}
