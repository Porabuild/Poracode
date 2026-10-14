package com.poracode.app.ui.onboarding

import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.poracode.app.R
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

internal enum class ScanCameraStatus {
    Starting,
    Streaming,

    /** No usable camera on the device (common on emulators without a virtual camera). */
    NoCamera,

    /** Provider init, binding, or the barcode model failed. */
    Failed,
}

/**
 * CameraX preview + QR-only ML Kit analysis, bound to this composable's lifecycle.
 *
 * The camera provider is unbound and the analysis executor and barcode scanner are
 * closed on dispose, so leaving the screen always releases the camera.
 */
@Composable
internal fun PairingScanCamera(
    active: Boolean,
    bindAttempt: Int,
    onDecoded: (String) -> Unit,
    onStatus: (ScanCameraStatus) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }
    val activeState = rememberUpdatedState(active)
    val decodedState = rememberUpdatedState(onDecoded)
    val statusState = rememberUpdatedState(onStatus)
    val previewDescription = stringResource(R.string.scan_preview_description)

    DisposableEffect(lifecycleOwner, bindAttempt) {
        val disposed = AtomicBoolean(false)
        val executor = Executors.newSingleThreadExecutor()
        val scanner: BarcodeScanner = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build(),
        )
        var boundProvider: ProcessCameraProvider? = null

        statusState.value(ScanCameraStatus.Starting)
        val providerFuture = ProcessCameraProvider.getInstance(context)
        providerFuture.addListener(
            {
                if (disposed.get()) return@addListener
                try {
                    val provider = providerFuture.get()
                    val selector = listOf(
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        CameraSelector.DEFAULT_FRONT_CAMERA,
                    ).firstOrNull { candidate ->
                        runCatching { provider.hasCamera(candidate) }.getOrDefault(false)
                    }
                    if (selector == null) {
                        statusState.value(ScanCameraStatus.NoCamera)
                        return@addListener
                    }
                    val preview = Preview.Builder().build()
                    preview.setSurfaceProvider(previewView.surfaceProvider)
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    analysis.setAnalyzer(
                        executor,
                        QrCodeAnalyzer(
                            scanner = scanner,
                            isActive = { !disposed.get() && activeState.value },
                            onDecoded = { value ->
                                if (!disposed.get()) decodedState.value(value)
                            },
                            onDecodeUnavailable = {
                                if (!disposed.get()) statusState.value(ScanCameraStatus.Failed)
                            },
                        ),
                    )
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
                    boundProvider = provider
                    statusState.value(ScanCameraStatus.Streaming)
                } catch (failure: Throwable) {
                    // Provider init / binding failures (no camera service, camera in use,
                    // revoked permission mid-session) must surface a recoverable state
                    // instead of leaving the user on a frozen viewfinder.
                    if (failure is InterruptedException) Thread.currentThread().interrupt()
                    statusState.value(ScanCameraStatus.Failed)
                }
            },
            ContextCompat.getMainExecutor(context),
        )

        onDispose {
            disposed.set(true)
            runCatching { boundProvider?.unbindAll() }
            runCatching { scanner.close() }
            executor.shutdown()
        }
    }

    AndroidView(
        factory = { previewView },
        modifier = modifier.semantics { contentDescription = previewDescription },
    )
}

/**
 * QR-only analyzer. Every [ImageProxy] is closed exactly once: synchronously in
 * `finally` when ML Kit never took ownership of the frame, otherwise in the task
 * completion listener. A leaked proxy stalls the analysis pipeline permanently.
 */
private class QrCodeAnalyzer(
    private val scanner: BarcodeScanner,
    private val isActive: () -> Boolean,
    private val onDecoded: (String) -> Unit,
    private val onDecodeUnavailable: () -> Unit,
) : ImageAnalysis.Analyzer {
    private val inFlight = AtomicBoolean(false)
    private val consecutiveFailures = AtomicInteger(0)

    @OptIn(ExperimentalGetImage::class)
    override fun analyze(image: ImageProxy) {
        var handedOff = false
        try {
            if (!isActive()) return
            val mediaImage = image.image ?: return
            if (!inFlight.compareAndSet(false, true)) return
            val input = InputImage.fromMediaImage(mediaImage, image.imageInfo.rotationDegrees)
            scanner.process(input)
                .addOnSuccessListener { barcodes ->
                    consecutiveFailures.set(0)
                    val decoded = barcodes.asSequence()
                        .mapNotNull { it.rawValue?.trim() }
                        .firstOrNull { it.isNotEmpty() }
                    if (decoded != null && isActive()) onDecoded(decoded)
                }
                .addOnFailureListener {
                    if (consecutiveFailures.incrementAndGet() >= MAX_CONSECUTIVE_FAILURES) {
                        onDecodeUnavailable()
                    }
                }
                .addOnCompleteListener {
                    inFlight.set(false)
                    image.close()
                }
            handedOff = true
        } catch (failure: Throwable) {
            inFlight.set(false)
            if (consecutiveFailures.incrementAndGet() >= MAX_CONSECUTIVE_FAILURES) {
                onDecodeUnavailable()
            }
        } finally {
            if (!handedOff) image.close()
        }
    }

    private companion object {
        /** Tolerate transient decode errors; a persistently broken model is reported. */
        const val MAX_CONSECUTIVE_FAILURES = 8
    }
}
