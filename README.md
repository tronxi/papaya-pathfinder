# Papaya Pathfinder

<div style="text-align: center;">
  <img src="patch.png" alt="Papaya Pathfinder patch" width="250"/>
</div>

Papaya Pathfinder is an open-source family of small remote-controlled rovers based on the **ESP32**.

The project currently includes **two rover variants**, designed for different sizes, motors, and power requirements.

All mechanical parts of the rovers are fully **3D-printable**, and all models are available in the `3d-models/` directories of each rover variant.

The rovers can be operated using either **WiFi** or **ExpressLRS (ELRS)**, depending on the firmware configuration.

## Papaya Pathfinder

- **ESP32**
- **ELRS receiver** *(required only when running `firmware-elrs`)*
- **6× GA25 DC gear motors**
- **4× MS24 steering servos**
- **Power supply: LiPo 3S**

### Firmware
The rover supports multiple firmware configurations, each enabling a different communication method.

- **[`firmware-wifi`](pathfinder/firmware-wifi/)**
  - WiFi-based control
  - HTTP API for movement commands
  - Compatible controllers:
    - **[Python desktop controller](desktop-controller/)** — sends gamepad-based control commands to the rover via HTTP.
    - **[Android mobile app](android-controller/)** — enables rover control using a gamepad, providing the same driving experience available on the desktop controller.

- **[`firmware-elrs`](pathfinder/firmware-elrs/)**
  - Control via **ExpressLRS (ELRS)**

### 3D-Printed Parts
<div style="text-align: center;">
  <img src="pathfinder/cad/model.png" alt="Papaya Pathfinder model" width="300"/>
</div>

All STL files for this rover are available in: **[`pathfinder/3d-models/`](pathfinder/3d-models/)**

The complete mechanical design is also available in **STEP format**: **[`pathfinder/cad/papaya-pathfinder.step`](pathfinder/cad/papaya-pathfinder.step)**


Use **PETG or PLA** for the structural parts, and **TPU** for the tires.

| File                | Qty | Material | Notes                                                  |
|---------------------|-----|--------|--------------------------------------------------------|
| `body.stl`          | 1   | PETG / PLA | Main chassis                                           |
| `arm_left.stl`      | 1   | PETG / PLA | Left suspension arm                                    |
| `arm_right.stl`     | 1   | PETG / PLA | Right suspension arm                                   |
| `pivot_left.stl`    | 1   | PETG / PLA | Left pivot mount                                       |
| `pivot_right.stl`   | 1   | PETG / PLA | Right pivot mount                                      |
| `differential_bar.stl` | 1   | PETG / PLA | Central rocker-bogie differential bar                  |
| `differential_link_left.stl` | 1   | PETG / PLA | Left link between differential bar and suspension arm  |
| `differential_link_right.stl` | 1   | PETG / PLA | Right link between differential bar and suspension arm |
| `motor_mount.stl`   | 4   | PETG / PLA | Motor mounts for GA25 motors used on steering arms     |
| `horn_adapter.stl`  | 4   | PETG / PLA | Servo horn adapters for steering servos                |
| `rim.stl`           | 6   | PETG / PLA | Wheel rims                                             |
| `tire.stl`   | 6 | TPU | Tires                                                  |

---

## Papaya Pathfinder Mini

- **ESP32 with camera (ESP32-CAM / ESP32-S3-CAM)** *(required only when running `firmware-wifi`)*
- **ELRS receiver** *(required only when running `firmware-elrs`)*
- **6× N20 DC gear motors**
- **Power supply: LiPo 2S**

### Firmware
The rover supports multiple firmware configurations, each enabling a different communication method.

- **[`firmware-wifi`](pathfinder-mini/firmware-wifi/)**
  - WiFi-based control
  - HTTP API for movement commands
  - Live video streaming over WiFi
  - Compatible controllers:
    - **[Python desktop controller](desktop-controller/)** — displays the live video stream and sends gamepad-based control commands to the rover via HTTP.
    - **[Android mobile app](android-controller/)** — displays the live video stream and enables rover control using a gamepad, providing the same driving experience available on the desktop controller.


- **[`firmware-elrs`](pathfinder-mini/firmware-elrs/)**
  - Control via **ExpressLRS (ELRS)**

### 3D-Printed Parts
<div style="text-align: center;">
  <img src="pathfinder-mini/cad/model.png" alt="Papaya Pathfinder Mini model" width="300"/>
</div>

All STL files for this rover are available in: **[`pathfinder-mini/3d-models/`](pathfinder-mini/3d-models/)**

The complete mechanical design is also available in **STEP format**: **[`pathfinder-mini/cad/papaya-pathfinder-mini.step`](pathfinder-mini/cad/papaya-pathfinder-mini.step)**

Use **PETG or PLA** for the structural parts, and **TPU** for the tires.

| File                | Qty | Material | Notes                                                      |
|---------------------|-----|------|------------------------------------------------------------|
| `body.stl`          | 1 | PETG / PLA | Main chassis                                               |
| `arm_left.stl`      | 1 | PETG / PLA | Left suspension arm                                        |
| `arm_right.stl`     | 1 | PETG / PLA | Right suspension arm                                       |
| `pivot_left.stl`    | 1 | PETG / PLA | Left pivot mount                                           |
| `pivot_right.stl`   | 1 | PETG / PLA | Right pivot mount                                          |
| `differential_bar.stl`  | 1   | PETG / PLA | Central differential bar for the rocker-bogie suspension   |
| `differential_link.stl` | 2   | PETG / PLA | Links between the differential bar and each suspension arm |
| `motor_retainer.stl` | 6 | PETG / PLA | Holds each N20 motor                                       |
| `rim.stl`       | 6 | PETG / PLA | Wheel rims                                                 |
| `tire.stl`   | 6 | TPU | Tires                                                      |

## License

This project is licensed under the **Apache License 2.0**.  
See the [LICENSE](LICENSE) file for details.