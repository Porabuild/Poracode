package com.poracode.app.ui.richchat

import com.poracode.app.model.AgentStatusEntry
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

class RichModelSwitchLabelsTest {

    private fun entry(models: List<Pair<String, String>>, guiModels: List<Pair<String, String>> = emptyList()): AgentStatusEntry {
        fun catalog(pairs: List<Pair<String, String>>) = buildJsonArray {
            pairs.forEach { (id, label) ->
                add(buildJsonObject { put("id", id); put("label", label) })
            }
        }
        val raw = buildJsonObject {
            put("capabilities", buildJsonObject {
                put("models", catalog(models))
                if (guiModels.isNotEmpty()) {
                    put("presentationCapabilities", buildJsonObject {
                        put("gui", buildJsonObject { put("models", catalog(guiModels)) })
                    })
                }
            })
        }
        return AgentStatusEntry("provider|posix|", "provider", "Provider", true, null, "authenticated", "posix", "", raw)
    }

    @Test
    fun labelsComeFromBaseAndGuiCatalogsWithFirstWins() {
        val labels = richChatModelLabels(
            entry(
                models = listOf("model-a" to "Model A"),
                guiModels = listOf("model-a" to "GUI Model A", "model-b" to "Model B"),
            ),
        )
        assertEquals(mapOf("model-a" to "Model A", "model-b" to "Model B"), labels)
    }

    @Test
    fun missingStatusYieldsNoLabels() {
        assertEquals(emptyMap<String, String>(), richChatModelLabels(null))
    }
}
