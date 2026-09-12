package com.poracode.app.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.AppSession

/**
 * BROWSABLE deep-link / scanned-link confirmation gate.
 *
 * Shows the sanitized host only — never the token. This gate must always own the
 * whole screen so a link can never silently replace an existing desktop.
 */
@Composable
internal fun PendingPairConfirmCard(
    pending: AppSession.PendingPairConfirmUi,
    replacesExisting: Boolean,
    isPairing: Boolean,
    onConfirmPendingPair: (() -> Unit)?,
    onCancelPendingPair: (() -> Unit)?,
) {
    val confirmCd = stringResource(R.string.confirm_pair_button)
    val cancelCd = stringResource(R.string.cancel_pair_button)
    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        ),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Outlined.VerifiedUser,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(
                stringResource(R.string.confirm_pair_title),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                stringResource(R.string.confirm_pair_message, pending.sanitizedHost),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription =
                        "Confirm pairing with host ${pending.sanitizedHost}"
                },
            )
            if (replacesExisting) {
                Text(
                    stringResource(R.string.confirm_pair_replace_warning),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(
                    onClick = { onConfirmPendingPair?.invoke() },
                    enabled = !isPairing && onConfirmPendingPair != null,
                    modifier = Modifier.semantics { contentDescription = confirmCd },
                ) {
                    Text(stringResource(R.string.confirm_pair_button))
                }
                TextButton(
                    onClick = { onCancelPendingPair?.invoke() },
                    enabled = onCancelPendingPair != null,
                    modifier = Modifier.semantics { contentDescription = cancelCd },
                ) {
                    Text(stringResource(R.string.cancel_pair_button))
                }
            }
        }
    }
}
