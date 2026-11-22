package com.poracode.app.session.richchat

import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.protocol.richchat.ResolvedToolBody
import com.poracode.app.protocol.richchat.RuntimeItemHeading
import com.poracode.app.protocol.richchat.RuntimeItemHeadingRequest
import com.poracode.app.transport.richchat.RichChatAdvisoryClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class RichChatAdvisoryState(
    val threadId: String? = null,
    val headingsByItemId: Map<String, RuntimeItemHeading> = emptyMap(),
    val bodiesByItemId: Map<String, ResolvedToolBody> = emptyMap(),
    val fullItemsByItemId: Map<String, RichRuntimeItem> = emptyMap(),
    val loadingItemIds: Set<String> = emptySet(),
    val failedItemIds: Set<String> = emptySet(),
    val presentationsUnsupported: Boolean = false,
)

/**
 * Ephemeral per-thread advisory presentation & deferred-history-item controller.
 * Keeps large fetched bodies bound to the active thread lease and clears them on
 * thread switch or host disconnect (matching iOS `RichDeferredHistoryRead`).
 */
class RichChatAdvisoryController(
    private val advisoryClientProvider: suspend () -> RichChatAdvisoryClient?,
) {
    private val mutableState = MutableStateFlow(RichChatAdvisoryState())
    val state: StateFlow<RichChatAdvisoryState> = mutableState.asStateFlow()

    fun reset(threadId: String? = null) {
        mutableState.value = RichChatAdvisoryState(threadId = threadId)
    }

    suspend fun loadHeadings(
        threadId: String,
        requests: List<RuntimeItemHeadingRequest>,
    ) {
        if (requests.isEmpty() || mutableState.value.presentationsUnsupported) return
        val client = advisoryClientProvider() ?: return
        val pending = requests.filterNot { it.itemId in mutableState.value.headingsByItemId }
        if (pending.isEmpty()) return
        try {
            val records = client.readRuntimeItemHeadings(threadId, pending.take(32))
            if (mutableState.value.threadId != null && mutableState.value.threadId != threadId) return
            mutableState.update { current ->
                current.copy(
                    threadId = threadId,
                    headingsByItemId = current.headingsByItemId + records.associate { it.request.itemId to it.heading },
                )
            }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Throwable) {
            if (RichChatAdvisoryClient.isUnsupported(error)) {
                mutableState.update { it.copy(presentationsUnsupported = true) }
            }
        }
    }

    suspend fun loadToolBody(
        threadId: String,
        request: RuntimeItemHeadingRequest,
    ) {
        if (mutableState.value.presentationsUnsupported) return
        val client = advisoryClientProvider() ?: return
        if (request.itemId in mutableState.value.bodiesByItemId) return
        try {
            val records = client.readRuntimeToolBodies(threadId, listOf(request))
            if (mutableState.value.threadId != null && mutableState.value.threadId != threadId) return
            mutableState.update { current ->
                current.copy(
                    threadId = threadId,
                    bodiesByItemId = current.bodiesByItemId + records.associate { it.request.itemId to it.body },
                )
            }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Throwable) {
            if (RichChatAdvisoryClient.isUnsupported(error)) {
                mutableState.update { it.copy(presentationsUnsupported = true) }
            }
        }
    }

    suspend fun loadDeferredHistoryItem(
        threadId: String,
        itemId: String,
    ): RichRuntimeItem? {
        val client = advisoryClientProvider() ?: return null
        mutableState.update {
            it.copy(
                threadId = threadId,
                loadingItemIds = it.loadingItemIds + itemId,
                failedItemIds = it.failedItemIds - itemId,
            )
        }
        return try {
            val item = client.readHistoryItem(threadId, itemId)
            if (mutableState.value.threadId != null && mutableState.value.threadId != threadId) return null
            mutableState.update {
                it.copy(
                    fullItemsByItemId = it.fullItemsByItemId + (itemId to item),
                    loadingItemIds = it.loadingItemIds - itemId,
                    failedItemIds = it.failedItemIds - itemId,
                )
            }
            item
        } catch (cancel: CancellationException) {
            mutableState.update { it.copy(loadingItemIds = it.loadingItemIds - itemId) }
            throw cancel
        } catch (_: Throwable) {
            mutableState.update {
                it.copy(
                    loadingItemIds = it.loadingItemIds - itemId,
                    failedItemIds = it.failedItemIds + itemId,
                )
            }
            null
        }
    }
}
