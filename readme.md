# Papaya Pathfinder

Papaya Pathfinder is a small remote-controlled rover based on an ESP32-S3-CAM.  
It streams live video over WiFi and receives movement commands through a simple HTTP API.  
The rover uses a single motor driver capable of controlling six DC motors with proportional PWM.

A desktop controller written in Python allows the rover to be driven with a gamepad while displaying
the camera feed in a small window.

## Components

- **ESP32-S3-CAM** for processing, WiFi and video streaming
- **Motor driver controlling six DC motors** (speed + direction)
- **PWM control** for proportional movement
- **Python desktop client** for real-time control
- **HTTP interface** for receiving movement commands