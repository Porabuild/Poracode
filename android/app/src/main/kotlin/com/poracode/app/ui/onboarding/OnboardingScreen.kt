package com.poracode.app.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.protocol.LocalNetworkAccess
import com.poracode.app.protocol.PairingUrl
import com.poracode.app.session.AppSession

/**
 * First-run pairing surface. Same information architecture as the iOS and web clients:
 * app mark, the Pora·code wordmark, one line of instruction, then **scanning the
 * desktop pairing code** as the single visible route. Pasting a link and endpoint +
 * one-time token entry live in a Material bottom sheet together with Connect;
 * Disconnect stays outside it so a broken pairing is always repairable.
 *
 * Every consent and repair gate is preserved:
 * - [AppSession.UiState.pendingPairConfirm] still owns the whole screen and shows the
 *   sanitized host only, never the token;
 * - the scanner hands decoded links to the same [onPair] call as a pasted link, so the
 *   local-network permission and cleartext confirmation downstream still run;
 * - the expired / incompatible / inconsistent phases keep their banners, keep Connect
 *   reachable as "re-pair" (the sheet starts open there), and keep the
 *   forget action on the always-visible Disconnect button.
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun OnboardingScreen(
    state: AppSession.UiState,
    onPair: (AppSession.PairingInput) -> Unit,
    onUnpair: (() -> Unit)? = null,
    protocolIncompatible: Boolean = false,
    localStoreInconsistent: Boolean = false,
    onConfirmPendingPair: (() -> Unit)? = null,
    onCancelPendingPair: (() -> Unit)? = null,
) {
    // Pairing link + one-time token are secrets: must NOT use rememberSaveable
    // (must not survive process death / saved-instance state).
    var pairingLink by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    // Base URL contains no credential and may survive configuration changes.
    var baseUrl by rememberSaveable { mutableStateOf("") }
    var scannerVisible by rememberSaveable { mutableStateOf(false) }
    var clipboardEmpty by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val repairPhase = isRepairPhase(state, protocolIncompatible, localStoreInconsistent)
    val otherWaysSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    // Repair phases open the sheet immediately because Connect is their recovery action.
    // Ordinary first launch remains scan-first even on an emulator: scanner guidance
    // owns camera availability and can reveal the manual routes after the user's tap.
    var otherWaysVisible by rememberSaveable {
        mutableStateOf(
            state.pendingPairConfirm == null && repairPhase,
        )
    }

    // Clear secrets immediately after successful pairing consumption or cancel.
    LaunchedEffect(state.phase, state.isPairing, state.pendingPairConfirm) {
        if (!state.isPairing && state.phase == AppSession.Phase.Ready &&
            state.pendingPairConfirm == null
        ) {
            pairingLink = ""
            token = ""
        }
    }

    // A pairing attempt or a consent gate always owns the screen: never leave the
    // camera streaming behind them.
    LaunchedEffect(state.isPairing, state.pendingPairConfirm) {
        if (state.isPairing || state.pendingPairConfirm != null) scannerVisible = false
        if (state.pendingPairConfirm != null) otherWaysVisible = false
    }

    // A phase can turn into a repair state while this screen is already open.
    LaunchedEffect(repairPhase) {
        if (repairPhase) otherWaysVisible = true
    }

    val submit: (String) -> Unit = { link ->
        onPair(
            AppSession.PairingInput(
                pairingUrlOrEmpty = link,
                manualBaseUrl = baseUrl,
                manualToken = token,
            ),
        )
    }

    if (scannerVisible) {
        PairingScanScreen(
            onDismiss = { scannerVisible = false },
            // Both scanner fallbacks reveal the routes the scanner was hiding.
            onUseLinkInstead = {
                scannerVisible = false
                otherWaysVisible = true
            },
            onPairingLinkScanned = { decoded ->
                scannerVisible = false
                // Same input shape as the pasted-link route, so every downstream gate
                // (local-network permission, cleartext policy, pending confirmation)
                // behaves identically.
                pairingLink = decoded
                clipboardEmpty = false
                // A declined cleartext confirmation must leave the prefilled link and
                // its warning on screen, not behind a collapsed disclosure.
                if (isCleartextLan(decoded, baseUrl, token)) otherWaysVisible = true
                submit(decoded)
            },
        )
        return
    }

    val cleartextEndpoint = remember(pairingLink, baseUrl, token) {
        LocalNetworkAccess.pairingEndpoint(pairingLink, baseUrl, token)
            ?.takeIf(PairingUrl::isCleartextLanUrl)
    }

    if (otherWaysVisible) {
        ModalBottomSheet(
            onDismissRequest = { otherWaysVisible = false },
            sheetState = otherWaysSheetState,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Text(
                    stringResource(R.string.pair_other_ways),
                    style = MaterialTheme.typography.titleLarge,
                )
                OtherWaysSheetContent(
                    pairingLink = pairingLink,
                    onPairingLinkChange = {
                        pairingLink = it
                        clipboardEmpty = false
                    },
                    baseUrl = baseUrl,
                    onBaseUrlChange = { baseUrl = it },
                    token = token,
                    onTokenChange = { token = it },
                    enabled = !state.isPairing,
                    clipboardEmpty = clipboardEmpty,
                    onPaste = {
                        val pasted = readClipboardText(context)
                        if (pasted.isNullOrBlank()) {
                            clipboardEmpty = true
                        } else {
                            pairingLink = pasted
                            clipboardEmpty = false
                        }
                    },
                    showsCleartextHint = cleartextEndpoint != null,
                    connect = {
                        ConnectButton(
                            isPairing = state.isPairing,
                            onClick = { submit(pairingLink) },
                        )
                    },
                )
                state.globalError?.let { error -> PairingErrorText(error) }
            }
        }
    }

    Box(
        modifier = Modifier.fillMaxSize(),
    ) {
        OnboardingBackdrop()
        val pending = state.pendingPairConfirm
        if (pending != null || repairPhase || onUnpair != null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Column(
                    modifier = Modifier.widthIn(max = 560.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    // BROWSABLE deep-link confirmation: sanitized host only; never the token.
                    if (pending != null) {
                        PendingPairConfirmCard(
                            pending = pending,
                            replacesExisting = state.profile != null,
                            isPairing = state.isPairing,
                            onConfirmPendingPair = onConfirmPendingPair,
                            onCancelPendingPair = onCancelPendingPair,
                        )
                    } else {
                        OnboardingHero()

                        OnboardingRepairBanners(
                            state = state,
                            protocolIncompatible = protocolIncompatible,
                            localStoreInconsistent = localStoreInconsistent,
                        )

                        ScanPairingCard(
                            enabled = !state.isPairing,
                            onScan = {
                                clipboardEmpty = false
                                scannerVisible = true
                            },
                        )

                        OtherWaysButton(
                            enabled = !state.isPairing,
                            onClick = { otherWaysVisible = true },
                        )

                        state.globalError?.let { error -> PairingErrorText(error) }

                        if (onUnpair != null) {
                            DisconnectButton(
                                forgetInsteadOfDisconnect = protocolIncompatible ||
                                    localStoreInconsistent ||
                                    state.phase == AppSession.Phase.ProtocolIncompatible ||
                                    state.phase == AppSession.Phase.LocalStoreInconsistent,
                                enabled = !state.isPairing,
                                onUnpair = onUnpair,
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(horizontal = 20.dp, vertical = 16.dp)
                    .widthIn(max = 560.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.weight(1f))
                OnboardingHero()
                Spacer(Modifier.weight(1f))
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ScanPairingCard(
                        enabled = !state.isPairing,
                        onScan = {
                            clipboardEmpty = false
                            scannerVisible = true
                        },
                    )
                    OtherWaysButton(
                        enabled = !state.isPairing,
                        onClick = { otherWaysVisible = true },
                    )
                    state.globalError?.let { error -> PairingErrorText(error) }
                    // Match the compact web screen's reserved space beneath
                    // the first-launch actions without shifting repair flows.
                    Spacer(Modifier.height(120.dp))
                }
            }
        }
    }
}

/**
 * Phases where the manual-routes sheet must open immediately: `sessionExpired` and
 * `protocolIncompatible` reuse Connect as the repair action, and
 * `localStoreInconsistent` is a broken state where every route should be obvious.
 * Ordinary `needsPairing` / `connecting` stay scan-first.
 */
private fun isRepairPhase(
    state: AppSession.UiState,
    protocolIncompatible: Boolean,
    localStoreInconsistent: Boolean,
): Boolean = protocolIncompatible ||
    localStoreInconsistent ||
    state.sessionExpired ||
    state.phase == AppSession.Phase.SessionExpired ||
    state.phase == AppSession.Phase.ProtocolIncompatible ||
    state.phase == AppSession.Phase.LocalStoreInconsistent

private fun isCleartextLan(pairingLink: String, baseUrl: String, token: String): Boolean =
    LocalNetworkAccess.pairingEndpoint(pairingLink, baseUrl, token)
        ?.let(PairingUrl::isCleartextLanUrl) == true
