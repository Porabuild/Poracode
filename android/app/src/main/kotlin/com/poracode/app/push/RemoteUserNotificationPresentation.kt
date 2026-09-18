package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.string
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonElement

enum class RemoteUserNotificationCategory { Done, NeedsAttention, Error }

data class RemoteUserNotificationEvent(
    val threadId: String,
    val category: RemoteUserNotificationCategory,
    val projectName: String,
    val threadTitle: String,
    val status: String,
) {
    companion object {
        private val validStatuses = setOf(
            "inactive", "launching", "working", "idle", "finished",
            "needs_approval", "needs_reply", "error",
        )

        fun decodeIfPresent(value: JsonElement): RemoteUserNotificationEvent? {
            val objectValue = value.asObjectOrNull() ?: return null
            if (objectValue.string("type") != "remote-user-notification") return null
            val threadId = objectValue.string("threadId")
                ?.takeIf(PushPayloadParser::isSafeIdentifier)
                ?: invalid("threadId")
            val category = when (objectValue.string("category")) {
                "done" -> RemoteUserNotificationCategory.Done
                "needsAttention" -> RemoteUserNotificationCategory.NeedsAttention
                "error" -> RemoteUserNotificationCategory.Error
                else -> invalid("category")
            }
            val projectName = objectValue.string("projectName") ?: invalid("projectName")
            val threadTitle = objectValue.string("threadTitle") ?: invalid("threadTitle")
            val status = objectValue.string("status")
                ?.takeIf(validStatuses::contains)
                ?: invalid("status")
            return RemoteUserNotificationEvent(
                threadId,
                category,
                projectName,
                threadTitle,
                status,
            )
        }

        fun validateKnown(value: JsonElement) {
            decodeIfPresent(value)
        }

        private fun invalid(field: String): Nothing =
            throw IllegalArgumentException("Invalid remote user notification $field")
    }
}

data class RemoteUserNotificationBanner(
    val id: Long,
    val route: PushRouteV1,
    val notification: RemoteUserNotificationEvent,
)

class RemoteNotificationReplayGate {
    private var ceiling: Int = -1

    fun noteReady(seq: Int) {
        ceiling = seq
    }

    fun isReplay(seq: Int): Boolean = seq <= ceiling
}

class RemoteUserNotificationPresentationCenter(
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val deduplicationWindowMillis: Long = 15_000,
    private val shouldPresent: (RemoteUserNotificationEvent) -> Boolean = { true },
) {
    private enum class Source { WebSocket, Push }
    private data class Delivery(val source: Source, val receivedAt: Long)

    private val sequence = AtomicLong()
    private val recent = mutableMapOf<PushRouteV1, Delivery>()
    private val mutableBanner = MutableStateFlow<RemoteUserNotificationBanner?>(null)
    val banner: StateFlow<RemoteUserNotificationBanner?> = mutableBanner.asStateFlow()

    @Synchronized
    fun receiveWebSocket(
        notification: RemoteUserNotificationEvent,
        route: PushRouteV1,
        replay: Boolean,
        foreground: Boolean,
        threadOpen: Boolean,
    ) {
        if (replay || !foreground || !shouldPresent(notification)) return
        val now = nowMillis()
        prune(now)
        if (recent[route]?.source == Source.Push) return
        recent[route] = Delivery(Source.WebSocket, now)
        if (threadOpen) return
        mutableBanner.value = RemoteUserNotificationBanner(
            sequence.incrementAndGet(),
            route,
            notification,
        )
    }

    /** Returns false when a racing WebSocket event already presented this route. */
    @Synchronized
    fun shouldPresentPush(route: PushRouteV1): Boolean {
        val now = nowMillis()
        prune(now)
        if (recent[route]?.source == Source.WebSocket) return false
        recent[route] = Delivery(Source.Push, now)
        return true
    }

    @Synchronized
    fun retainHost(connectionId: ClientConnectionId?, desktopId: String?) {
        val connection = connectionId?.value
        recent.entries.removeAll {
            it.key.clientConnectionId != connection || it.key.desktopId != desktopId
        }
        val visible = mutableBanner.value
        if (visible != null && (
                visible.route.clientConnectionId != connection ||
                    visible.route.desktopId != desktopId
            )
        ) {
            mutableBanner.value = null
        }
    }

    fun dismiss(id: Long? = null) {
        val current = mutableBanner.value
        if (id == null || current?.id == id) mutableBanner.value = null
    }

    private fun prune(now: Long) {
        recent.entries.removeAll {
            val age = now - it.value.receivedAt
            age < 0 || age > deduplicationWindowMillis
        }
    }
}
