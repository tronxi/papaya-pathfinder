package dev.tronxi

import android.view.MotionEvent
import androidx.lifecycle.ViewModel
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

data class VerticalSticks(
    val left: Float = 0f,
    val right: Float = 0f
)

class ControllerViewModel : ViewModel() {

    var sticks by mutableStateOf(VerticalSticks())
        private set

    fun updateFromMotionEvent(event: MotionEvent) {
        var rawLeft = event.getAxisValue(MotionEvent.AXIS_Y)
        var rawRight = event.getAxisValue(MotionEvent.AXIS_RZ)

        rawLeft = -rawLeft
        rawRight = -rawRight

        sticks = VerticalSticks(
            left = applyDeadzone(rawLeft),
            right = applyDeadzone(rawRight)
        )
    }

    private fun applyDeadzone(value: Float, deadzone: Float = 0.1f): Float {
        return if (kotlin.math.abs(value) < deadzone) 0f else value
    }
}
