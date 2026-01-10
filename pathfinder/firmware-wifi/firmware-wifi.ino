#include <WiFi.h>
#include <Adafruit_NeoPixel.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "wifi_config.h"
#include <ESP32Servo.h>

#define SERVO_RF_PIN 4
#define SERVO_RB_PIN 5
#define SERVO_LF_PIN 47
#define SERVO_LB_PIN 21
#define RGB_PIN 48
#define NUM_PIXELS  1

static const int SERVO_CENTER = 90;
static const int SERVO_MAX_DELTA = 60;

Servo rf, rb, lf, lb;


WebServer server(8080);
Adafruit_NeoPixel rgb(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

bool connectToWiFi(const char* ssid, const char* pass, uint32_t timeoutMs);
void handlePostData();
void attachServo(Servo& s, int pin);
void setSteering(float steer);

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  rgb.begin();
  rgb.show();

  led(255, 255, 255);

  bool connected = false;

  Serial.print("Attempting WiFi 1: ");
  Serial.println(WIFI_SSID_1);

  if (connectToWiFi(WIFI_SSID_1, WIFI_PASSWORD_1, 10000)) {
    Serial.println("Connected to WiFi 1");
    led(0, 0, 255);
    connected = true;
  }

  if (!connected) {
    Serial.println("WiFi 1 failed. Waiting to try WiFi 2...");
    delay(1000);

    Serial.print("Attempting WiFi 2: ");
    Serial.println(WIFI_SSID_2);

    if (connectToWiFi(WIFI_SSID_2, WIFI_PASSWORD_2, 10000)) {
      Serial.println("Connected to WiFi 2");
      led(0, 255, 0);
      connected = true;
    }
  }

  if (!connected) {
    Serial.println("ERROR: Could not connect to any WiFi network.");
    led(255, 0, 0);
  }

  Serial.print(WiFi.localIP());
  Serial.println("' to connect");

  server.on("/controller", HTTP_POST, handlePostData);
  server.begin();

  attachServo(rf, SERVO_RF_PIN);
  attachServo(rb, SERVO_RB_PIN);
  attachServo(lf, SERVO_LF_PIN);
  attachServo(lb, SERVO_LB_PIN);

  setSteering(0.0f);


  Serial.println("Ready");
}

void loop() {
  server.handleClient();
}

bool connectToWiFi(const char* ssid, const char* pass, uint32_t timeoutMs) {
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    delay(200);

    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, pass);
    WiFi.setSleep(false);

    Serial.print("Connecting to ");
    Serial.print(ssid);

    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    return WiFi.status() == WL_CONNECTED;
}

void handlePostData() {
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "Missing body");
    return;
  }

  String json = server.arg("plain");
  Serial.println(json);

  StaticJsonDocument<1024> doc;

  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.print("JSON parse error: ");
    Serial.println(err.c_str());
    server.send(400, "text/plain", "Bad JSON");
    return;
  }

  setSteering(doc["axes"][0]);

  server.send(200, "application/json", "{\"status\":\"ok\"}");
}

void attachServo(Servo& s, int pin) {
  s.setPeriodHertz(50);
  s.attach(pin, 500, 2400);
}

void setSteering(float steer) {
  steer = constrain(steer, -1.0f, 1.0f);
  int delta = steer * SERVO_MAX_DELTA;

  int lf_angle = SERVO_CENTER + delta;
  int rf_angle = SERVO_CENTER - delta;

  int lb_angle = SERVO_CENTER - delta;
  int rb_angle = SERVO_CENTER + delta;

  lf.write(constrain(lf_angle, 0, 180));
  rf.write(constrain(rf_angle, 0, 180));
  lb.write(constrain(lb_angle, 0, 180));
  rb.write(constrain(rb_angle, 0, 180));
}

void led(int r, int g, int b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}