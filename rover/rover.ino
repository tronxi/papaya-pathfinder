#include "esp_camera.h"
#include <WiFi.h>
#include <Adafruit_NeoPixel.h>
#include <WebServer.h>
#include <ArduinoJson.h>

#include "board_config.h"
#include "wifi_config.h"

void startCameraServer();

#define RGB_PIN 48
#define NUM_PIXELS  1


Adafruit_NeoPixel rgb(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);
WebServer server(8080); 

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  rgb.begin();
  rgb.show();

  rgb.setPixelColor(0, rgb.Color(255, 0, 0));
  rgb.show();


  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;

  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;

  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  bool has_psram = psramFound();
  Serial.printf("PSRAM: %s\n", has_psram ? "YES" : "NO");

  if (has_psram) {
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size   = FRAMESIZE_SVGA;
    config.jpeg_quality = 25;
    config.fb_count     = 1;
    config.fb_location  = CAMERA_FB_IN_PSRAM;
    config.grab_mode    = CAMERA_GRAB_LATEST;
  } else {
    config.frame_size   = FRAMESIZE_QVGA;
    config.jpeg_quality = 16;
    config.fb_count     = 1;
    config.fb_location  = CAMERA_FB_IN_DRAM;
  }

  config.grab_mode    = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return;
  }

  sensor_t *s = esp_camera_sensor_get();
  if (s && s->id.PID == OV3660_PID) {
    s->set_vflip(s, 1);
    s->set_brightness(s, 1);
    s->set_saturation(s, -2);
  }

  #if defined(LED_GPIO_NUM)
    setupLedFlash();
  #endif

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  WiFi.setSleep(false);

  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());

  startCameraServer();

  Serial.print("Camera Ready! Use 'http://");
  Serial.print(WiFi.localIP());
  Serial.println("' to connect");

  server.on("/mando", HTTP_POST, handlePostData);
  server.begin();
}

void loop() {
  server.handleClient();
}

void handlePostData() {
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "Missing body");
    return;
  }

  String json = server.arg("plain");
  Serial.println("Received:");
  Serial.println(json);

  StaticJsonDocument<1024> doc;

  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.print("JSON parse error: ");
    Serial.println(err.c_str());
    server.send(400, "text/plain", "Bad JSON");
    return;
  }

  JsonArray buttons = doc["buttons"];

  bool x_pressed = false;
  bool y_pressed = false;

  if (buttons.size() > 3) {
    x_pressed = buttons[2] == 1;
    y_pressed = buttons[3] == 1;
  }

  if (x_pressed) {
    Serial.println("X pressed!");
    encenderLed();
  }
  if (y_pressed) {
    Serial.println("Y pressed!");
    apagarLed();
  }

  server.send(200, "application/json", "{\"status\":\"ok\"}");
}

void encenderLed() {
  rgb.setPixelColor(0, rgb.Color(0, 0, 255));
  rgb.show();
}

void apagarLed() {
  rgb.setPixelColor(0, rgb.Color(0, 255, 0));
  rgb.show();
}
