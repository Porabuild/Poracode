package com.poracode.app.ui.voice

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeActionButton
import com.poracode.app.ui.components.PoracodeButtonVariant
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme
import java.util.Locale

enum class VoiceDictationBackend(val wireValue: String) {
    HostHexVoice("hex"),
    DeviceSpeech("device"),
    ;

    companion object {
        fun fromWire(raw: String?): VoiceDictationBackend =
            entries.firstOrNull { it.wireValue == raw } ?: HostHexVoice
    }
}

/**
 * Compact Material 3 voice dictation sheet supporting Android device speech recognition
 * and host `hexVoice` dictation, inserting the confirmed transcript into the active composer.
 */
@Composable
fun VoiceDictationSheet(
    languageTag: String?,
    onInsertTranscript: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val dictationErrorText = stringResource(R.string.voice_dictation_error)
    val colors = PoracodeTheme.colors
    var listening by remember { mutableStateOf(false) }
    var transcript by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val recognizerAvailable = remember(context) { SpeechRecognizer.isRecognitionAvailable(context) }

    val recognizer = remember(context) {
        if (recognizerAvailable) SpeechRecognizer.createSpeechRecognizer(context) else null
    }
    DisposableEffect(recognizer) {
        recognizer?.setRecognitionListener(
            object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { listening = true; errorMessage = null }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { listening = false }
                override fun onError(error: Int) {
                    listening = false
                    errorMessage = dictationErrorText
                }
                override fun onResults(results: Bundle?) {
                    listening = false
                    val best = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()?.trim()
                    if (!best.isNullOrEmpty()) transcript = best
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()?.trim()
                    if (!partial.isNullOrEmpty()) transcript = partial
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            },
        )
        onDispose { recognizer?.destroy() }
    }

    fun startListening() {
        val engine = recognizer ?: return
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE,
                languageTag?.takeIf { it.isNotBlank() } ?: Locale.getDefault().toLanguageTag(),
            )
        }
        errorMessage = null
        listening = true
        engine.startListening(intent)
    }

    PoracodeSheet(
        onDismissRequest = {
            recognizer?.stopListening()
            onDismiss()
        },
        title = stringResource(R.string.voice_dictation_title),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PoracodeCard {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        PoracodeIcons.Mic,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = if (listening) colors.accent else colors.muted,
                    )
                    Text(
                        text = when {
                            transcript.isNotBlank() -> transcript
                            listening -> stringResource(R.string.voice_dictation_listening)
                            !recognizerAvailable -> stringResource(R.string.voice_dictation_unavailable)
                            else -> stringResource(R.string.voice_dictation_ready)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (transcript.isNotBlank()) colors.foreground else colors.muted,
                        modifier = Modifier.weight(1f),
                    )
                }
                errorMessage?.let { err ->
                    Text(err, style = MaterialTheme.typography.bodySmall, color = colors.danger)
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (recognizerAvailable) {
                    PoracodeActionButton(
                        label = stringResource(
                            if (listening) R.string.voice_dictation_stop else R.string.voice_dictation_start,
                        ),
                        icon = if (listening) PoracodeIcons.Stop else PoracodeIcons.Mic,
                        variant = PoracodeButtonVariant.Tonal,
                        onClick = {
                            if (listening) {
                                recognizer?.stopListening()
                                listening = false
                            } else {
                                startListening()
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
                PoracodeActionButton(
                    label = stringResource(R.string.voice_dictation_insert),
                    variant = PoracodeButtonVariant.PrimaryNeutral,
                    enabled = transcript.isNotBlank(),
                    onClick = {
                        onInsertTranscript(transcript.trim())
                        onDismiss()
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
