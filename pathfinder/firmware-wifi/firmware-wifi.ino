#include <WiFi.h>
#include <Adafruit_NeoPixel.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "wifi_config.h"

#define SERVO_RF_PIN 38
#define SERVO_RB_PIN 39
#define SERVO_LF_PIN 41
#define SERVO_LB_PIN 42

#define SERVO_FREQ 50
#define SERVO_RES 14

#define RGB_PIN 48
#define NUM_PIXELS 1

#define MOTOR_A_RPWM_PIN 12
#define MOTOR_A_LPWM_PIN 13

#define MOTOR_B_RPWM_PIN 10
#define MOTOR_B_LPWM_PIN 11

#define PWM_FREQ 10000
#define PWM_RES 8

static const int SERVO_CENTER_ANGLE = 90;
static const int SERVO_MAX_DELTA = 45;

int TRIM_LF = 0;
int TRIM_RF = 0;
int TRIM_LB = 0;
int TRIM_RB = 0;

WebServer server(8080);
Adafruit_NeoPixel rgb(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

bool connectToWiFi(const char* ssid, const char* pass, uint32_t timeoutMs);
void handlePostData();
void setSteering(float steer);
void setMotor(float throttle);
void writeServo(int pin, int angle);

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  rgb.begin();
  rgb.show();

  led(255, 255, 255);

  ledcAttach(MOTOR_A_RPWM_PIN, PWM_FREQ, PWM_RES);
  ledcAttach(MOTOR_A_LPWM_PIN, PWM_FREQ, PWM_RES);
  ledcWrite(MOTOR_A_RPWM_PIN, 0);
  ledcWrite(MOTOR_A_LPWM_PIN, 0);

  ledcAttach(MOTOR_B_RPWM_PIN, PWM_FREQ, PWM_RES);
  ledcAttach(MOTOR_B_LPWM_PIN, PWM_FREQ, PWM_RES);
  ledcWrite(MOTOR_B_RPWM_PIN, 0);
  ledcWrite(MOTOR_B_LPWM_PIN, 0);

  ledcAttach(SERVO_RF_PIN, SERVO_FREQ, SERVO_RES);
  ledcAttach(SERVO_RB_PIN, SERVO_FREQ, SERVO_RES);
  ledcAttach(SERVO_LF_PIN, SERVO_FREQ, SERVO_RES);
  ledcAttach(SERVO_LB_PIN, SERVO_FREQ, SERVO_RES);

  setSteering(0.0f);

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

  float steeringVal = doc["axes"][2];
  float throttleVal = doc["axes"][1];

  setSteering(steeringVal);
  setMotor(throttleVal);

  server.send(200, "application/json", "{\"status\":\"ok\"}");
}

void writeServo(int pin, int angle) {
  int minAngle = SERVO_CENTER_ANGLE - SERVO_MAX_DELTA;
  int maxAngle = SERVO_CENTER_ANGLE + SERVO_MAX_DELTA;

  angle = constrain(angle, minAngle, maxAngle);
  int duty = map(angle, 0, 180, 410, 1966);

  ledcWrite(pin, duty);
}

void setSteering(float steer) {
  steer = constrain(steer, -1.0f, 1.0f);
  int delta = steer * SERVO_MAX_DELTA;

  int lf_angle = SERVO_CENTER_ANGLE + TRIM_LF + delta;
  int rf_angle = SERVO_CENTER_ANGLE + TRIM_RF + delta;
  int lb_angle = SERVO_CENTER_ANGLE + TRIM_LB - delta;
  int rb_angle = SERVO_CENTER_ANGLE + TRIM_RB - delta;

  writeServo(SERVO_LF_PIN, lf_angle);
  writeServo(SERVO_RF_PIN, rf_angle);
  writeServo(SERVO_LB_PIN, lb_angle);
  writeServo(SERVO_RB_PIN, rb_angle);
}

void setMotor(float throttle) {
  throttle = constrain(throttle, -1.0f, 1.0f);

  int pwmValue = abs(throttle) * 255;

  if (throttle > 0.05) {
    ledcWrite(MOTOR_A_RPWM_PIN, 0);
    ledcWrite(MOTOR_A_LPWM_PIN, pwmValue);

    ledcWrite(MOTOR_B_RPWM_PIN, pwmValue);
    ledcWrite(MOTOR_B_LPWM_PIN, 0);
  } else if (throttle < -0.05) {
    ledcWrite(MOTOR_A_RPWM_PIN, pwmValue);
    ledcWrite(MOTOR_A_LPWM_PIN, 0);

    ledcWrite(MOTOR_B_RPWM_PIN, 0);
    ledcWrite(MOTOR_B_LPWM_PIN, pwmValue);
  } else {
    ledcWrite(MOTOR_A_RPWM_PIN, 0);
    ledcWrite(MOTOR_A_LPWM_PIN, 0);

    ledcWrite(MOTOR_B_RPWM_PIN, 0);
    ledcWrite(MOTOR_B_LPWM_PIN, 0);
  }
}

void led(int r, int g, int b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}