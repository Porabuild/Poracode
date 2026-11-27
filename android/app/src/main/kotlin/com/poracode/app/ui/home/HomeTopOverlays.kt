package com.poracode.app.ui.home

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.poracode.app.push.RemoteUserNotificationBanner

@Composable
internal fun HomeTopOverlays(
    notificationBanner: RemoteUserNotificationBanner?,
    onOpenNotification: (Long) -> Unit,
    onDismissNotification: (Long) -> Unit,
    failurePopupHostState: SnackbarHostState?,
    modifier: Modifier = Modifier,
) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        AnimatedContent(
            targetState = notificationBanner,
            modifier = Modifier.padding(12.dp),
            transitionSpec = {
                (fadeIn() + slideInVertically { -it / 2 }) togetherWith
                    (fadeOut() + slideOutVertically { -it / 2 })
            },
            label = "remote-user-notification",
        ) { banner ->
            if (banner != null) {
                RemoteUserNotificationBannerView(
                    banner = banner,
                    onOpen = { onOpenNotification(banner.id) },
                    onDismiss = { onDismissNotification(banner.id) },
                    modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp),
                )
            }
        }
        if (failurePopupHostState != null) {
            HomeFailurePopups(
                hostState = failurePopupHostState,
                modifier = Modifier.statusBarsPadding(),
                aboveDock = false,
            )
        }
    }
}
