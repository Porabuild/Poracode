package com.poracode.app.push

import android.content.Intent

object PushIntentBridge {
    /** Copies only route fields and burns every extra before any coroutine can start. */
    fun consume(intent: Intent?): PushPayloadParseResult {
        val extras = intent?.extras ?: return PushPayloadParseResult.NotRoutable
        val copied = PushPayloadParser.routeKeys.associateWith { key ->
            extras.getString(key)
        }
        intent.replaceExtras(null)
        return PushPayloadParser.parse(copied)
    }
}
