import cv2
from transformers import pipeline
from PIL import Image
import torch
import json

pipe = pipeline(
    "image-text-to-text",
    model="Qwen/Qwen3-VL-8B-Instruct",
    device="mps",
    dtype=torch.float16,
    trust_remote_code=True
)

cap = cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)

if not cap.isOpened():
    raise SystemExit(1)

last_prompt = "Analizando..."
processing = False

while True:
    ret, frame = cap.read()
    if not ret:
        break

    if not processing:

        processing = True

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(rgb_frame).resize((512, 512))

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": pil_image},
                    {
                        "type": "text",
                        "text": (
                            "You are the front camera of a small ground rover. "
                            "The camera is mounted about 10 cm above the ground. "
                            "The rover is 30 cm wide and can rotate in place around its vertical axis. "
                            "It cannot move sideways. It moves forward, backward, or rotates in place. "

                            "Objects touching the floor within the rover width and within 50 cm ahead are obstacles. "
                            "Ignore distant objects that do not block immediate movement. "
                            "Prioritize the ground plane directly in front of the rover. "

                            "If forward movement is blocked, prefer rotating left or right to find a free path. "
                            "Use LEFT or RIGHT only if clearly referring to steering direction after rotation. "

                            "Allowed commands: FORWARD, ROTATE_LEFT, ROTATE_RIGHT, BACKWARD, STOP. "
                            "Choose the safest movement."

                            "Return exactly this JSON:\n"
                            "{\n"
                            '  "scene": "<what is directly ahead at rover level>",\n'
                            '  "command": "<movement>"\n'
                            "}"
                        )
                    },
                ],
            }
        ]

        try:
            result = pipe(
                text=messages,
                max_new_tokens=80
            )

            last_prompt = result[0]["generated_text"][-1]["content"].strip()

        except Exception as e:
            last_prompt = f"Error: {e}"

        processing = False

    output_frame = frame.copy()


    cv2.rectangle(output_frame, (10, 10), (1250, 120), (0, 0, 0), -1)

    try:
        data = json.loads(last_prompt)

        scene_text = f"SCENE: {data.get('scene', '-')}"
        command = data.get("command", "-")
        command_text = f"COMMAND: {command}"

        color_map = {
            "FORWARD": (0, 255, 0),
            "LEFT": (255, 200, 0),
            "RIGHT": (255, 200, 0),
            "ROTATE_LEFT": (0, 150, 255),
            "ROTATE_RIGHT": (0, 150, 255),
            "BACKWARD": (0, 0, 255),
            "STOP": (0, 0, 255),
        }

        cmd_color = color_map.get(command, (255, 255, 255))

    except:
        scene_text = last_prompt
        command_text = ""
        cmd_color = (255, 255, 255)

    cv2.putText(
        output_frame,
        scene_text,
        (20, 45),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2,
        cv2.LINE_AA
    )

    cv2.putText(
        output_frame,
        command_text,
        (20, 85),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        cmd_color,
        2,
        cv2.LINE_AA
    )


    cv2.imshow("Papaya Pathfinder", output_frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()