package dev.tronxi

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .padding(24.dp)
        ) {
            Text(text = "Connected to: $ip")

            Spacer(modifier = Modifier.height(16.dp))

            Text("Left: ${sticks.left}")
            Text("Right: ${sticks.right}")

            Spacer(modifier = Modifier.height(16.dp))
        }
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