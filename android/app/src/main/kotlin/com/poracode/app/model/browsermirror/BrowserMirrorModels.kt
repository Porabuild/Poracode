package com.poracode.app.model.browsermirror

data class BrowserTab(
    val tabId: String,
    val url: String,
    val title: String,
    val faviconUrl: String?,
    val loading: Boolean,
    val canGoBack: Boolean,
    val canGoForward: Boolean,
)

data class BrowserState(
    val tabs: List<BrowserTab>,
    val activeTabId: String?,
) {
    val activeTab: BrowserTab? get() = tabs.firstOrNull { it.tabId == activeTabId }
}

enum class BrowserTabPosition { Before, After }

sealed interface BrowserCommand {
    data class CreateTab(val url: String? = null) : BrowserCommand
    data class CloseTab(val tabId: String) : BrowserCommand
    data class ActivateTab(val tabId: String) : BrowserCommand
    data class MoveTab(
        val tabId: String,
        val targetTabId: String,
        val position: BrowserTabPosition,
    ) : BrowserCommand

    data class Navigate(val tabId: String, val url: String) : BrowserCommand
    data class Back(val tabId: String) : BrowserCommand
    data class Forward(val tabId: String) : BrowserCommand
    data class Reload(val tabId: String) : BrowserCommand
}

enum class BrowserSafeKey(val wireValue: String) {
    Enter("enter"),
    Backspace("backspace"),
    Tab("tab"),
    Escape("escape"),
    ArrowUp("arrow-up"),
    ArrowDown("arrow-down"),
    ArrowLeft("arrow-left"),
    ArrowRight("arrow-right"),
    ;

    companion object {
        fun fromWire(value: String): BrowserSafeKey? = entries.firstOrNull {
            it.wireValue == value
        }
    }
}

sealed interface BrowserInput {
    data class Tap(val x: Double, val y: Double) : BrowserInput

    data class Scroll(
        val x: Double,
        val y: Double,
        val deltaX: Double,
        val deltaY: Double,
    ) : BrowserInput

    data class InsertText(val text: String) : BrowserInput {
        init {
            require(text.isNotEmpty() && text.length <= MAX_UTF16_UNITS)
        }
    }

    data class Key(val key: BrowserSafeKey) : BrowserInput

    companion object {
        const val MAX_UTF16_UNITS = 1024
    }
}

data class BrowserFrameMetadata(
    val deviceWidth: Double,
    val deviceHeight: Double,
    val pageScaleFactor: Double,
    val offsetTop: Double,
    val scrollOffsetX: Double,
    val scrollOffsetY: Double,
)

class BrowserFrame(
    val tabId: String,
    val jpegBytes: ByteArray,
    val metadata: BrowserFrameMetadata,
)

enum class BrowserMirrorAvailability { Starting, Active, Unavailable }

data class BrowserMirrorStatus(
    val availability: BrowserMirrorAvailability,
    val tabId: String?,
)

sealed interface BrowserServerMessage {
    data class State(val state: BrowserState) : BrowserServerMessage
    data class Frame(val frame: BrowserFrame) : BrowserServerMessage
    data class Status(val status: BrowserMirrorStatus) : BrowserServerMessage
}
