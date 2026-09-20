package com.poracode.app.ui.onboarding

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * Whether pairing by scanning can work on this device at all.
 *
 * Resolved **without** asking for the CAMERA runtime permission — a device that cannot
 * scan must never be prompted just so the screen can decide which route to show — and
 * **synchronously**, so the first composed frame already has the right answer and the
 * disclosure never flashes open a moment after launch.
 *
 * Two permission-free signals:
 * 1. `FEATURE_CAMERA_ANY` — no camera hardware declared at all.
 * 2. `CameraManager.getCameraIdList()` — the same enumeration CameraX binds against.
 *    Emulator images advertise the feature while exposing no camera, and that is exactly
 *    the device where hiding the paste route behind a tap leaves no working route on
 *    screen. (A blocking `ProcessCameraProvider` probe was tried first and is wrong
 *    here: its initialization races app start and answers too late to be trusted.)
 */
@Composable
internal fun rememberScanningAvailable(): Boolean {
    val context = LocalContext.current
    return remember(context) { isScanningAvailable(context) }
}

private fun isScanningAvailable(context: Context): Boolean {
    if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) return false
    val manager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: return false
    // Any failure to enumerate means the scanner could not open a camera either.
    return runCatching { manager.cameraIdList.isNotEmpty() }.getOrDefault(false)
}
