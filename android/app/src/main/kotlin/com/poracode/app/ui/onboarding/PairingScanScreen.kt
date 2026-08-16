package com.poracode.app.ui.onboarding

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.PredictiveBackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.NoPhotography
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.VideocamOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.poracode.app.R
import com.poracode.app.protocol.PairingUrl
import com.poracode.app.ui.components.rememberReducedMotion
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private enum class CameraPermissionStatus {
    /** First ask in flight (or awaiting the system dialog). */
    Requesting,
    Granted,

    /** Denied, but the system still allows another prompt. */
    Denied,

    /** Permanently denied: only system settings can re-enable it. */
    Blocked,
}

/**
 * Full-screen pairing QR scanner.
 *
 * A decoded value is accepted only when [PairingUrl.parseParts] recognizes it as a
 * pairing link; anything else keeps the camera running and shows an inline
 * correction, so a stray QR code never drops the user back to the start. Accepted
 * links are handed to [onPairingLinkScanned], which routes them through the same
 * pairing path as a pasted link — every downstream consent gate still fires.
 */
@Composable
internal fun PairingScanScreen(
    onDismiss: () -> Unit,
    onUseLinkInstead: () -> Unit,
    onPairingLinkScanned: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val reducedMotion = rememberReducedMotion()
    val hasCameraHardware = remember(context) {
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
    }
    var permission by remember {
        mutableStateOf(
            if (hasCameraPermission(context)) {
                CameraPermissionStatus.Granted
            } else {
                CameraPermissionStatus.Requesting
            },
        )
    }
    var askedOnce by remember { mutableStateOf(false) }
    var cameraStatus by remember { mutableStateOf(ScanCameraStatus.Starting) }
    var bindAttempt by remember { mutableIntStateOf(0) }
    var invalidCode by remember { mutableStateOf<String?>(null) }
    var accepted by remember { mutableStateOf(false) }
    var backProgress by remember { mutableFloatStateOf(0f) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permission = when {
            granted -> CameraPermissionStatus.Granted
            // Rationale still allowed → the user can be asked again. Rationale
            // suppressed after a denial → permanently denied ("don't ask again").
            context.findActivity()
                ?.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) == true ->
                CameraPermissionStatus.Denied
            else -> CameraPermissionStatus.Blocked
        }
    }

    // Point of use: the user tapped the scan target, so ask right here, once.
    LaunchedEffect(hasCameraHardware, permission) {
        if (hasCameraHardware &&
            permission == CameraPermissionStatus.Requesting &&
            !askedOnce
        ) {
            askedOnce = true
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    // Coming back from system settings (or any other grant path) resumes the camera.
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            if (hasCameraPermission(context)) permission = CameraPermissionStatus.Granted
        }
    }

    // Anti-hang guard: a camera stack that never reports back (emulators without a
    // virtual camera, wedged camera service) must land on the recoverable pane
    // instead of an endless spinner.
    LaunchedEffect(permission, cameraStatus, bindAttempt) {
        if (permission == CameraPermissionStatus.Granted &&
            cameraStatus == ScanCameraStatus.Starting
        ) {
            delay(CAMERA_START_TIMEOUT_MS)
            if (cameraStatus == ScanCameraStatus.Starting) {
                cameraStatus = ScanCameraStatus.Failed
            }
        }
    }

    LaunchedEffect(invalidCode) {
        if (invalidCode != null) {
            delay(INVALID_CODE_NOTICE_MS)
            invalidCode = null
        }
    }

    PredictiveBackHandler { progress ->
        try {
            progress.collect { event ->
                backProgress = if (reducedMotion) 0f else event.progress
            }
            onDismiss()
        } catch (cancelled: CancellationException) {
            backProgress = 0f
        }
    }

    val onDarkSurface = hasCameraHardware && permission == CameraPermissionStatus.Granted &&
        (cameraStatus == ScanCameraStatus.Streaming || cameraStatus == ScanCameraStatus.Starting)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer {
                val shrink = 1f - 0.08f * backProgress
                scaleX = shrink
                scaleY = shrink
                alpha = 1f - 0.2f * backProgress
            }
            .background(if (onDarkSurface) Color.Black else MaterialTheme.colorScheme.surface),
    ) {
        when {
            !hasCameraHardware -> NoCameraPane(onUseLinkInstead)
            permission == CameraPermissionStatus.Granted -> {
                PairingScanCamera(
                    active = !accepted,
                    bindAttempt = bindAttempt,
                    onDecoded = { decoded ->
                        if (!accepted) {
                            if (PairingUrl.parseParts(decoded) != null) {
                                accepted = true
                                invalidCode = null
                                onPairingLinkScanned(decoded)
                            } else {
                                // Keep scanning: a stray QR code is a correction, not an exit.
                                invalidCode = decoded
                            }
                        }
                    },
                    onStatus = { cameraStatus = it },
                    modifier = Modifier.fillMaxSize(),
                )
                when (cameraStatus) {
                    ScanCameraStatus.Starting -> StartingCameraOverlay()
                    ScanCameraStatus.Streaming -> PairingScanOverlay(
                        hint = stringResource(R.string.scan_frame_hint),
                        caption = stringResource(R.string.scan_desktop_caption),
                        invalidMessage = invalidCode?.let {
                            stringResource(R.string.scan_invalid_code)
                        },
                        reducedMotion = reducedMotion,
                    )
                    ScanCameraStatus.NoCamera -> NoCameraPane(onUseLinkInstead)
                    ScanCameraStatus.Failed -> ScanMessagePane(
                        icon = Icons.Outlined.VideocamOff,
                        title = stringResource(R.string.scan_camera_failed_title),
                        message = stringResource(R.string.scan_camera_failed_message),
                        primaryLabel = stringResource(R.string.scan_camera_try_again),
                        primaryTestTag = "qr_scanner_retry",
                        onPrimary = {
                            cameraStatus = ScanCameraStatus.Starting
                            bindAttempt += 1
                        },
                        onUseLinkInstead = onUseLinkInstead,
                    )
                }
            }
            permission == CameraPermissionStatus.Denied -> ScanMessagePane(
                icon = Icons.Outlined.PhotoCamera,
                title = stringResource(R.string.scan_camera_permission_denied_title),
                message = stringResource(R.string.scan_camera_permission_denied_message),
                primaryLabel = stringResource(R.string.scan_camera_permission_allow),
                primaryTestTag = "qr_scanner_grant_camera",
                onPrimary = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                onUseLinkInstead = onUseLinkInstead,
            )
            permission == CameraPermissionStatus.Blocked -> ScanMessagePane(
                icon = Icons.Outlined.PhotoCamera,
                title = stringResource(R.string.scan_camera_permission_blocked_title),
                message = stringResource(R.string.scan_camera_permission_blocked_message),
                primaryLabel = stringResource(R.string.scan_camera_open_settings),
                primaryTestTag = "qr_scanner_open_settings",
                onPrimary = { openAppSettings(context) },
                onUseLinkInstead = onUseLinkInstead,
            )
            else -> ScanMessagePane(
                icon = Icons.Outlined.PhotoCamera,
                title = stringResource(R.string.scan_camera_permission_title),
                message = stringResource(R.string.scan_camera_permission_message),
                primaryLabel = stringResource(R.string.scan_camera_permission_allow),
                primaryTestTag = "qr_scanner_grant_camera",
                onPrimary = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                onUseLinkInstead = onUseLinkInstead,
            )
        }

        ScanTopBar(onClose = onDismiss, onDarkSurface = onDarkSurface)
    }
}

@Composable
private fun ScanTopBar(onClose: () -> Unit, onDarkSurface: Boolean) {
    val tint = if (onDarkSurface) Color.White else MaterialTheme.colorScheme.onSurface
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        IconButton(
            onClick = onClose,
            modifier = Modifier.testTag("qr_scanner_close"),
        ) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = stringResource(R.string.scan_close),
                tint = tint,
            )
        }
        Text(
            stringResource(R.string.scan_title),
            style = MaterialTheme.typography.titleMedium,
            color = tint,
        )
    }
}

@Composable
private fun StartingCameraOverlay() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = Color.White)
        Spacer(Modifier.height(12.dp))
        Text(
            stringResource(R.string.scan_starting),
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White,
        )
    }
}

@Composable
private fun NoCameraPane(onUseLinkInstead: () -> Unit) {
    ScanMessagePane(
        icon = Icons.Outlined.NoPhotography,
        title = stringResource(R.string.scan_no_camera_title),
        message = stringResource(R.string.scan_no_camera_message),
        primaryLabel = null,
        primaryTestTag = null,
        onPrimary = null,
        onUseLinkInstead = onUseLinkInstead,
    )
}

@Composable
private fun ScanMessagePane(
    icon: ImageVector,
    title: String,
    message: String,
    primaryLabel: String?,
    primaryTestTag: String?,
    onPrimary: (() -> Unit)?,
    onUseLinkInstead: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 28.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(8.dp))
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        if (primaryLabel != null && onPrimary != null) {
            Button(
                onClick = onPrimary,
                modifier = Modifier.then(
                    if (primaryTestTag != null) Modifier.testTag(primaryTestTag) else Modifier,
                ),
            ) {
                Text(primaryLabel)
            }
        }
        TextButton(
            onClick = onUseLinkInstead,
            modifier = Modifier.testTag("qr_scanner_use_link"),
        ) {
            Text(stringResource(R.string.scan_use_link_instead))
        }
    }
}

private const val INVALID_CODE_NOTICE_MS = 5_000L
private const val CAMERA_START_TIMEOUT_MS = 8_000L

private fun hasCameraPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED

private fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return null
}

private fun openAppSettings(context: Context) {
    val intent = Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.fromParts("package", context.packageName, null),
    ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
    runCatching { context.startActivity(intent) }
}
