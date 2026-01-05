package dev.tronxi.models

import android.view.MotionEvent
import androidx.lifecycle.ViewModel
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlin.math.abs

data class Sticks(
    val leftVertical: Float = 0f,
    val rightVertical: Float = 0f,
    val leftHorizontal: Float = 0f,
    val rightHorizontal: Float = 0f
)

class ControllerViewModel : ViewModel() {

    var sticks by mutableStateOf(Sticks())
        private set

    fun updateFromMotionEvent(event: MotionEvent) {
        var rawLeftV = event.getAxisValue(MotionEvent.AXIS_Y)
        var rawRightV = event.getAxisValue(MotionEvent.AXIS_RZ)

        val rawLeftH = event.getAxisValue(MotionEvent.AXIS_X)
        val rawRightH = event.getAxisValue(MotionEvent.AXIS_Z)

        rawLeftV = -rawLeftV
        rawRightV = -rawRightV

        sticks = Sticks(
            leftVertical = applyDeadzone(rawLeftV),
            rightVertical = applyDeadzone(rawRightV),
            leftHorizontal = applyDeadzone(rawLeftH),
            rightHorizontal = applyDeadzone(rawRightH)
        )
    }

    private fun applyDeadzone(value: Float, deadzone: Float = 0.1f): Float {
        return if (abs(value) < deadzone) 0f else value
    }
}
