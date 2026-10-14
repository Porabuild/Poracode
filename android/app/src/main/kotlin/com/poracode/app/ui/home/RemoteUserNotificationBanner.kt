package com.poracode.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material.icons.outlined.MarkChatUnread
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.push.RemoteUserNotificationBanner
import com.poracode.app.push.RemoteUserNotificationCategory

@Composable
internal fun RemoteUserNotificationBannerView(
    banner: RemoteUserNotificationBanner,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val notification = banner.notification
    Card(
        modifier = modifier.fillMaxWidth().clickable(onClick = onOpen),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
    ) {
        Row(
            Modifier.padding(start = 16.dp, top = 10.dp, bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                notification.category.icon(),
                contentDescription = null,
                tint = notification.category.color(),
            )
            Column(Modifier.weight(1f)) {
                Text(notification.projectName, style = MaterialTheme.typography.titleSmall)
                Text(notification.threadTitle, maxLines = 1)
                Text(
                    notification.category.label(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null)
            IconButton(onClick = onDismiss) {
                Icon(
                    Icons.Outlined.Close,
                    stringResource(R.string.remote_notification_dismiss),
                )
            }
        }
    }
}

private fun RemoteUserNotificationCategory.icon(): ImageVector = when (this) {
    RemoteUserNotificationCategory.Done -> Icons.Outlined.CheckCircle
    RemoteUserNotificationCategory.NeedsAttention -> Icons.Outlined.MarkChatUnread
    RemoteUserNotificationCategory.Error -> Icons.Outlined.Error
}

@Composable
private fun RemoteUserNotificationCategory.color() = when (this) {
    RemoteUserNotificationCategory.Done -> MaterialTheme.colorScheme.tertiary
    RemoteUserNotificationCategory.NeedsAttention -> MaterialTheme.colorScheme.primary
    RemoteUserNotificationCategory.Error -> MaterialTheme.colorScheme.error
}

@Composable
private fun RemoteUserNotificationCategory.label(): String = stringResource(
    when (this) {
        RemoteUserNotificationCategory.Done -> R.string.remote_notification_done
        RemoteUserNotificationCategory.NeedsAttention ->
            R.string.remote_notification_needs_attention
        RemoteUserNotificationCategory.Error -> R.string.remote_notification_error
    },
)
