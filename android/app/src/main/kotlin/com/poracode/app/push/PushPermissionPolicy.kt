package com.poracode.app.push

import android.annotation.SuppressLint
import android.Manifest
import android.os.Build

@SuppressLint("InlinedApi")
object PushPermissionPolicy {
    const val PERMISSION = Manifest.permission.POST_NOTIFICATIONS

    enum class Action {
        Unavailable,
        Enabled,
        Request,
        OpenSettings,
    }

    fun action(
        configured: Boolean,
        sdkInt: Int = Build.VERSION.SDK_INT,
        granted: Boolean,
        previouslyRequested: Boolean,
    ): Action = when {
        !configured -> Action.Unavailable
        sdkInt < 33 || granted -> Action.Enabled
        previouslyRequested -> Action.OpenSettings
        else -> Action.Request
    }
}
