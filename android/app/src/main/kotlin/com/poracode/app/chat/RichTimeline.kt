package com.poracode.app.chat

import kotlinx.serialization.json.JsonObject

data class RichRawTimelineNode(
    val item: RichRuntimeItem,
    val children: List<RichRawTimelineNode>,
)

data class RichVisibleTimelineNode(
    val item: RichRuntimeItem,
    val children: List<RichTimelineEntry>,
)

sealed interface RichTimelineEntry {
    data class Item(val node: RichVisibleTimelineNode) : RichTimelineEntry

    data class Group(
        val stableId: String,
        val members: List<RichVisibleTimelineNode>,
    ) : RichTimelineEntry
}

data class RichTimelineProjection(
    /** Transport/persistence order, including rows hidden from presentation. */
    val rawItems: List<RichRuntimeItem>,
    /** Lossless parent tree. Orphans and cycles are promoted to roots. */
    val rawRoots: List<RichRawTimelineNode>,
    val visibleEntries: List<RichTimelineEntry>,
    val hiddenItemIds: Set<String>,
)

object RichTimeline {
    fun project(
        items: List<RichRuntimeItem>,
        explicitlyHiddenItemId: String? = null,
    ): RichTimelineProjection {
        val unique = linkedMapOf<String, RichRuntimeItem>()
        for (item in items) if (!unique.containsKey(item.id)) unique[item.id] = item
        val ordered = unique.values.toList()
        val safeParentById = ordered.associate { item -> item.id to safeParent(item, unique) }
        val childrenByParent = linkedMapOf<String, MutableList<RichRuntimeItem>>()
        val roots = mutableListOf<RichRuntimeItem>()
        for (item in ordered) {
            val parent = safeParentById[item.id]
            if (parent == null) roots += item else childrenByParent.getOrPut(parent) { mutableListOf() } += item
        }
        fun rawNode(item: RichRuntimeItem): RichRawTimelineNode = RichRawTimelineNode(
            item,
            childrenByParent[item.id].orEmpty().map(::rawNode),
        )
        val rawRoots = roots.map(::rawNode)
        val hidden = linkedSetOf<String>()
        val visibleNodes = rawRoots.flatMap { visibleNodes(it, explicitlyHiddenItemId, hidden) }
        return RichTimelineProjection(
            rawItems = ordered,
            rawRoots = rawRoots,
            visibleEntries = groupSiblings(visibleNodes),
            hiddenItemIds = hidden,
        )
    }

    /**
     * O(1) fast-path for high-frequency live streaming deltas (iOS parity):
     * when only a single existing item's `streams` changed without altering
     * hierarchy, type, state, payload, deferred marker, or visibility, patch
     * that node in place from the tail instead of rebuilding the full
     * dictionary/parent/grouping projection on every token.
     */
    fun updatingStreamOnly(
        projection: RichTimelineProjection,
        previousItems: List<RichRuntimeItem>,
        newItems: List<RichRuntimeItem>,
    ): RichTimelineProjection? {
        if (previousItems.size != newItems.size || newItems.isEmpty()) return null
        var changedIndex = -1
        for (i in newItems.indices.reversed()) {
            if (previousItems[i] != newItems[i]) {
                if (changedIndex != -1) return null
                changedIndex = i
            }
        }
        if (changedIndex == -1) return projection
        val oldItem = previousItems[changedIndex]
        val newItem = newItems[changedIndex]
        if (
            oldItem.id != newItem.id ||
            oldItem.type != newItem.type ||
            oldItem.state != newItem.state ||
            oldItem.parentItemId != newItem.parentItemId ||
            oldItem.payload != newItem.payload ||
            oldItem.detailsDeferred != newItem.detailsDeferred ||
            oldItem.type == RichItemTypes.REASONING ||
            oldItem.type == RichItemTypes.USER_MESSAGE ||
            (oldItem.type == RichItemTypes.ASSISTANT_MESSAGE && oldItem.state == RichItemState.COMPLETED) ||
            newItem.id in projection.hiddenItemIds
        ) {
            return null
        }

        val rawItems = projection.rawItems.toMutableList()
        if (changedIndex < rawItems.size && rawItems[changedIndex].id == newItem.id) {
            rawItems[changedIndex] = newItem
        } else {
            val rawIdx = rawItems.indexOfLast { it.id == newItem.id }
            if (rawIdx < 0) return null
            rawItems[rawIdx] = newItem
        }

        fun replaceRaw(nodes: List<RichRawTimelineNode>): Pair<List<RichRawTimelineNode>, Boolean> {
            for (i in nodes.indices.reversed()) {
                val node = nodes[i]
                if (node.item.id == newItem.id) {
                    val copy = nodes.toMutableList()
                    copy[i] = RichRawTimelineNode(newItem, node.children)
                    return copy to true
                }
                if (node.children.isNotEmpty()) {
                    val (updatedChildren, hit) = replaceRaw(node.children)
                    if (hit) {
                        val copy = nodes.toMutableList()
                        copy[i] = RichRawTimelineNode(node.item, updatedChildren)
                        return copy to true
                    }
                }
            }
            return nodes to false
        }

        fun replaceVisible(entries: List<RichTimelineEntry>): Pair<List<RichTimelineEntry>, Boolean> {
            for (i in entries.indices.reversed()) {
                when (val entry = entries[i]) {
                    is RichTimelineEntry.Item -> {
                        if (entry.node.item.id == newItem.id) {
                            val copy = entries.toMutableList()
                            copy[i] = RichTimelineEntry.Item(RichVisibleTimelineNode(newItem, entry.node.children))
                            return copy to true
                        }
                        if (entry.node.children.isNotEmpty()) {
                            val (updatedChildren, hit) = replaceVisible(entry.node.children)
                            if (hit) {
                                val copy = entries.toMutableList()
                                copy[i] = RichTimelineEntry.Item(RichVisibleTimelineNode(entry.node.item, updatedChildren))
                                return copy to true
                            }
                        }
                    }
                    is RichTimelineEntry.Group -> {
                        for (m in entry.members.indices.reversed()) {
                            val member = entry.members[m]
                            if (member.item.id == newItem.id) {
                                val updatedMembers = entry.members.toMutableList()
                                updatedMembers[m] = RichVisibleTimelineNode(newItem, member.children)
                                val copy = entries.toMutableList()
                                copy[i] = RichTimelineEntry.Group(entry.stableId, updatedMembers)
                                return copy to true
                            }
                            if (member.children.isNotEmpty()) {
                                val (updatedChildren, hit) = replaceVisible(member.children)
                                if (hit) {
                                    val updatedMembers = entry.members.toMutableList()
                                    updatedMembers[m] = RichVisibleTimelineNode(member.item, updatedChildren)
                                    val copy = entries.toMutableList()
                                    copy[i] = RichTimelineEntry.Group(entry.stableId, updatedMembers)
                                    return copy to true
                                }
                            }
                        }
                    }
                }
            }
            return entries to false
        }

        val (rawRoots, rawHit) = replaceRaw(projection.rawRoots)
        val (visibleEntries, visibleHit) = replaceVisible(projection.visibleEntries)
        if (!rawHit || !visibleHit) return null
        return RichTimelineProjection(
            rawItems = rawItems,
            rawRoots = rawRoots,
            visibleEntries = visibleEntries,
            hiddenItemIds = projection.hiddenItemIds,
        )
    }

    fun visibleItemIds(projection: RichTimelineProjection): List<String> {
        val result = mutableListOf<String>()
        fun visit(entries: List<RichTimelineEntry>) {
            for (entry in entries) {
                when (entry) {
                    is RichTimelineEntry.Item -> {
                        result += entry.node.item.id
                        visit(entry.node.children)
                    }
                    is RichTimelineEntry.Group -> {
                        for (member in entry.members) {
                            result += member.item.id
                            visit(member.children)
                        }
                    }
                }
            }
        }
        visit(projection.visibleEntries)
        return result
    }

    /** Renderer parity: filtered anchors fall back to the nearest preceding visible non-user row. */
    fun resolveCompletedTurnAnchors(
        turns: List<RichCompletedTurn>,
        projection: RichTimelineProjection,
    ): List<RichCompletedTurn> {
        val visible = visibleItemIds(projection).toSet()
        val rawAnchors = turns.mapNotNull(RichCompletedTurn::anchorItemId).toSet()
        val resolution = mutableMapOf<String, String?>()
        var lastAnchorable: String? = null
        for (item in projection.rawItems) {
            if (item.id in visible && item.type != RichItemTypes.USER_MESSAGE) {
                lastAnchorable = item.id
            }
            if (item.id in rawAnchors) resolution[item.id] = lastAnchorable
        }
        val claimed = mutableSetOf<String>()
        return turns.map { turn ->
            val raw = turn.anchorItemId
            if (raw == null) return@map turn
            if (!resolution.containsKey(raw)) {
                claimed += raw
                return@map turn
            }
            val candidate = resolution[raw]
            val resolved = candidate?.takeUnless(claimed::contains)
            if (resolved != null) claimed += resolved
            if (resolved == raw) turn else turn.copy(anchorItemId = resolved)
        }
    }

    private fun safeParent(
        item: RichRuntimeItem,
        byId: Map<String, RichRuntimeItem>,
    ): String? {
        val direct = item.parentItemId ?: return null
        if (direct !in byId || direct == item.id) return null
        val seen = mutableSetOf(item.id)
        var current: String? = direct
        while (current != null) {
            if (!seen.add(current)) return null
            current = byId[current]?.parentItemId
            if (current != null && current !in byId) break
        }
        return direct
    }

    private fun visibleNodes(
        raw: RichRawTimelineNode,
        explicitHiddenId: String?,
        hidden: MutableSet<String>,
    ): List<RichVisibleTimelineNode> {
        val childNodes = raw.children.flatMap { visibleNodes(it, explicitHiddenId, hidden) }
        if (raw.item.id == explicitHiddenId || !isVisible(raw.item)) {
            hidden += raw.item.id
            // Hidden plumbing never discards useful descendants.
            return childNodes
        }
        return listOf(RichVisibleTimelineNode(raw.item, groupSiblings(childNodes)))
    }

    private fun groupSiblings(nodes: List<RichVisibleTimelineNode>): List<RichTimelineEntry> {
        val entries = mutableListOf<RichTimelineEntry>()
        var index = 0
        while (index < nodes.size) {
            val first = nodes[index]
            if (!isGroupable(first)) {
                entries += RichTimelineEntry.Item(first)
                index += 1
                continue
            }
            val members = mutableListOf(first)
            index += 1
            while (index < nodes.size && isGroupable(nodes[index])) {
                members += nodes[index]
                index += 1
            }
            entries += if (members.size == 1) {
                RichTimelineEntry.Item(first)
            } else {
                RichTimelineEntry.Group("tool-call-group:${first.item.id}", members)
            }
        }
        return entries
    }

    fun isVisible(item: RichRuntimeItem): Boolean {
        if (item.type in setOf(
                RichItemTypes.PLAN,
                RichItemTypes.GOAL,
                RichItemTypes.PENDING_REQUEST,
                RichItemTypes.ERROR,
            )
        ) {
            return false
        }
        if (item.type == RichItemTypes.ASSISTANT_MESSAGE &&
            item.state == RichItemState.COMPLETED &&
            !assistantHasContent(item)
        ) {
            return false
        }
        if (item.type in RichItemTypes.toolLike) {
            val payload = item.payload as? JsonObject
            val name = payload?.get("name")?.stringOrNull()
            val title = payload?.get("title")?.stringOrNull()
            if (isQuestionTool(name) || isQuestionTool(title)) return false
            if (isSuccessfulCrossagentSpawn(payload, name)) return false
            if (name.isNullOrBlank()) return false
        }
        return true
    }

    private fun assistantHasContent(item: RichRuntimeItem): Boolean {
        if (item.streams["assistant_text"].orEmpty().any { !it.isWhitespace() }) return true
        return RichContentDecoder.decodeMessageContent(item.payload)?.any { block ->
            block is RichContentBlock.Image ||
                block is RichContentBlock.Thread ||
                (block is RichContentBlock.Text && block.text.any { !it.isWhitespace() })
        } == true
    }

    private fun isGroupable(node: RichVisibleTimelineNode): Boolean {
        if (node.children.isNotEmpty() || node.item.type !in RichItemTypes.groupable) return false
        if (McpAppPresentation.from(node.item) != null) return false
        val payload = node.item.payload as? JsonObject
        if (node.item.type == RichItemTypes.TOOL_CALL && isStandaloneTool(payload)) return false
        if (node.item.type in RichItemTypes.toolLike && isDelegatedAgent(payload)) return false
        if (node.item.type in RichItemTypes.toolLike && RichImagePolicy.hasDisplayableImage(payload)) {
            return false
        }
        return true
    }

    private fun isStandaloneTool(payload: JsonObject?): Boolean {
        val name = payload?.get("name")?.stringOrNull() ?: return false
        if (name == "ExitPlanMode" || name == "exit_plan_mode") return true
        val normalized = name.lowercase().replace(Regex("[\\s_-]"), "")
        return normalized in setOf(
            "contextcompaction",
            "compactcontext",
            "conversationcompaction",
            "compactconversation",
        )
    }

    private fun isQuestionTool(value: String?): Boolean = value
        ?.trim()
        ?.matches(
            Regex(
                "^(?:ask[_ ]?user[_ ]?question|ask[_ ]?user\\b|ask user \\d+ questions?)(?::|\\b).*$",
                RegexOption.IGNORE_CASE,
            ),
        ) == true

    private fun isDelegatedAgent(payload: JsonObject?): Boolean {
        if (payload == null) return false
        if (payload["isSubAgent"]?.booleanOrStrictNull() == true) return true
        if (payload["isCrossagent"]?.booleanOrStrictNull() == true) return true
        if (payload["name"]?.stringOrNull() == "Workflow") return true
        val args = payload["args"]?.objectOrNull()
        return listOf("subagent_type", "agent_type", "agentType").any { key ->
            !args?.get(key)?.stringOrNull().isNullOrEmpty()
        }
    }

    private fun isSuccessfulCrossagentSpawn(payload: JsonObject?, name: String?): Boolean {
        if (payload?.get("status")?.stringOrNull() == "error") return false
        val lower = name?.lowercase() ?: return false
        return lower in setOf(
            "crossagents__spawn_agent",
            "crossagents_spawn_agent",
            "crossagents__run_agent",
            "crossagents_run_agent",
            "mcp__crossagents__spawn_agent",
            "mcp__crossagents__run_agent",
            "crossagents-mcp-server-spawn_agent",
            "crossagents-mcp-server-run_agent",
        )
    }
}

/**
 * Memoizes timeline projections across recompositions and applies the O(1)
 * streaming fast-path when only one active item's streams changed.
 */
class RichTimelineProjectionCache {
    private var lastItems: List<RichRuntimeItem>? = null
    private var lastProjection: RichTimelineProjection? = null

    /** Full O(N) rebuild counter (exposed for unit tests). */
    var fullRebuildCount: Int = 0
        private set

    /** In-place O(1) stream patch counter (exposed for unit tests). */
    var streamFastPathCount: Int = 0
        private set

    fun project(items: List<RichRuntimeItem>): RichTimelineProjection {
        val prevItems = lastItems
        val prevProjection = lastProjection
        if (prevItems === items && prevProjection != null) return prevProjection
        if (prevItems != null && prevProjection != null) {
            if (prevItems == items) {
                lastItems = items
                return prevProjection
            }
            val patched = RichTimeline.updatingStreamOnly(prevProjection, prevItems, items)
            if (patched != null) {
                lastItems = items
                lastProjection = patched
                streamFastPathCount += 1
                return patched
            }
        }
        val rebuilt = RichTimeline.project(items)
        lastItems = items
        lastProjection = rebuilt
        fullRebuildCount += 1
        return rebuilt
    }
}
