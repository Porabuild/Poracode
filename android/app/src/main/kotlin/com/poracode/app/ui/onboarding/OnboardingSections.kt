package com.poracode.app.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.AppSession

/**
 * Repair banners for the phases that must not be bypassed. Each one keeps its own
 * explanation; the recovery *actions* are the always-visible Disconnect button below
 * the fold ("forget this desktop") and Connect inside the disclosure ("re-pair"),
 * which [OnboardingScreen] starts expanded in exactly these phases.
 */
@Composable
internal fun OnboardingRepairBanners(
    state: AppSession.UiState,
    protocolIncompatible: Boolean,
    localStoreInconsistent: Boolean,
) {
    if (localStoreInconsistent || state.phase == AppSession.Phase.LocalStoreInconsistent) {
        RepairBanner(
            icon = Icons.Outlined.ErrorOutline,
            title = stringResource(R.string.local_store_inconsistent_title),
            message = stringResource(R.string.local_store_inconsistent_message),
        )
    }
    if (protocolIncompatible || state.phase == AppSession.Phase.ProtocolIncompatible) {
        RepairBanner(
            icon = Icons.Outlined.WarningAmber,
            title = stringResource(R.string.protocol_incompatible_title),
            message = stringResource(R.string.protocol_incompatible_message),
        )
    }
    if (state.sessionExpired || state.phase == AppSession.Phase.SessionExpired) {
        RepairBanner(
            icon = Icons.Outlined.Lock,
            title = stringResource(R.string.session_expired_title),
            message = stringResource(R.string.session_expired_message),
        )
    }
}

@Composable
private fun RepairBanner(
    icon: ImageVector,
    title: String,
    message: String,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
                Text(message, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
internal fun OrDivider() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f))
        Text(
            stringResource(R.string.or_divider),
            modifier = Modifier.padding(horizontal = 12.dp),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider(modifier = Modifier.weight(1f))
    }
}

/**
 * Inline warning shown only when the endpoint the fields resolve to really is
 * cleartext LAN HTTP. The blocking cleartext *confirmation* is a separate gate on the
 * pairing path and is unaffected by this hint.
 */
@Composable
internal fun CleartextNotice() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            Icons.Outlined.WarningAmber,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.error,
        )
        Text(
            stringResource(R.string.pair_cleartext_warning),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
internal fun PairingErrorText(error: String) {
    val errorCd = stringResource(R.string.error_prefix, error)
    Text(
        error,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.semantics {
            contentDescription = errorCd
            liveRegion = LiveRegionMode.Polite
        },
    )
}

@Composable
internal fun ConnectButton(
    isPairing: Boolean,
    onClick: () -> Unit,
) {
    val connectCd = stringResource(R.string.connect_button)
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .semantics { contentDescription = connectCd },
        enabled = !isPairing,
        shape = RoundedCornerShape(16.dp),
    ) {
        if (isPairing) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
            )
        } else {
            Text(stringResource(R.string.connect_button))
        }
    }
}

/**
 * Forget/disconnect action. Lives outside the disclosure so the one route that repairs
 * a broken local store or an incompatible desktop is always reachable.
 */
@Composable
internal fun DisconnectButton(
    forgetInsteadOfDisconnect: Boolean,
    enabled: Boolean,
    onUnpair: () -> Unit,
) {
    val label = if (forgetInsteadOfDisconnect) {
        stringResource(R.string.session_expired_forget)
    } else {
        stringResource(R.string.disconnect)
    }
    OutlinedButton(
        onClick = onUnpair,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .semantics { contentDescription = label },
        shape = RoundedCornerShape(16.dp),
    ) {
        Text(label)
    }
}
