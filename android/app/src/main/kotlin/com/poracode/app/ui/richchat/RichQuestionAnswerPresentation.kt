package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal data class RichQuestionAnswerSelection(val label: String, val description: String?)

internal data class RichQuestionAnswerEntry(
    val header: String,
    val question: String,
    val selected: List<RichQuestionAnswerSelection>,
    val customAnswer: String?,
)

internal object RichQuestionAnswerPresentation {
    fun entries(item: RichRuntimeItem): List<RichQuestionAnswerEntry> {
        if (item.type != RichItemTypes.QUESTION_ANSWER) return emptyList()
        val questions = (item.payload as? JsonObject)?.get("questions") as? JsonArray
            ?: return emptyList()
        return questions.mapNotNull { value ->
            val question = value as? JsonObject ?: return@mapNotNull null
            val header = question.text("header") ?: return@mapNotNull null
            val prompt = question.text("question") ?: return@mapNotNull null
            val selections = question["selected"] as? JsonArray ?: return@mapNotNull null
            val selected = selections.mapNotNull selection@ { selection ->
                val entry = selection as? JsonObject ?: return@selection null
                val label = entry.text("label")?.takeIf(String::isNotBlank)
                    ?: return@selection null
                RichQuestionAnswerSelection(label, entry.text("description"))
            }
            val customAnswer = question.text("customAnswer")?.takeIf(String::isNotBlank)
            if (selected.isEmpty() && customAnswer == null) return@mapNotNull null
            RichQuestionAnswerEntry(header, prompt, selected, customAnswer)
        }
    }

    fun text(item: RichRuntimeItem): String = entries(item).joinToString("\n\n") { entry ->
        buildList {
            if (entry.header.isNotBlank() && entry.header != entry.question) add(entry.header)
            if (entry.question.isNotBlank()) add(entry.question)
            entry.selected.forEach { selection ->
                add(selection.label)
                selection.description?.takeIf(String::isNotBlank)?.let(::add)
            }
            entry.customAnswer?.let(::add)
        }.joinToString("\n")
    }

    private fun JsonObject.text(key: String): String? =
        (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
}
