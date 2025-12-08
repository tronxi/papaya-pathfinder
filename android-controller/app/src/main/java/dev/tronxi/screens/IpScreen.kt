package dev.tronxi.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import kotlin.collections.iterator

@Composable
fun IpScreen(onConnect: (String) -> Unit) {
    var ip by remember { mutableStateOf("") }
    var devices by remember { mutableStateOf<List<HostInfo>>(emptyList()) }
    var isScanning by remember { mutableStateOf(true) }

    val scope = rememberCoroutineScope()

    suspend fun doScan() {
        isScanning = true
        devices = scanNetwork()
        isScanning = false
    }

    LaunchedEffect(Unit) {
        doScan()
    }

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Top
        ) {
            Text(text = "Enter rover IP")

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = ip,
                onValueChange = { ip = it },
                label = { Text("e.g. http://10.99.98.51") },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    if (ip.isNotBlank()) onConnect(ip)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Connect")
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    scope.launch {
                        doScan()
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isScanning) "Scanning..." else "Scan again")
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text("Devices found:", modifier = Modifier.padding(bottom = 8.dp))

            if (isScanning && devices.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Scanning network...")
                }
            } else if (devices.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.Top
                ) {
                    Text("No devices found.")
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    items(devices) { dev ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clickable {
                                    ip = "http://${dev.ip}"
                                },
                            colors = if (dev.port80Open && dev.port8080Open)
                                CardDefaults.cardColors(containerColor = Color(0xFFB2FFB2)) // verde suave
                            else
                                CardDefaults.cardColors(),
                            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                        ) {
                            val textColor = if (dev.port80Open && dev.port8080Open) Color.Black else Color.Unspecified

                            Column(modifier = Modifier.padding(12.dp)) {
                                Text("IP: ${dev.ip}", color = textColor)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text("80: ${if (dev.port80Open) "OPEN" else "closed"}", color = textColor)
                                Text("8080: ${if (dev.port8080Open) "OPEN" else "closed"}", color = textColor)
                            }
                        }
                    }
                }
            }
        }
    }
}

data class HostInfo(
    val ip: String,
    val port80Open: Boolean,
    val port8080Open: Boolean
)

suspend fun scanNetwork(): List<HostInfo> = withContext(Dispatchers.IO) {
    val localIp = getLocalIp() ?: return@withContext emptyList()
    val base = localIp.substringBeforeLast(".") + "."

    val jobs = (1..254).map { i ->
        async(Dispatchers.IO) {
            val ip = base + i

            if (!isReachable(ip, 800)) {
                return@async null
            }

            val open80 = isPortOpen(ip, 80, 800)
            val open8080 = isPortOpen(ip, 8080, 800)

            HostInfo(ip = ip, port80Open = open80, port8080Open = open8080)
        }
    }

    jobs.mapNotNull { it.await() }
}

private fun getLocalIp(): String? {
    val interfaces = NetworkInterface.getNetworkInterfaces()
    for (intf in interfaces) {
        if (!intf.isUp || intf.isLoopback) continue

        val addrs = intf.inetAddresses
        while (addrs.hasMoreElements()) {
            val a = addrs.nextElement()
            if (a is Inet4Address && !a.isLoopbackAddress) {
                return a.hostAddress
            }
        }
    }
    return null
}

private fun isReachable(ip: String, timeout: Int): Boolean {
    return try {
        val addr: InetAddress = InetAddress.getByName(ip)
        addr.isReachable(timeout)
    } catch (_: Exception) {
        false
    }
}

private fun isPortOpen(ip: String, port: Int, timeout: Int): Boolean {
    return try {
        Socket().use { s ->
            s.connect(InetSocketAddress(ip, port), timeout)
        }
        true
    } catch (_: Exception) {
        false
    }
}
