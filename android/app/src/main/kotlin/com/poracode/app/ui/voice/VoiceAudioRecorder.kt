package com.poracode.app.ui.voice

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.poracode.app.protocol.voice.HexVoiceContract
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext

/**
 * Bounded 16 kHz mono PCM16 audio capture for Android voice dictation into host `hexVoice`.
 * Caps capture at [MAX_DURATION_SECONDS] so memory stays bounded (~1.9 MiB max).
 */
class VoiceAudioRecorder {
    @Volatile private var recording = false

    fun stop() {
        recording = false
    }

    @SuppressLint("MissingPermission")
    suspend fun recordWavBytes(): ByteArray? = withContext(Dispatchers.IO) {
        val sampleRate = HexVoiceContract.SAMPLE_RATE_HZ
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuf <= 0) return@withContext null
        val recorder = runCatching {
            AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBuf * 2,
            )
        }.getOrNull() ?: return@withContext null
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            return@withContext null
        }

        val maxSamples = sampleRate * MAX_DURATION_SECONDS
        val pcmBytes = ByteArrayOutputStream()
        val chunk = ShortArray(minBuf / 2)
        recording = true
        var totalSamples = 0
        try {
            recorder.startRecording()
            while (recording && isActive && totalSamples < maxSamples) {
                val read = recorder.read(chunk, 0, chunk.size)
                if (read > 0) {
                    val buf = ByteBuffer.allocate(read * 2).order(ByteOrder.LITTLE_ENDIAN)
                    for (i in 0 until read) buf.putShort(chunk[i])
                    pcmBytes.write(buf.array())
                    totalSamples += read
                }
            }
        } finally {
            recording = false
            runCatching { recorder.stop() }
            recorder.release()
        }
        val raw = pcmBytes.toByteArray()
        if (raw.isEmpty()) return@withContext null
        val samples = ShortArray(raw.size / 2)
        ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(samples)
        HexVoiceContract.encodePcm16ToWav(samples, sampleRate)
    }

    companion object {
        const val MAX_DURATION_SECONDS = 60
    }
}
