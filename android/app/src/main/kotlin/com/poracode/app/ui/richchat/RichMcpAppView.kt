package com.poracode.app.ui.richchat

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.chat.McpAppPresentation
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import java.util.TimeZone

@Composable
@SuppressLint("SetJavaScriptEnabled")
fun RichMcpAppView(app: McpAppPresentation, runtime: RichChatSessionRuntime, fallback: String) {
    val selection by runtime.chat.selection.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    val locale = LocalLocale.current.toLanguageTag()
    val theme = if (isSystemInDarkTheme()) "dark" else "light"
    key(selection, app.reference) {
        val owner = selection
        var height by remember { mutableStateOf(240f) }
        var unavailable by remember { mutableStateOf(false) }
        val jobs = remember { mutableMapOf<String, Job>() }
        var port by remember { mutableStateOf<WebMessagePort?>(null) }
        val context = buildJsonObject {
            put("theme", theme); put("platform", "mobile"); put("locale", locale)
            put("timeZone", TimeZone.getDefault().id); put("displayMode", "inline")
            put("availableDisplayModes", buildJsonArray { add(JsonPrimitive("inline")) })
        }
        if (unavailable || owner == null) {
            Text(fallback)
        } else {
            AndroidView(
                modifier = Modifier.fillMaxWidth().height(height.dp),
                factory = { androidContext ->
                    WebView(androidContext).apply {
                        settings.javaScriptEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.domStorageEnabled = false
                        settings.javaScriptCanOpenWindowsAutomatically = false
                        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        webViewClient = object : WebViewClient() {
                            private var started = false
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                                request.isForMainFrame && started

                            override fun onPageFinished(view: WebView, url: String?) {
                                if (started) return
                                started = true
                                val channel = view.createWebMessageChannel()
                                port = channel[0]
                                channel[0].setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
                                    override fun onMessage(port: WebMessagePort, message: WebMessage?) {
                                        val data = try { Json.parseToJsonElement(message?.data ?: "") as? JsonObject } catch (_: Exception) { null } ?: return
                                        when ((data["operation"] as? JsonPrimitive)?.content) {
                                            "boot" -> port.postMessage(WebMessage(buildJsonObject {
                                                put("operation", "start")
                                                put("configuration", buildJsonObject {
                                                    put("app", app.reference); put("threadId", owner.threadId)
                                                    put("input", app.input); put("result", app.result); put("context", context)
                                                })
                                            }.toString()))
                                            "height" -> (data["height"] as? JsonPrimitive)?.doubleOrNull?.takeIf { it.isFinite() }?.let { height = it.coerceIn(120.0, 1200.0).toFloat() }
                                            "unavailable" -> unavailable = true
                                            "control", "openLink", "sendMessage" -> {
                                                val id = (data["id"] as? JsonPrimitive)?.content ?: return
                                                val payload = data["payload"] as? JsonObject ?: return
                                                if (jobs.size >= 16 || jobs.containsKey(id)) return
                                                jobs[id] = scope.launch {
                                                    try {
                                                        if (runtime.chat.selection.value != owner) error("Selected thread changed.")
                                                        val result = when ((data["operation"] as? JsonPrimitive)?.content) {
                                                            "control" -> {
                                                                if (payload["app"] != app.reference) error("App changed.")
                                                                runtime.chat.controlMcpApp(payload)
                                                            }
                                                            "openLink" -> {
                                                                val target = Uri.parse((payload["url"] as? JsonPrimitive)?.content ?: "")
                                                                if (target.scheme?.lowercase() !in setOf("http", "https") || target.host.isNullOrEmpty() || target.userInfo != null) error("Invalid URL.")
                                                                uriHandler.openUri(target.toString())
                                                                JsonObject(emptyMap())
                                                            }
                                                            else -> {
                                                                val text = (payload["text"] as? JsonPrimitive)?.content ?: error("Invalid message.")
                                                                if (text.isBlank() || text.length > 65_536 || runtime.chat.send(text) !is RichChatOperationResult.Success) error("Message unavailable.")
                                                                JsonObject(emptyMap())
                                                            }
                                                        }
                                                        if (runtime.chat.selection.value == owner) port.postMessage(WebMessage(buildJsonObject { put("operation", "response"); put("id", id); put("result", result) }.toString()))
                                                    } catch (_: Exception) {
                                                        if (runtime.chat.selection.value == owner) runCatching { port.postMessage(WebMessage(buildJsonObject { put("operation", "response"); put("id", id); put("error", "MCP App request failed.") }.toString())) }
                                                    } finally { jobs.remove(id) }
                                                }
                                            }
                                        }
                                    }
                                })
                                view.postWebMessage(WebMessage("poracode-mcp-app-port-v1", arrayOf(channel[1])), Uri.parse("http://localhost"))
                            }
                        }
                        val script = androidContext.assets.open("mcp-app-host.js").bufferedReader().use { it.readText() }.replace("</script", "<\\/script", ignoreCase = true)
                        loadDataWithBaseURL("http://localhost/", "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><script>$script</script></body></html>", "text/html", "utf-8", null)
                    }
                },
                update = { port?.postMessage(WebMessage(buildJsonObject { put("operation", "context"); put("context", context) }.toString())) },
                onRelease = { view ->
                    runCatching { port?.postMessage(WebMessage("{\"operation\":\"close\"}")) }
                    jobs.values.toList().forEach { it.cancel() }
                    jobs.clear()
                    port?.close(); port = null
                    view.stopLoading(); view.destroy()
                },
            )
        }
    }
}
