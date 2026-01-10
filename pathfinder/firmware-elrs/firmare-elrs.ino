#include <AlfredoCRSF.h>
#include <HardwareSerial.h>
#include <Adafruit_NeoPixel.h>
#include <ESP32Servo.h>

#define RX_PIN 16
#define TX_PIN 17

#define RGB_PIN 48
#define NUM_PIXELS  1

#define SERVO_RF_PIN 4
#define SERVO_RB_PIN 5
#define SERVO_LF_PIN 47
#define SERVO_LB_PIN 21

static const int SERVO_CENTER = 90;
static const int SERVO_MAX_DELTA = 60;

Servo rf, rb, lf, lb;

const int DEADZONE = 50;

HardwareSerial crsfSerial(2);
Adafruit_NeoPixel rgb(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

AlfredoCRSF crsf;

void setup() {
    Serial.begin(115200);
    rgb.begin();
    rgb.show();
    led(255, 255, 255);

    attachServo(rf, SERVO_RF_PIN);
    attachServo(rb, SERVO_RB_PIN);
    attachServo(lf, SERVO_LF_PIN);
    attachServo(lb, SERVO_LB_PIN);

    setSteering(0.0f);

    crsfSerial.begin(420000, SERIAL_8N1, RX_PIN, TX_PIN);

    crsf.begin(crsfSerial);

    Serial.println("Starting receiver...");
}

void loop() {
    crsf.update();

    if (crsf.isLinkUp()) {
        led(0, 255, 0);

        int valA = crsf.getChannel(3);
        int valB = crsf.getChannel(2);

        if (valA > (1500 + DEADZONE)) {
            int speed = map(valA, 1500 + DEADZONE, 2000, 0, 255);
            speed = constrain(speed, 0, 255);
        } else if (valA < (1500 - DEADZONE)) {
            int speed = map(valA, 1500 - DEADZONE, 1000, 0, 255);
            speed = constrain(speed, 0, 255);
        } else {
        }

        if (valB > (1500 + DEADZONE)) {
            int speed = map(valB, 1500 + DEADZONE, 2000, 0, 255);
            speed = constrain(speed, 0, 255);
        } else if (valB < (1500 - DEADZONE)) {
            int speed = map(valB, 1500 - DEADZONE, 1000, 0, 255);
            speed = constrain(speed, 0, 255);
        } else {
        }
    } else {
        led(255, 0, 0);
        Serial.println("Waiting for transmitter connection...");
    }

  delay(20);
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
