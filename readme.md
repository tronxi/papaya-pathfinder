# Papaya Pathfinder

Papaya Pathfinder is a small remote-controlled rover based on an ESP32-S3-CAM.  
It streams live video over WiFi and receives movement commands through a simple HTTP API.  
The rover uses a single motor driver capable of controlling six N20 DC gear motors with proportional PWM.

A desktop controller written in Python allows the rover to be driven with a gamepad while displaying
the camera feed in a small window.

## Hardware Components
- **ESP32-S3-CAM** — handles control logic, WiFi communication, and real-time video streaming.
- **Motor driver** — controls all six motors with independent direction and proportional PWM.
- **Six N20 DC gear motors** — provide the rover’s traction and movement.

## Software Components
- **ESP32-S3-CAM firmware** — implements the rover’s control logic, generates the real-time video stream, and exposes simple HTTP endpoints for movement commands.
- **Python desktop controller** — receives the live video feed and sends gamepad-based control commands to the rover via HTTP.


