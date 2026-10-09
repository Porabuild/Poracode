package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.model.RemoteSlashCommand
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** One rendered row of the model menu: a group heading or a selectable model. */
internal sealed interface RichChatComposerModelEntry {
    data class Heading(val groupId: String, val label: String) : RichChatComposerModelEntry
    data class Model(val option: RichChatComposerOption) : RichChatComposerModelEntry
}

internal data class RichChatSlashCommandOption(
    val id: String,
    val displayId: String,
    val label: String,
    val description: String?,
    val argumentHint: String?,
    val skill: RichPromptSegment.Skill?,
)

/** Humanizes an opaque capability id for display ("gpt-5" → "GPT 5"). */
internal fun humanizedComposerId(value: String): String {
    val parts = value.split('-', '_', '/').filter(String::isNotBlank)
    val versionedAcronym = parts.size > 1 &&
        parts.first().length <= 4 &&
        parts.drop(1).any { it.firstOrNull()?.isDigit() == true }
    return parts.mapIndexed { index, part ->
        if (index == 0 && versionedAcronym) {
            part.uppercase()
        } else {
            part.replaceFirstChar(Char::uppercase)
        }
    }.joinToString(" ").ifBlank { value }
}

internal fun composerOptions(value: JsonElement?): List<RichChatComposerOption> =
    (value as? JsonArray).orEmpty().mapNotNull { element ->
        val direct = element.stringValue()
        if (!direct.isNullOrBlank()) {
            RichChatComposerOption(direct, humanizedComposerId(direct))
        } else {
            val objectValue = element as? JsonObject ?: return@mapNotNull null
            val id = objectValue["id"].stringValue()?.takeIf(String::isNotBlank)
                ?: return@mapNotNull null
            val label = objectValue["label"].stringValue()?.takeIf(String::isNotBlank)
                ?: humanizedComposerId(id)
            RichChatComposerOption(id, label, objectValue["description"].stringValue())
        }
    }.distinctBy { it.id }

/**
 * Flattens the model menu into heading/model entries. Membership resolves from
 * the optional `modelSubProvider` exact-id map, falling back to the id's `/`/`:` namespace
 * prefix; headings use the declared `subProviders` label, humanized when undeclared.
 */
internal fun projectModelEntries(
    models: List<RichChatComposerOption>,
    subProviders: JsonElement?,
    modelSubProvider: JsonElement?,
): List<RichChatComposerModelEntry> {
    val declaredLabels = composerOptions(subProviders).associate { it.id to it.label }
    val explicitGroups = HashMap<String, String>()
    (modelSubProvider as? JsonObject)?.forEach { (modelId, groupId) ->
        val id = (groupId as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content
        if (modelId.isNotBlank() && !id.isNullOrBlank()) explicitGroups[modelId] = id
    }
    return projectGroupedModelEntries(models, declaredLabels, explicitGroups) { model ->
        model.id.indexOfAny(modelNamespaceSeparators).takeIf { it > 0 }
            ?.let { model.id.substring(0, it) }
    }
}

/**
 * Flattens the model menu into heading/model entries. Membership resolves from
 * the exact `explicitGroups` id map, then [fallbackGroup]; headings use the declared
 * label, humanized when undeclared. Ungrouped models lead, groups follow in declared
 * order then first-appearance order, and every model keeps its original relative
 * position. A heading is dropped only when its group holds exactly one model whose
 * label restates the heading; flat inputs project to bare models, leaving the
 * ungrouped menu untouched.
 */
internal fun projectGroupedModelEntries(
    models: List<RichChatComposerOption>,
    declaredLabels: Map<String, String>,
    explicitGroups: Map<String, String>,
    fallbackGroup: (RichChatComposerOption) -> String?,
): List<RichChatComposerModelEntry> {
    val grouped = LinkedHashMap<String, MutableList<RichChatComposerOption>>()
    val ungrouped = mutableListOf<RichChatComposerOption>()
    for (model in models) {
        val groupId = explicitGroups[model.id] ?: fallbackGroup(model)
        if (groupId == null) {
            ungrouped.add(model)
        } else {
            grouped.getOrPut(groupId) { mutableListOf() }.add(model)
        }
    }
    if (grouped.isEmpty()) return models.map { RichChatComposerModelEntry.Model(it) }
    val entries = mutableListOf<RichChatComposerModelEntry>()
    ungrouped.forEach { entries.add(RichChatComposerModelEntry.Model(it)) }
    val orderedGroupIds = declaredLabels.keys.filter(grouped::containsKey) +
        grouped.keys.filter { it !in declaredLabels }
    for (groupId in orderedGroupIds) {
        val groupModels = grouped.getValue(groupId)
        val heading = declaredLabels[groupId] ?: humanizedComposerId(groupId)
        if (groupModels.size == 1 &&
            heading.trim().equals(groupModels.single().label.trim(), ignoreCase = true)
        ) {
            entries.add(RichChatComposerModelEntry.Model(groupModels.single()))
        } else {
            entries.add(RichChatComposerModelEntry.Heading(groupId, heading))
            groupModels.forEach { entries.add(RichChatComposerModelEntry.Model(it)) }
        }
    }
    return entries
}

internal fun composerSlashCommands(value: JsonElement?): List<RichChatSlashCommandOption> =
    (value as? JsonArray).orEmpty().mapNotNull { element ->
        val objectValue = element as? JsonObject ?: return@mapNotNull null
        composerSlashCommand(objectValue)
    }.deduplicatedByDisplayId()

internal fun composerSlashCommand(command: RemoteSlashCommand): RichChatSlashCommandOption? =
    composerSlashCommand(
        buildJsonObject {
            put("id", command.id)
            put("label", command.label)
            command.description?.let { put("description", it) }
            command.argumentHint?.let { put("argumentHint", it) }
            command.section?.let { put("section", it) }
            command.skillName?.let { put("skillName", it) }
            command.skillPath?.let { put("skillPath", it) }
            command.skillInvocation?.let { put("skillInvocation", it) }
            command.skillProvider?.let { put("skillProvider", it) }
            command.skillScope?.let { put("skillScope", it) }
            command.pluginId?.let { put("pluginId", it) }
            command.pluginName?.let { put("pluginName", it) }
        },
    )

internal fun composerSlashCommand(command: JsonObject): RichChatSlashCommandOption? {
    val id = command["id"].stringValue()?.trim()?.takeIf(String::isNotEmpty)
        ?: return null
    val label = command["label"].stringValue()?.trim()?.takeIf(String::isNotEmpty)
        ?: return null
    val displayId = if (command["section"].stringValue() == "skills") {
        command["skillName"].stringValue()?.takeIf(String::isNotEmpty) ?: id
    } else {
        id
    }
    val skill = command.toSkill()
    return RichChatSlashCommandOption(
        id = id,
        displayId = displayId,
        label = label,
        description = command["description"].stringValue(),
        argumentHint = command["argumentHint"].stringValue(),
        skill = skill,
    )
}

private fun JsonObject.toSkill(): RichPromptSegment.Skill? {
    val name = this["skillName"].stringValue()?.takeIf(String::isNotEmpty) ?: return null
    val invocation = this["skillInvocation"].stringValue()?.takeIf(String::isNotEmpty)
        ?: return null
    val provider = this["skillProvider"].stringValue()?.takeIf(String::isNotEmpty)
        ?: return null
    val scope = this["skillScope"].stringValue()?.takeIf { it == "global" || it == "project" }
        ?: return null
    return RichPromptSegment.Skill(
        name = name,
        path = this["skillPath"].stringValue(),
        invocation = invocation,
        provider = provider,
        scope = scope,
        pluginId = this["pluginId"].stringValue(),
        pluginName = this["pluginName"].stringValue(),
    )
}

internal fun List<RichChatSlashCommandOption>.deduplicatedByDisplayId(): List<RichChatSlashCommandOption> {
    val seen = mutableSetOf<String>()
    return filter { seen.add(it.displayId.lowercase()) }
}

private val modelNamespaceSeparators = charArrayOf('/', ':')

private fun JsonElement?.stringValue(): String? =
    (this as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content
