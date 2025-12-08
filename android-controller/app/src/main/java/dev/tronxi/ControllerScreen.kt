package dev.tronxi

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

@Composable
fun ControllerScreen(
    ip: String, controllerViewModel: ControllerViewModel
) {
    val sticks = controllerViewModel.sticks

    LaunchedEffect(sticks) {
        withContext(Dispatchers.IO) {
            sendControllerState(ip, sticks.left, sticks.right)
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