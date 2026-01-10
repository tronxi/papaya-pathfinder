#include <AlfredoCRSF.h>
#include <HardwareSerial.h>
#include <Adafruit_NeoPixel.h>

#define RX_PIN 5
#define TX_PIN 4

#define RGB_PIN 48
#define NUM_PIXELS  1

#define PWMA 41
#define AIN1 40
#define AIN2 42
#define PWMB 38
#define BIN1 20
#define BIN2 21
#define STBY 39

const int DEADZONE = 50;

HardwareSerial crsfSerial(2);
Adafruit_NeoPixel rgb(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

AlfredoCRSF crsf;

void setup() {
    Serial.begin(115200);
    rgb.begin();
    rgb.show();
    led(255, 255, 255);

    pinMode(AIN1, OUTPUT);
    pinMode(AIN2, OUTPUT);
    pinMode(BIN1, OUTPUT);
    pinMode(BIN2, OUTPUT);
    pinMode(STBY, OUTPUT);

    analogWriteFrequency(PWMA, 20000);
    analogWriteResolution(PWMA, 8);
    analogWriteFrequency(PWMB, 20000);
    analogWriteResolution(PWMB, 8);

    digitalWrite(STBY, HIGH);

    stopMotorA();
    stopMotorB();

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
            startMotorA(speed, 1);
        } else if (valA < (1500 - DEADZONE)) {
            int speed = map(valA, 1500 - DEADZONE, 1000, 0, 255);
            speed = constrain(speed, 0, 255);
            startMotorA(speed, 0);
        } else {
            stopMotorA();
        }

        if (valB > (1500 + DEADZONE)) {
            int speed = map(valB, 1500 + DEADZONE, 2000, 0, 255);
            speed = constrain(speed, 0, 255);
            startMotorB(speed, 1);
        } else if (valB < (1500 - DEADZONE)) {
            int speed = map(valB, 1500 - DEADZONE, 1000, 0, 255);
            speed = constrain(speed, 0, 255);
            startMotorB(speed, 0);
        } else {
            stopMotorB();
        }
    } else {
        led(255, 0, 0);
        Serial.println("Waiting for transmitter connection...");
    }

  delay(20);
}

void startMotorA(uint8_t speed, uint8_t direction) {

  if (direction == 1) {
    digitalWrite(AIN1, HIGH);
    digitalWrite(AIN2, LOW);
  } else {
    digitalWrite(AIN1, LOW);
    digitalWrite(AIN2, HIGH);
  }

  analogWrite(PWMA, speed);
}

void startMotorB(uint8_t speed, uint8_t direction) {

  if (direction == 1) {
    digitalWrite(BIN1, HIGH);
    digitalWrite(BIN2, LOW);
  } else {
    digitalWrite(BIN1, LOW);
    digitalWrite(BIN2, HIGH);
  }

  analogWrite(PWMB, speed);
}

void stopMotorA() {
  digitalWrite(AIN1, LOW);
  digitalWrite(AIN2, LOW);
  analogWrite(PWMA, 0);
}

void stopMotorB() {
  digitalWrite(BIN1, LOW);
  digitalWrite(BIN2, LOW);
  analogWrite(PWMB, 0);
}

void led(int r, int g, int b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}
