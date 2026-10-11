package com.poracode.app.ui.browsermirror

import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserTabPosition
import kotlin.math.min

data class BrowserMirrorRect(
    val left: Double,
    val top: Double,
    val width: Double,
    val height: Double,
)

data class BrowserMirrorPoint(val x: Double, val y: Double)

data class BrowserMirrorMappedImage(
    val left: Double,
    val top: Double,
    val width: Double,
    val height: Double,
    val deviceWidth: Double,
    val deviceHeight: Double,
) {
    fun point(x: Double, y: Double): BrowserMirrorPoint? {
        if (x < left || y < top || x > left + width || y > top + height) return null
        return BrowserMirrorPoint(
            x = (x - left) * deviceWidth / width,
            y = (y - top) * deviceHeight / height,
        )
    }

    fun scrollDelta(deltaX: Double, deltaY: Double): BrowserMirrorPoint = BrowserMirrorPoint(
        x = -deltaX * deviceWidth / width,
        y = -deltaY * deviceHeight / height,
    )
}

fun mapBrowserMirrorImage(
    image: BrowserMirrorRect,
    deviceWidth: Double,
    deviceHeight: Double,
): BrowserMirrorMappedImage? {
    if (image.width <= 0.0 || image.height <= 0.0 ||
        deviceWidth <= 0.0 || deviceHeight <= 0.0
    ) return null
    val scale = min(image.width / deviceWidth, image.height / deviceHeight)
    val renderedWidth = deviceWidth * scale
    val renderedHeight = deviceHeight * scale
    return BrowserMirrorMappedImage(
        left = image.left + (image.width - renderedWidth) / 2.0,
        top = image.top + (image.height - renderedHeight) / 2.0,
        width = renderedWidth,
        height = renderedHeight,
        deviceWidth = deviceWidth,
        deviceHeight = deviceHeight,
    )
}

sealed interface BrowserMirrorUiAction {
    data class Create(val url: String?) : BrowserMirrorUiAction
    data class Close(val tabId: String) : BrowserMirrorUiAction
    data class Activate(val tabId: String) : BrowserMirrorUiAction
    data class Move(
        val tabId: String,
        val targetTabId: String,
        val before: Boolean,
    ) : BrowserMirrorUiAction

    data class Navigate(val tabId: String, val url: String) : BrowserMirrorUiAction
    data class Back(val tabId: String) : BrowserMirrorUiAction
    data class Forward(val tabId: String) : BrowserMirrorUiAction
    data class Reload(val tabId: String) : BrowserMirrorUiAction
}

fun BrowserMirrorUiAction.toCommand(): BrowserCommand = when (this) {
    is BrowserMirrorUiAction.Create -> BrowserCommand.CreateTab(url?.takeIf(String::isNotBlank))
    is BrowserMirrorUiAction.Close -> BrowserCommand.CloseTab(tabId)
    is BrowserMirrorUiAction.Activate -> BrowserCommand.ActivateTab(tabId)
    is BrowserMirrorUiAction.Move -> BrowserCommand.MoveTab(
        tabId,
        targetTabId,
        if (before) BrowserTabPosition.Before else BrowserTabPosition.After,
    )
    is BrowserMirrorUiAction.Navigate -> BrowserCommand.Navigate(tabId, url.trim())
    is BrowserMirrorUiAction.Back -> BrowserCommand.Back(tabId)
    is BrowserMirrorUiAction.Forward -> BrowserCommand.Forward(tabId)
    is BrowserMirrorUiAction.Reload -> BrowserCommand.Reload(tabId)
}
