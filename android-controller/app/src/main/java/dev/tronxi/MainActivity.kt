package dev.tronxi

import android.net.Uri
import android.os.Bundle
import android.view.InputDevice
import android.view.MotionEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.*
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import dev.tronxi.ui.theme.AndroidControllerTheme

class MainActivity : ComponentActivity() {

    private val controllerViewModel: ControllerViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.statusBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        setContent {
            AndroidControllerTheme {
                val navController = rememberNavController()
                AppNavHost(
                    navController = navController,
                    controllerViewModel = controllerViewModel
                )
            }
        }
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        val isFromJoystick =
            (event.source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK

        if (isFromJoystick && event.action == MotionEvent.ACTION_MOVE) {
            controllerViewModel.updateFromMotionEvent(event)
            return true
        }

        return super.dispatchGenericMotionEvent(event)
    }

    @Composable
    fun AppNavHost(
        navController: NavHostController,
        controllerViewModel: ControllerViewModel
    ) {
        NavHost(
            navController = navController,
            startDestination = "ip"
        ) {
            composable("ip") {
                IpScreen(
                    onConnect = { ip ->
                        val withHttp =
                            if (ip.startsWith("http://") || ip.startsWith("https://")) ip
                            else "http://$ip"
                        val encodedIp = Uri.encode(withHttp)
                        navController.navigate("controller/$encodedIp")
                    }
                )
            }

            composable(
                route = "controller/{ip}",
                arguments = listOf(
                    navArgument("ip") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                val ip = backStackEntry.arguments?.getString("ip") ?: ""
                ControllerScreen(ip = ip, controllerViewModel = controllerViewModel)
            }
        }
    }

}
