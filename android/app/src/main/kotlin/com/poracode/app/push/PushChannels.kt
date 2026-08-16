package com.poracode.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import com.poracode.app.R

object PushChannels {
    const val ATTENTION_ID = "poracode_attention_v1"
    const val STATUS_ID = "poracode_status_v1"

    fun create(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(
                    ATTENTION_ID,
                    context.getString(R.string.push_channel_attention_name),
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = context.getString(R.string.push_channel_attention_description)
                },
                NotificationChannel(
                    STATUS_ID,
                    context.getString(R.string.push_channel_status_name),
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = context.getString(R.string.push_channel_status_description)
                    setSound(null, null)
                    enableVibration(false)
                },
            ),
        )
    }

    fun forMessage(silent: Boolean): String = if (silent) STATUS_ID else ATTENTION_ID
}

