package dev.tronxi.screens

import android.app.Activity
import android.content.pm.ActivityInfo
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import dev.tronxi.models.ControllerViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

@Composable
fun ControllerScreen(
    ip: String,
    controllerViewModel: ControllerViewModel
) {
    val activity = LocalContext.current as Activity
    DisposableEffect(Unit) {
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        onDispose {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    ControllerScreenUI(ip, controllerViewModel)
}

@Composable
fun ControllerScreenUI(
    ip: String,
    controllerViewModel: ControllerViewModel
) {
    val sticks = controllerViewModel.sticks

    LaunchedEffect(sticks) {
        withContext(Dispatchers.IO) {
            try {
                sendControllerState(ip, sticks.left, sticks.right)
            } catch (_: Exception) {
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        RoverWebView(
            url = ip,
            modifier = Modifier.fillMaxSize()
        )
    }
}

fun sendControllerState(ip: String, left: Float, right: Float) {
    try {
        val url = URL("$ip:8080/controller")

        val axes = JSONArray().apply {
            put(0f)
            put(left)
            put(0f)
            put(right)
        }

        val buttons = JSONArray().apply {
            repeat(14) { put(0) }
        }

        val hats = JSONArray().apply {
            put(JSONArray().apply {
                put(0)
                put(0)
            })
        }

        val payload = JSONObject().apply {
            put("axes", axes)
            put("buttons", buttons)
            put("hats", hats)
        }

        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true

        conn.outputStream.use { os ->
            os.write(payload.toString().toByteArray())
        }

        conn.inputStream.use { }

        conn.disconnect()
    } catch (_: Exception) {
    }
}

@Composable
fun RoverWebView(
    url: String,
    modifier: Modifier = Modifier
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                webViewClient = WebViewClient()
                loadUrl(url)
            }
        },
        update = { webView ->
            webView.loadUrl(url)
        }
    )
}
