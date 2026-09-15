// Fruit Keyboard for Arduino UNO R3
// Each analog pin uses its internal pull-up and becomes active when connected
// to GND through a switch, conductive object, or grounded person.

const unsigned long SERIAL_BAUD = 9600;
const unsigned long DEBOUNCE_MS = 30;
const int TOUCH_THRESHOLD = 1000;

const byte KEY_COUNT = 6;
const byte keyPins[KEY_COUNT] = {A0, A1, A2, A3, A4, A5};
const char *const keyNames[KEY_COUNT] = {
  "apple",
  "banana",
  "orange",
  "lemon",
  "watermelon",
  "grapes",
};

bool stablePressed[KEY_COUNT] = {};
bool lastReading[KEY_COUNT] = {};
unsigned long readingChangedAt[KEY_COUNT] = {};

void sendKeyEvent(bool pressed, const char *keyName) {
  Serial.print(pressed ? F("DOWN:") : F("UP:"));
  Serial.println(keyName);
}

void setup() {
  Serial.begin(SERIAL_BAUD);

  for (byte index = 0; index < KEY_COUNT; index++) {
    pinMode(keyPins[index], INPUT_PULLUP);
  }

  Serial.println(F("READY:FRUIT-KEYBOARD"));
}

void loop() {
  const unsigned long now = millis();

  for (byte index = 0; index < KEY_COUNT; index++) {
    const bool pressed = analogRead(keyPins[index]) < TOUCH_THRESHOLD;

    if (pressed != lastReading[index]) {
      lastReading[index] = pressed;
      readingChangedAt[index] = now;
    }

    if (
      pressed != stablePressed[index] &&
      now - readingChangedAt[index] >= DEBOUNCE_MS
    ) {
      stablePressed[index] = pressed;
      sendKeyEvent(pressed, keyNames[index]);
    }
  }
}
