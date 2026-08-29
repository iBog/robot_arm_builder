# 🦾 Robo-Arm Builder

**English** · [Русский](README.ru.md)

An interactive 3D constructor for robotic arms, built with [three.js](https://threejs.org/).
The whole project is **a single file, `index.html`** — no server, no build step, no install:
double-click it and it opens in your browser.

![Robo-Arm Builder](scr/screenshot.png)

## Who this is for

This is made for **complete beginners in robotics** — for people who want to get started but don't
yet know what would actually suit them.

Assemble an arm out of basic components, drag the sliders and watch every joint move, then open the
BOM tab and see what that exact arm would cost in real motors, drivers and hardware. Try a few
configurations and you get a feel for where to enter the field — whether out of curiosity and
self-development, or professional interest.

It is a **sandbox for building intuition before spending money**: not a CAD system, not an assembly
manual, and not a kinematics simulator. Prices and part choices are indicative, meant to give you a
sense of scale — a 3-axis arm versus a 6-axis one with a rail underneath is a difference you can
see here in a couple of clicks.

**A good first arm:** `yaw → pitch → link → pitch → link → roll → gripper`. That's the classic
4-axis manipulator with a gripper — it's the default configuration when you open the page. Remove
the last `roll`, and it gets simpler and cheaper; add a `rail` at the base, and the arm gains reach
but needs a linear rail and one more motor.

## Features

- **Sequential assembly from the base up**: yaw (turntable), pitch (hinge), roll (axial rotation),
  link (segment), prismatic (telescope), ball joint, offset (bracket), rail (linear rail),
  gripper, suction cup.
- **Live control** — a slider for every joint moves the arm in real time.
- **Motion zones** — translucent dashed sectors and lines show each joint's range of travel
  (toggled per component with the *zone* checkbox).
- **JSON configuration** — the arm structure serialises into editable JSON: copy configurations
  you like, paste them back and press Apply.
- **🎲 Generate Arm** — a random generator that follows the logic of real manipulators.
- **✨ Start New Project** — clears the arm and returns the camera to its starting view, then
  points a hint at the toolbar so you know where to add the first component.
- **Animate** — smooth sinusoidal motion of every joint, toggled in the top-left corner of the
  3D view.
- **Auto camera** — the camera pulls back on its own if the arm grows out of frame.
- **🛒 BOM (shopping list)** — a bill of materials computed from the current arm, grouped by the
  component each part belongs to, with a subtotal per group and swappable alternatives for the
  common parts. Above the table is the arm's name in standard nomenclature
  ("4-axis manipulator with gripper").
- **Two themes** — a dark one and a light one in the light-grey tones of 3D editors, switched with
  the moon/sun toggle in the panel header. The 3D viewport, floor, grid and arm parts are recoloured
  along with the interface.
- **Two languages** — English and Russian, switched with the EN/RU toggle in the panel header.
  Both the theme and the language are remembered in the browser.
- **Version number** — shown next to the title in the panel header, so you always know which build
  you are looking at.

## Getting started

Open `index.html` in a browser. The only thing you need an internet connection for is the three.js
CDN (jsdelivr).

**Controls:** LMB — rotate the view · wheel — zoom · RMB — pan.

## Components

| Type | What it is | Parameter | Range |
|---|---|---|---|
| `yaw` | Turntable: rotation around the vertical axis | `angle` | −180…180° |
| `pitch` | Hinge joint: swings the arm up and down | `angle` | −120…120° |
| `roll` | Rotation around the arm's own axis | `angle` | −180…180° |
| `link` | Rigid segment between joints | `length` | 0.3…3 |
| `prismatic` | Telescopic linear actuator | `ext` | 0…1.2 |
| `spherical` | Ball joint: two axes in one node | `pitch`, `yaw` | −90…90°, −180…180° |
| `offset` | L-bracket: sideways offset of the axis | `length` | 0.2…1.5 |
| `rail` | Linear rail: the carriage carries everything above it | `pos` | −2…2 |
| `gripper` | Two-finger gripper | `open` | 0…100% |
| `suction` | Vacuum suction cup | `power` | 0…100% |

Components are added in order from the base towards the tip of the arm.

## JSON format

```json
[
  { "type": "yaw",     "angle": 0 },
  { "type": "pitch",   "angle": 40 },
  { "type": "link",    "length": 1.2 },
  { "type": "roll",    "angle": 0 },
  { "type": "gripper", "open": 60 }
]
```

The JSON tab always mirrors the current arm. Edit it by hand and press **Apply**: unknown component
types are rejected, values are clamped to their allowed range, and missing parameters fall back to
their defaults.

## About the shopping list

The list is **grouped by the component each part belongs to** — a Yaw block, a Pitch block, and so
on, in the same order as the arm, each with its own subtotal. Repeated components are merged
(`Pitch ×2`) with quantities multiplied. Last comes the base kit, one per arm: controller, buck
converter, power supply, M3 hardware and one capacitor per stepper driver.

Every rotating axis pulls in a motor, a driver, a bearing to carry the load, and an endstop to home
against, plus a transmission wherever the motor doesn't sit on the axis directly — a belt on the
turret, the roll and the rail, a planetary gearbox on the pitch joints. Linear parts add their guide
and screw; the suction cup adds a solenoid valve and a relay to switch the pump.

**Alternatives:** parts with a dropdown can be swapped for a common substitute — an ESP32 for an
Arduino Mega, a Raspberry Pi Pico, a Pi Zero 2 W or a Pi 4; a NEMA 17 for a NEMA 23 or a hobby
servo; a planetary gearbox for a printed cycloidal drive, a worm gear or a harmonic drive. The
swap changes the name and the price everywhere that part appears, so you can see what a cheaper or
beefier build would cost. It does not change what the arm needs.

Prices are approximate, in USD, at the level of AliExpress listings. Treat the total as an order of
magnitude ("this arm is roughly $150, that one is roughly $400"), not as a quote.
