package com.poracode.app.ui.onboarding

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.QrCode2
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.poracode.app.R

/** The primary — and on most devices the only necessary — pairing route. */
@Composable
internal fun ScanPairingCard(
    enabled: Boolean,
    onScan: () -> Unit,
) {
    val scanCd = stringResource(R.string.pair_scan_card_action)
    val shape = RoundedCornerShape(24.dp)
    Card(
        onClick = onScan,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("onboarding_scan_qr")
            .border(1.dp, Color.White.copy(alpha = 0.10f), shape)
            .semantics(mergeDescendants = true) {
                contentDescription = scanCd
                role = Role.Button
            },
        shape = shape,
        colors = CardDefaults.cardColors(
            // Keep the code wall subdued without turning the glass card gray.
            // This mirrors the PWA's mostly opaque near-black surface.
            containerColor = Color(0xE617161B),
            contentColor = OnboardingForeground,
        ),
    ) {
        Row(
            modifier = Modifier.padding(18.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(17.dp))
                    .background(
                        OnboardingViolet.copy(alpha = 0.14f),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.QrCode2,
                    contentDescription = null,
                    tint = OnboardingViolet,
                    modifier = Modifier.size(28.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    stringResource(R.string.pair_scan_card_title),
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    stringResource(R.string.pair_scan_card_message),
                    style = MaterialTheme.typography.bodySmall,
                    color = OnboardingMuted,
                )
            }
            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                contentDescription = null,
                tint = OnboardingMuted,
            )
        }
    }
}

/**
 * Opens the secondary pairing routes in the Material bottom sheet.
 */
@Composable
internal fun OtherWaysButton(
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val actionCd = stringResource(R.string.pair_other_ways)
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .testTag("onboarding_manual_toggle")
            .semantics(mergeDescendants = true) {
                contentDescription = actionCd
                role = Role.Button
            },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Outlined.MoreHoriz,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = OnboardingMuted,
            )
            Text(
                stringResource(R.string.pair_other_ways),
                style = MaterialTheme.typography.titleSmall,
                color = OnboardingMuted,
            )
            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                contentDescription = null,
                tint = OnboardingMuted,
            )
        }
    }
}

/** Paste-link and manual-entry routes shown inside the Material bottom sheet. */
@Composable
internal fun OtherWaysSheetContent(
    pairingLink: String,
    onPairingLinkChange: (String) -> Unit,
    baseUrl: String,
    onBaseUrlChange: (String) -> Unit,
    token: String,
    onTokenChange: (String) -> Unit,
    enabled: Boolean,
    clipboardEmpty: Boolean,
    onPaste: () -> Unit,
    showsCleartextHint: Boolean,
    connect: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PairingLinkFields(
            pairingLink = pairingLink,
            onPairingLinkChange = onPairingLinkChange,
            enabled = enabled,
            clipboardEmpty = clipboardEmpty,
            onPaste = onPaste,
        )
        OrDivider()
        ManualConnectionFields(
            baseUrl = baseUrl,
            onBaseUrlChange = onBaseUrlChange,
            token = token,
            onTokenChange = onTokenChange,
            enabled = enabled,
        )
        if (showsCleartextHint) CleartextNotice()
        connect()
    }
}

@Composable
private fun PairingLinkFields(
    pairingLink: String,
    onPairingLinkChange: (String) -> Unit,
    enabled: Boolean,
    clipboardEmpty: Boolean,
    onPaste: () -> Unit,
) {
    val pairingLinkCd = stringResource(R.string.pairing_link_label)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Outlined.Link,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.pairing_link_label),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            TextButton(
                onClick = onPaste,
                enabled = enabled,
                modifier = Modifier.testTag("onboarding_paste_link"),
            ) {
                Icon(
                    Icons.Outlined.ContentPaste,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    stringResource(R.string.pair_link_paste),
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
        OutlinedTextField(
            value = pairingLink,
            onValueChange = onPairingLinkChange,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = pairingLinkCd },
            placeholder = { Text(stringResource(R.string.pairing_link_placeholder)) },
            minLines = 2,
            maxLines = 4,
            shape = RoundedCornerShape(16.dp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            enabled = enabled,
        )
        if (clipboardEmpty) {
            Text(
                stringResource(R.string.pair_link_clipboard_empty),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

/**
 * Endpoint + one-time token. Never removed: on first run this screen is the only way
 * in, so a device with no camera and no clipboard must still be able to pair.
 */
@Composable
private fun ManualConnectionFields(
    baseUrl: String,
    onBaseUrlChange: (String) -> Unit,
    token: String,
    onTokenChange: (String) -> Unit,
    enabled: Boolean,
) {
    val baseUrlCd = stringResource(R.string.server_base_url)
    val tokenCd = stringResource(R.string.one_time_pairing_token)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Outlined.Tune,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.manual_connection),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.semantics { heading() },
            )
        }
        OutlinedTextField(
            value = baseUrl,
            onValueChange = onBaseUrlChange,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = baseUrlCd },
            label = { Text(stringResource(R.string.server_base_url)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            singleLine = true,
            shape = RoundedCornerShape(16.dp),
            enabled = enabled,
        )
        OutlinedTextField(
            value = token,
            onValueChange = onTokenChange,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = tokenCd },
            label = { Text(stringResource(R.string.one_time_pairing_token)) },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            shape = RoundedCornerShape(16.dp),
            enabled = enabled,
        )
    }
}

/**
 * Reads the clipboard through the platform manager (no Compose clipboard API churn).
 * The value is never persisted: it goes straight into the in-memory link field.
 */
internal fun readClipboardText(context: Context): String? {
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        ?: return null
    val clip = manager.primaryClip ?: return null
    for (index in 0 until clip.itemCount) {
        val text = clip.getItemAt(index).coerceToText(context)?.toString()?.trim()
        if (!text.isNullOrEmpty()) return text
    }
    return null
}
