#include <AlfredoCRSF.h>
#include <HardwareSerial.h>
#include <Adafruit_NeoPixel.h>

#define RX_PIN 47
#define TX_PIN 21

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
static const int SERVO_MAX_DELTA = 35;
static const int SERVO_HARDWARE_MIN = 5;
static const int SERVO_HARDWARE_MAX = 175;

int TRIM_LF = -10;
int TRIM_RF = 0;
int TRIM_LB = -5;
int TRIM_RB = -3;


bool connectToWiFi(const char* ssid, const char* pass, uint32_t timeoutMs);
void handlePostData();
void setSteering(float steer);
void setMotor(float throttle);
void writeServo(int pin, int angle);
void setSpin(float spinVal);
void led(int r, int g, int b);

HardwareSerial crsfSerial(2);
Adafruit_NeoPixel rgb(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

AlfredoCRSF crsf;

void setup() {
  Serial.begin(115200);
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

  crsfSerial.begin(420000, SERIAL_8N1, RX_PIN, TX_PIN);

  crsf.begin(crsfSerial);

  Serial.println("Starting receiver...");
}

void loop() {
  crsf.update();

  if (crsf.isLinkUp()) {
    led(0, 255, 0);

    int rawSteering = crsf.getChannel(1);
    int rawThrottle = crsf.getChannel(3);
    int rawSpin = crsf.getChannel(4);

    float steeringVal = (rawSteering - 1500) / 500.0;
    float throttleVal = (rawThrottle - 1500) / 500.0;
    float spinVal = (rawSpin - 1500) / 500.0;

    float deadzone = 0.1;

    if (abs(spinVal) > deadzone && abs(throttleVal) < deadzone && abs(steeringVal) < deadzone) {
      setSpin(spinVal);
    } else {
      if (abs(steeringVal) < deadzone) steeringVal = 0;
      if (abs(throttleVal) < deadzone) throttleVal = 0;
      setSteering(steeringVal);
      setMotor(throttleVal);
    }
  } else {
    led(255, 0, 0);
    Serial.println("Waiting for transmitter connection...");
  }

  delay(20);
}

void writeServo(int pin, int angle) {
  angle = constrain(angle, SERVO_HARDWARE_MIN, SERVO_HARDWARE_MAX);
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

void setSpin(float spinVal) {
  spinVal = constrain(spinVal, -1.0f, 1.0f);

  int angle = 45;

  int lf = SERVO_CENTER_ANGLE + TRIM_LF + angle;
  int rf = SERVO_CENTER_ANGLE + TRIM_RF - angle;
  int lb = SERVO_CENTER_ANGLE + TRIM_LB - angle;
  int rb = SERVO_CENTER_ANGLE + TRIM_RB + angle;

  writeServo(SERVO_LF_PIN, lf);
  writeServo(SERVO_RF_PIN, rf);
  writeServo(SERVO_LB_PIN, lb);
  writeServo(SERVO_RB_PIN, rb);

  int pwm = abs(spinVal) * 255;

  if (spinVal < 0) {
    ledcWrite(MOTOR_A_RPWM_PIN, 0);
    ledcWrite(MOTOR_A_LPWM_PIN, pwm);

    ledcWrite(MOTOR_B_RPWM_PIN, 0);
    ledcWrite(MOTOR_B_LPWM_PIN, pwm);

  } else {
    ledcWrite(MOTOR_A_RPWM_PIN, pwm);
    ledcWrite(MOTOR_A_LPWM_PIN, 0);
    ledcWrite(MOTOR_B_RPWM_PIN, pwm);
    ledcWrite(MOTOR_B_LPWM_PIN, 0);
  }
}

void led(int r, int g, int b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}