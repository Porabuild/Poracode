package com.poracode.app.push

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.poracode.app.MainActivity
import com.poracode.app.PoracodeApplication
import com.poracode.app.R

@Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
class PoracodeFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        (application as PoracodeApplication).push.onNewToken(token)
    }

    override fun onRegistered(token: String) {
        (application as PoracodeApplication).push.onNewToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val runtime = (application as PoracodeApplication).push
        if (!runtime.isForeground) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(
                this,
                PushPermissionPolicy.PERMISSION,
            ) != PackageManager.PERMISSION_GRANTED
        ) return
        val parsed = PushPayloadParser.parse(message.data)
        val route = (parsed as? PushPayloadParseResult.Routed)?.route
        val silent = message.notification?.channelId == PushChannels.STATUS_ID ||
            message.data["silent"] == "true"
        val tag = route?.let(PushCollapseIdentity::routed) ?: GENERIC_TAG
        val intent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_PUSH
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            route?.let {
                putExtra(PushPayloadParser.VERSION, it.version.toString())
                putExtra(PushPayloadParser.CONNECTION_ID, it.clientConnectionId)
                putExtra(PushPayloadParser.DESKTOP_ID, it.desktopId)
                putExtra(PushPayloadParser.THREAD_ID, it.threadId)
            }
        }
        val pending = PendingIntent.getActivity(
            this,
            tag.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, PushChannels.forMessage(silent))
            .setSmallIcon(R.drawable.ic_stat_poracode)
            .setContentTitle(getString(R.string.push_notification_title))
            .setContentText(getString(R.string.push_notification_body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(
                if (silent) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_HIGH,
            )
            .build()
        runCatching {
            NotificationManagerCompat.from(this).notify(tag, NOTIFICATION_ID, notification)
        }
    }

    companion object {
        const val ACTION_PUSH = "com.poracode.app.action.PUSH"
        private const val GENERIC_TAG = "poracode_generic_v1"
        private const val NOTIFICATION_ID = 1001
    }
}
