import cv2
from transformers import pipeline
from PIL import Image
import torch
import json
import numpy as np
import requests
import textwrap
import threading
import time

WINDOW_NAME = "Papaya Pathfinder"
ESP32_CAPTURE_URL = "http://192.168.1.145/capture"
REQUEST_TIMEOUT = 2.0

pipe = pipeline(
    "image-text-to-text",
    model="Qwen/Qwen3-VL-8B-Instruct",
    device="mps",
    dtype=torch.float16,
    trust_remote_code=True
)

running = True
display_frame = None
display_result = None
state_lock = threading.Lock()

def fetch_frame() -> np.ndarray:
    response = requests.get(ESP32_CAPTURE_URL, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    img_array = np.frombuffer(response.content, dtype=np.uint8)
    frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("No se pudo decodificar la imagen")
    return frame

def analyze_frame(frame: np.ndarray) -> str:
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(rgb_frame)

    prompt_text = (
        "You are the vision system of a lunar-style ground rover (30cm wide, 10cm camera height). "
        "Analyze the image step-by-step to ensure safe navigation.\n\n"
        "Step 1: Identify terrain type (flat, rocky, obstacle, drop-off).\n"
        "Step 2: Estimate distance to the nearest blocking object in centimeters.\n"
        "Step 3: Check the 30cm wide path directly in front.\n"
        "Step 4: Apply Movement Policy:\n"
        "- Clear path > 50cm: FORWARD.\n"
        "- Obstacle at 20-50cm: TURN_LEFT/RIGHT (small adjustment).\n"
        "- Obstacle < 20cm or dead end: ROTATE_LEFT/RIGHT (pivot) or BACKWARD.\n"
        "- Unknown/Danger: STOP.\n\n"
        "Return EXACTLY this JSON format:\n"
        "{\n"
        '  "analysis": "1. Terrain: <...>. 2. Distance: <...>cm. 3. Path: <...>",\n'
        '  "scene": "<one sentence summary for the pilot>",\n'
        '  "command": "<SINGLE_COMMAND>"\n'
        "}"
    )

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": pil_image},
                {"type": "text", "text": prompt_text},
            ],
        }
    ]

    result = pipe(
        text=messages,
        max_new_tokens=120,
        generate_kwargs={"temperature": 0.01, "do_sample": False}
    )

    return result[0]["generated_text"][-1]["content"].strip()

def parse_prompt(prompt: str):
    try:
        start = prompt.find('{')
        end = prompt.rfind('}') + 1
        data = json.loads(prompt[start:end])

        analysis = str(data.get("analysis", "-"))
        scene = str(data.get("scene", "-"))
        command = str(data.get("command", "-")).strip().upper()
        return analysis, scene, command
    except Exception:
        return "PARSE_ERROR", str(prompt)[:50] + "...", "STOP"

def get_command_color(command: str):
    color_map = {
        "FORWARD": (0, 220, 0),
        "TURN_LEFT": (0, 220, 220),
        "TURN_RIGHT": (0, 220, 220),
        "ROTATE_LEFT": (0, 180, 255),
        "ROTATE_RIGHT": (0, 180, 255),
        "BACKWARD": (0, 0, 255),
        "STOP": (0, 0, 255),
    }
    return color_map.get(command.split()[0], (255, 255, 255))

def draw_ui(frame: np.ndarray, prompt_snapshot: str) -> np.ndarray:
    analysis_text, scene_text, command = parse_prompt(prompt_snapshot)

    cam_h, cam_w = frame.shape[:2]
    panel_w = 380
    window_w = cam_w + panel_w
    window_h = max(cam_h, 480)

    canvas = np.zeros((window_h, window_w, 3), dtype=np.uint8)
    canvas[:] = (12, 12, 12)

    y_off = (window_h - cam_h) // 2
    canvas[y_off:y_off+cam_h, 0:cam_w] = frame
    cv2.rectangle(canvas, (0, y_off), (cam_w, y_off+cam_h), (40, 40, 40), 1)

    p_x = cam_w + 20

    cv2.putText(canvas, "TECHNICAL ANALYSIS", (p_x, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 255), 1, cv2.LINE_AA)

    analysis_lines = textwrap.wrap(analysis_text.upper(), width=42)
    curr_y = 65
    for line in analysis_lines[:6]:
        cv2.putText(canvas, f"> {line}", (p_x, curr_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (150, 150, 150), 1, cv2.LINE_AA)
        curr_y += 18

    curr_y += 25
    cv2.putText(canvas, "PILOT SUMMARY", (p_x, curr_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 0), 1, cv2.LINE_AA)

    curr_y += 25
    scene_lines = textwrap.wrap(scene_text.upper(), width=35)
    for line in scene_lines[:4]:
        cv2.putText(canvas, line, (p_x, curr_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
        curr_y += 22

    cmd_y = window_h - 110
    cv2.putText(canvas, "ACTIVE COMMAND", (p_x, cmd_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1, cv2.LINE_AA)

    cmd_color = get_command_color(command)
    cv2.rectangle(canvas, (p_x, cmd_y + 15), (window_w - 20, cmd_y + 80), (25, 25, 25), -1)
    cv2.rectangle(canvas, (p_x, cmd_y + 15), (window_w - 20, cmd_y + 80), cmd_color, 2)

    (tw, th), _ = cv2.getTextSize(command, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
    c_x = p_x + ((window_w - 20 - p_x) // 2) - (tw // 2)
    cv2.putText(canvas, command, (c_x, cmd_y + 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, cmd_color, 2, cv2.LINE_AA)


    return canvas

def worker_loop():
    global display_frame, display_result, running
    while running:
        try:
            frame = fetch_frame()
            result = analyze_frame(frame)
            with state_lock:
                display_frame = frame
                display_result = result
        except Exception as e:
            with state_lock:
                if display_result is None:
                    display_result = f"Error: {e}"
            time.sleep(0.5)

worker = threading.Thread(target=worker_loop, daemon=True)
worker.start()

cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_AUTOSIZE)

while True:
    with state_lock:
        frame_snaps = None if display_frame is None else display_frame.copy()
        result_snaps = display_result

    if frame_snaps is None or result_snaps is None:
        loading = np.zeros((480, 800, 3), dtype=np.uint8)
        cv2.putText(loading, "INITIALIZING...", (250, 240),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1, cv2.LINE_AA)
        cv2.imshow(WINDOW_NAME, loading)
    else:
        ui_frame = draw_ui(frame_snaps, result_snaps)
        cv2.imshow(WINDOW_NAME, ui_frame)

    key = cv2.waitKey(30) & 0xFF
    if key == ord("q") or key == 27:
        running = False
        break

cv2.destroyAllWindows()