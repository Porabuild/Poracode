package com.poracode.app.diagnostics

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import com.poracode.app.BuildConfig
import java.io.File
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class ScrubbedCrashFrame(
    val className: String,
    val methodName: String,
    val lineNumber: Int,
)

/**
 * Scrubbed local-only crash diagnostic report matching `docs/BACKLOG.md` policy:
 * keeps timestamps, app version/build, OS API level, device model, categorical
 * exit/exception fields, and class/method/line stack frames; drops exception
 * messages, exit descriptions, ANR/native trace streams, paths, host names,
 * locale/region, and thread/session/user identifiers.
 */
@Serializable
data class ScrubbedCrashReport(
    val id: String,
    val timestampEpochMs: Long,
    val kind: String,
    val appVersion: String,
    val appBuild: Int,
    val osSdkInt: Int,
    val deviceModel: String,
    val exceptionClass: String? = null,
    val exitReason: Int? = null,
    val exitStatus: Int? = null,
    val importance: Int? = null,
    val pssKb: Long? = null,
    val rssKb: Long? = null,
    val frames: List<ScrubbedCrashFrame> = emptyList(),
)

interface DiagnosticsEnabledStore {
    fun isEnabled(): Boolean
    fun setEnabled(enabled: Boolean)
}

class SharedPreferencesDiagnosticsEnabledStore(context: Context) : DiagnosticsEnabledStore {
    private val prefs = context.getSharedPreferences("poracode_diagnostics", Context.MODE_PRIVATE)
    override fun isEnabled(): Boolean = prefs.getBoolean("capture_enabled", true)
    override fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean("capture_enabled", enabled).apply()
    }
}

class CrashDiagnosticsManager(
    private val directory: File,
    private val enabledStore: DiagnosticsEnabledStore,
    private val buildEnabled: Boolean = CRASH_DIAGNOSTICS_BUILD_ENABLED,
    private val nowEpochMs: () -> Long = { System.currentTimeMillis() },
) {
    private val json = Json { prettyPrint = true; encodeDefaults = true; ignoreUnknownKeys = true }
    private val _enabled = MutableStateFlow(buildEnabled && enabledStore.isEnabled())
    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()
    private val _reports = MutableStateFlow<List<ScrubbedCrashReport>>(emptyList())
    val reports: StateFlow<List<ScrubbedCrashReport>> = _reports.asStateFlow()

    init {
        directory.mkdirs()
        reload()
    }

    fun setCaptureEnabled(enabled: Boolean) {
        val effective = buildEnabled && enabled
        enabledStore.setEnabled(effective)
        _enabled.value = effective
        if (!effective) {
            deleteAll()
        }
    }

    fun installHandlers(context: Context) {
        if (!buildEnabled || !_enabled.value) return
        ingestHistoricalExitReasons(context)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            if (_enabled.value) {
                runCatching { record(fromThrowable(throwable)) }
            }
            previous?.uncaughtException(thread, throwable)
        }
    }

    fun ingestHistoricalExitReasons(context: Context) {
        if (!buildEnabled || !_enabled.value) return
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return
        val reasons = runCatching {
            am.getHistoricalProcessExitReasons(context.packageName, 0, MAX_REPORTS)
        }.getOrDefault(emptyList())
        val existingTimestamps = _reports.value.map { it.timestampEpochMs }.toSet()
        reasons.forEach { info ->
            if (info.timestamp in existingTimestamps) return@forEach
            // Never read `info.description` or `info.traceInputStream` (policy forbids free-text descriptions/traces).
            val report = ScrubbedCrashReport(
                id = UUID.randomUUID().toString().lowercase(),
                timestampEpochMs = info.timestamp,
                kind = "process_exit",
                appVersion = BuildConfig.VERSION_NAME,
                appBuild = BuildConfig.VERSION_CODE,
                osSdkInt = Build.VERSION.SDK_INT,
                deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                exitReason = info.reason,
                exitStatus = info.status,
                importance = info.importance,
                pssKb = info.pss,
                rssKb = info.rss,
            )
            record(report)
        }
    }

    fun fromThrowable(throwable: Throwable): ScrubbedCrashReport {
        // Deliberately drop `throwable.message` so no paths, host names, or tokens ever persist.
        val scrubbedFrames = throwable.stackTrace.take(MAX_FRAMES).map { el ->
            ScrubbedCrashFrame(
                className = el.className,
                methodName = el.methodName,
                lineNumber = el.lineNumber,
            )
        }
        return ScrubbedCrashReport(
            id = UUID.randomUUID().toString().lowercase(),
            timestampEpochMs = nowEpochMs(),
            kind = "uncaught_exception",
            appVersion = BuildConfig.VERSION_NAME,
            appBuild = BuildConfig.VERSION_CODE,
            osSdkInt = Build.VERSION.SDK_INT,
            deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            exceptionClass = throwable::class.java.name,
            frames = scrubbedFrames,
        )
    }

    @Synchronized
    fun record(report: ScrubbedCrashReport) {
        if (!buildEnabled || !_enabled.value) return
        directory.mkdirs()
        val file = File(directory, "${report.timestampEpochMs}-${report.id}.json")
        runCatching { file.writeText(json.encodeToString(report), Charsets.UTF_8) }
        reload()
    }

    @Synchronized
    fun reload() {
        val cutoff = nowEpochMs() - MAX_AGE_MS
        val files = directory.listFiles { f -> f.isFile && f.extension == "json" }.orEmpty()
        val parsed = mutableListOf<Pair<File, ScrubbedCrashReport>>()
        files.forEach { file ->
            val report = runCatching {
                json.decodeFromString(ScrubbedCrashReport.serializer(), file.readText(Charsets.UTF_8))
            }.getOrNull()
            if (report == null || report.timestampEpochMs < cutoff) {
                file.delete()
            } else {
                parsed += file to report
            }
        }
        parsed.sortByDescending { it.second.timestampEpochMs }
        if (parsed.size > MAX_REPORTS) {
            parsed.drop(MAX_REPORTS).forEach { (file, _) -> file.delete() }
        }
        _reports.value = parsed.take(MAX_REPORTS).map { it.second }
    }

    @Synchronized
    fun deleteAll() {
        directory.listFiles().orEmpty().forEach { it.delete() }
        _reports.value = emptyList()
    }

    fun exportJson(): String = json.encodeToString(_reports.value)

    companion object {
        const val CRASH_DIAGNOSTICS_BUILD_ENABLED = true
        const val MAX_REPORTS = 20
        const val MAX_FRAMES = 64
        const val MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L
    }
}
