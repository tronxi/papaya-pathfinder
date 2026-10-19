# Papaya Pathfinder

A Mars exploration game featuring a six-wheel rover, rocker-bogie suspension, procedural regions, and scientific missions. Built with Three.js, Rapier, and Vite.

The same game runs in a web browser or can be packaged as an Android APK.

## Setup

Use Node.js 22.12 or later and npm. Install dependencies from the project root:

```sh
npm ci
```

## Web version: HTML and JavaScript

### Run during development

```sh
npm run dev
```

Open the URL printed by Vite in the terminal. Code changes are reflected during development.

To access the game from a phone on the same Wi-Fi network:

```sh
npm run dev -- --host 0.0.0.0
```

On your phone, open your computer's local IP address using the port shown by Vite, for example `http://192.168.1.50:5173`. Your computer's firewall must allow the connection.

### Build the web version for distribution

```sh
npm run build
```

The compiled version is generated in `dist/`:

```text
dist/
├── index.html
├── assets/                  # Compiled JavaScript and other resources
├── papaya-pathfinder.fbx     # Rover model used by the game
└── model.glb                 # Legacy model copied from public/
```

To preview this build locally:

```sh
npm run preview
```

To publish it, copy the entire contents of `dist/` to a static hosting service, served from the root of a domain or subdomain. The current configuration uses absolute paths such as `/assets/` and `/papaya-pathfinder.fbx`.

Copying only `index.html` is not enough: the JavaScript and model files are also required. Serve the game over HTTP or HTTPS; opening the HTML directly using `file://` may prevent modules and resources from loading.

## Android version: APK

### Required tools

In addition to the web dependencies, install:

- JDK 17 or later, with `java`, `javac`, `jar`, and `keytool` available. The APK has been built using JDK 21.
- Android SDK Platform **35**.
- Android SDK Build Tools. Version **36.1.0** has been used.

You can install SDK components through Android Studio's SDK Manager. Android Studio does not need to be open to generate the APK.

The build script automatically looks for the SDK in:

- macOS: `~/Library/Android/sdk`.
- Linux: `~/Android/Sdk`.

If your SDK is installed elsewhere, set `ANDROID_HOME` or `ANDROID_SDK_ROOT`. For example, on macOS:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

To select a particular JDK, set `JAVA_HOME` to its installation directory. You can also select an installed Build Tools version:

```sh
export ANDROID_BUILD_TOOLS="36.1.0"
```

These packaging instructions apply to macOS and Linux.

### Generate the APK

From the project root:

```sh
npm run android:apk
```

This command:

1. Builds the web version with Vite.
2. Copies the files from `dist/` into the APK's local assets. The unused legacy `model.glb` is excluded.
3. Compiles Android resources and Java source code, then generates DEX bytecode.
4. Aligns the APK, signs it with the local development key, and verifies its signature and alignment.

The output file is:

```text
artifacts/papaya-pathfinder-debug.apk
```

Copy this file to your phone and open it to install the application. Android may ask you to allow installations from the file manager or browser you use. The app requires Android 8 or later and a WebView with WebGL 2 support.

### How the Android app works

`MainActivity.java` creates a fullscreen WebView in landscape orientation. The HTML, JavaScript, and rover model are bundled inside the APK.

The WebView opens `https://appassets.androidplatform.net/index.html`, but this is a virtual address: `shouldInterceptRequest()` serves the bundled files using `getAssets().open(...)`. The game does not connect to a server to load its content.

Mission progress is stored locally. Mobile devices use a lighter performance profile with adaptive resolution, fewer graphical effects, and physics running at 60 Hz.

### Update the app

After changing the game, run:

```sh
npm run android:apk
```

Install the new APK over the previous version without uninstalling the application.

The development signing key is stored in `android/build/debug.keystore`. Keep this file: updates must use the same key to install over the previous version and retain its data. Deleting the entire `android/build/` directory also deletes this key.

This APK is signed for development. Publishing on Google Play requires production signing and distribution configuration. The build process verifies compilation, signing, and alignment, but functionality and performance must be checked on a real device.

## Beacon races

Choose one of six courses and use **Correr** to race the red rover. Starting a race places both rovers on the grid and begins a three-second countdown.

| Course | Approximate distance | Checkpoints | Time limit |
| --- | --- | --- | --- |
| Circuito de Ares Vallis | 253 m | 13 | 4 min |
| Dunas de Nili Patera | 214 m | 8 | 3 min 30 s |
| Rally de Valles Marineris | 252 m | 12 | 4 min |
| Ascenso al monte Sharp | 240 m | 14 | 4 min |
| Travesía Jezero–Elysium | 296 m | 12 | 4 min 30 s |
| Gran Ruta de Tharsis | 868 m | 41 | 11 min |

Distances measure the horizontal route; actual wheel travel varies with the terrain and your chosen line. The selector shows each course's distance, and the panel shows its checkpoint count and time limit before starting.

Drive through the course's numbered checkpoints in order; the last one is marked **META**. Your next checkpoint is highlighted in gold, and the course appears on the map. The race panel shows elapsed time and the opponent's checkpoint count.

If the red rover finishes first, you can still finish your lap and record your time. Personal bests are saved separately for each course. Use **Abandonar** to cancel or **Repetir** after finishing. The red rover resumes its patrol when the race ends. Each course has its own distance-based time limit. Extended courses use new record IDs so their times are not compared with those of the old, shorter layouts.

## Real Mars inspirations

Race names, region labels, and expedition sites reference real Martian locations and missions. The terrain is a fictional, compact landscape inspired by those places, rather than a reconstruction of their positions, distances, or topography. The lander is a fictional tribute to Pathfinder.

- **Ares Vallis / Pathfinder:** [NASA's Mars Pathfinder mission](https://science.nasa.gov/mission/mars-pathfinder/).
- **Nili Patera:** [NASA imagery of its dune field](https://science.nasa.gov/photojournal/investigating-mars-nili-and-meroe-paterae-3/).
- **Valles Marineris:** [NASA imagery of layered terrain in Candor Chasma](https://www.nasa.gov/solar-system/planets/mars/valles-marineris/).
- **Jezero / Perseverance:** [NASA's Perseverance science highlights](https://science.nasa.gov/mission/mars-2020-perseverance/science-highlights/).
- **Gale / Mount Sharp:** [NASA's sedimentation and erosion overview](https://science.nasa.gov/resource/sedimentation-and-erosion-in-gale-crater-mars/).
- **Elysium / Tharsis:** [NASA's overview of the Elysium volcanic region](https://science.nasa.gov/resource/elysium/).

Renaming preserves existing mission progress and race records; internal IDs and course layouts are unchanged.

## Spherical planet and terrain streaming

The world is a real sphere with a **50 km radius**, roughly **314 km around**. The original 400 × 400 m map remains the landing region, including its rocks, research sites, race courses, and red rival. Most of the remaining surface is open Martian terrain with gentle relief and occasional dune fields. This is a fictional miniature planet, not a geographical reconstruction of Mars.

Terrain is generated deterministically in 50 m tiles around the rover. Near tiles have finer geometry and physical collision; distant tiles use simpler geometry. Tiles and their collision data are disposed of as they leave the loaded area. Desktop keeps at most 169 tiles, mobile 81, plus one coarse distant surface patch. The original landing region stays in memory but sleeps outside its vicinity.

Physics and rendering use a moving local tangent frame, backed by double-precision planetary coordinates. Gravity points toward the planet's center, and changing frames preserves the rover's position, orientation, velocity, and camera. Terrain and texture coordinates remain tied to planetary locations. There is no map-edge wrap or teleport when travelling around the globe.

Away from the landing region, the minimap follows the nearby terrain and expedition navigation shows coordinates and a spherical distance/bearing to the selected research site. Starting a race returns to its grid in the landing region. Research progress and race records are preserved.

Press **M** or tap **PLANETA** to open an orbital globe view. Drag to rotate freely, including across the poles. The globe uses uniform geometry and per-pixel surface detail. Drag sensitivity follows the visible ground scale at the current altitude and stops when released. Scroll or use **+/−** to approach within eight metres of the surface. Nearby terrain begins loading before it is visible; between 1,800 and 100 metres the orbital globe gradually blends into the actual streamed terrain, rocks, structures, and rover. The views share camera framing, and zoom eases smoothly instead of switching at a single altitude. Choose **Descender aquí** to place the rover at the center of the view. Only the nearby destination terrain is loaded. **Volver al rover**, M, or Escape returns without moving. The game pauses while viewing the globe; descending to a new location cancels the current race. The green marker shows the rover and the gold marker shows the landing region.

## Controls

Touch button labels are currently displayed in Spanish; their exact labels are included below.

| Action | Keyboard | Touchscreen |
| --- | --- | --- |
| Forward / reverse | W / S | Left stick forward / back |
| Steer | A / D | Left stick left / right |
| Turn in place | A or D alone | Left stick sideways without forward input |
| Brake | Space | Freno |
| Upward boost | F or click IMPULSO | Tap IMPULSO |
| Take off / ascend | Hold Z | Hold Despegar / Subir |
| Fast forward flight | Hold W + G | Left stick forward + tap Rápido to toggle |
| Descend / land | Hold X | Hold Bajar |
| Pitch nose down / up in powered flight | Up / Down arrow | Right stick forward / back |
| Lateral thrust in flight | Left / Right arrow | Right stick left / right |
| Scan while stopped near a target | Hold E | Hold Escanear |
| Change destination | N | Menu → Destino |
| Orbital planet view | M (Escape to return) | PLANETA button |
| Move the camera | Drag with the mouse | Drag on the terrain |
| Zoom in / out | Mouse wheel | Pinch with two fingers |

## Main files

| File | Purpose |
| --- | --- |
| `src/main.js` | Initialization, terrain, rover, collisions, and game loop |
| `src/driving.js` | Motor, braking, automatic thrust, and steering |
| `src/autonomous-rover.js` | Red autonomous rover, patrol, obstacle avoidance, and independent suspension |
| `src/beacon-race.js` | Beacon circuits, countdown, checkpoint detection, race results, and personal bests |
| `src/suspension.js` | Wheel support queries and rocker-bogie suspension |
| `src/mars-world.js` | Regions, research sites, map, and missions |
| `src/planet.js` | Spherical coordinates, moving local frames, procedural terrain, and bounded tile streaming |
| `src/planet-view.js` | Interactive orbital globe, zoom, and descent to a selected location |
| `src/planet-flight.js` | Distant globe LOD, space presentation, and flight camera range |
| `src/visuals.js` | Textures, materials, dust, and tire tracks |
| `src/graphics.js` | Rendering and mobile graphics profile |
| `src/touch-controls.js` | Analog joysticks, multitouch actions, flight mode, and cancellation |
| `src/touch-controls.css` | Responsive thumb controls and mobile HUD layout |
| `scripts/build-apk.mjs` | APK generation and signing |
| `android/app/src/main/` | Android manifest, Java activity, theme, and icon |

Generated files in `dist/`, `artifacts/`, and `android/build/` are excluded from Git. See also the [Android-specific documentation](android/README.md).

The upward boost gives a hop of about 1.8 m from rest on level ground. There is no cooldown: each press adds momentum along the rover’s local up axis, including in mid-air. Pitch and roll redirect part of the impulse forward, backward, or sideways, as with wheel-mounted thrusters. Holding F does not repeat it.

In the air, W/S (or the left touch stick) fire forward/reverse thrusters, A/D rotate the rover about its own axis; Left/Right arrow keys (or the right touch stick) fire lateral thrusters to move sideways, and Space/Freno brakes horizontal drift. Exhaust swivels opposite the requested thrust and stays visible while thrust is applied; F/IMPULSO fires the wheel thrusters along the rover’s local up axis without a cooldown.

Hold G (or toggle Rápido on touchscreens) for high-power continuous wheel thrust: up to 1,800 m/s² of forward acceleration with W + G, and 60 m/s² of reverse or lateral acceleration. Forward/reverse and lateral thrusters are also stronger while G is held, with less horizontal drag for long-distance flight. Z / Subir commands stabilized radial ascent; F retains the short impulse along the rover’s inclination. In the air, G combined with W/S or Left/Right arrow keys switches to directional flight; level flight holds altitude relative to the spherical planet, while inclined forward flight climbs or dives. Forward boost eases toward a 6,000 m/s cruise speed (about 21,600 km/h), allowing a planetary lap in roughly one minute, reduced near the ground. Fast flight uses a smaller set of coarse visual terrain tiles and larger local frames, restoring detailed terrain collision when approaching the surface. Acceleration ramps smoothly, fast-flight steering is less sensitive, and stabilization reduces unwanted sideways drift. The exhaust follows the thrust direction. Once powered flight is engaged, releasing vertical input holds the current altitude; X commands descent and actual ground contact restores normal driving. Releasing W while G is held coasts without switching to lift; G never commands ascent. Releasing forward input also cuts residual forward thrust. F remains a separate single impulse.

Desktop rendering is capped at 60 FPS during play and 30 FPS while the player is idle; hidden tabs pause simulation and rendering. Physics runs at 60 Hz. The desktop Retina framebuffer is capped at 1.5× pixel ratio and three million pixels, with HDR, contact shading, and 2× MSAA retained.


Airborne movement sweeps the chassis and six tyres along the full 3D path against terrain and rocks. Low passes progressively shed excessive horizontal speed below 80 m of clearance, preventing orbital-speed ground skims. Impacts dissipate flight velocity, and landing returns control to the ground motor without converting flight energy into a suspension bounce.

Forward driving automatically uses wheel-thruster assistance. The normal cruising speed is 8 m/s (28.8 km/h); races retain the shared 7 m/s limit for the player and rival. Braking or coasting cuts the assistance. Exhaust effects are reserved for impulses and flight; ordinary ground driving has no thruster animation.

## Continuous surface-to-space flight

Fly the actual rover away from the surface with **Z** (Subir), travel with **W/S**, rotate with **A/D**, and use **X** to descend. **W + G** provides fast planetary travel at the current altitude. G controls speed independently of ascent; hold Z only when you want to climb. The flight controller holds the current altitude when vertical thrust is released, so coasting does not send the rover upward. Hold **Up arrow** to pitch the nose down (up to 85°), or **Down arrow** to raise it. The selected pitch is retained after release; forward thrust follows that inclination, enabling steep dives and climbing flight. Left/Right arrows provide lateral thrust. A/D turns with gentle banking, and boosted steering remains responsive at high speed. **Space** brakes and levels the rover; **X** levels it for a controlled landing. Releasing thrust smoothly brakes vertical motion into a hover.

As altitude increases, the same game scene reveals the curved globe, transitions to a dark sky and stars, and adjusts the camera to show the planet below. Mouse dragging still lets you look around. Distant surface detail uses a coarse spherical LOD; detailed sectors and contact shading sleep in high flight and return during descent. There is no orbital-view switch or teleport in this flight path.

Hold **X** to approach and land at any location. Descent slows near the surface, impacts dissipate flight energy, and actual tyre contact restores normal rover driving and the rocker-bogie suspension. The optional M/PLANETA inspection view remains separate.

## Planetary regions and exploration

Beyond the original landing region, the entire sphere now has deterministic ochre plains,
wind-shaped dunes, cratered terrain, layered canyons, sedimentary plateaus, and basalt fields.
These are fictional landscapes inspired by Mars, not a geographic reconstruction. Region
colors are shared by the streamed terrain and flight globe; traction and rock density vary
with the surface. The original landing area, missions, rival, and races remain in place.

Nearby 256-metre cube-face sectors stream in weathered rocks and three kinds of equipment:
abandoned probes, geological stations, and expedition beacons. Rocks reuse the original
textured hulls; nearby rocks and equipment have matching convex colliders. Positions are
seeded by permanent planetary addresses, so unloading, returning, or crossing a local
coordinate frame does not reshuffle them. Objects fade in by distance and altitude.
Only nearby sectors are retained, and high-speed/high-altitude flight sleeps local props.

Away from the landing region, the mission panel names the current region and guides you
toward a nearby site (or back to the original mission if no site is loaded). Stop within
seven metres and hold **E / Escanear** for 2.5 seconds to register a discovery. Discoveries
are stored in this browser or Android WebView's local storage; they are independent of the
original seven missions. These sectors add exploration destinations, not additional races.

`src/planet-regions.js` defines global landforms and colors; `src/planet-life.js` manages
bounded prop sectors, collisions, site navigation, and persistent discoveries.

### Large-scale relief

Continuous planetary mountain ranges, broad depressions, raised crater rims, and uplands
now underlie the six local surface regions. Near the original landing area, a range about
5.8 km from the base (x +3.2 km, z -4.8 km) rises roughly 1,040 m above the reference sphere; an impact basin
about 8.5 km from the base (x -5.2 km, z -6.8 km) reaches about -748 m, and a western range reaches about
814 m. These are fictional game landforms, not named Martian geographic measurements.
The original landing terrain is unchanged; the large relief blends in beyond 400–2,200 m.
The flight globe, intermediate surface, streamed mesh, rocks, and collision terrain all
sample the same height field. Wheel and camera ground queries now start relative to the
local terrain height so they work on high peaks and in deep depressions.

### Ground detail everywhere

The streamed regions also carry physical small-scale terrain: irregular four-metre hills,
metre-scale undulations, shallow ruts, and wheel-scale bumps. Smooth 3D noise anchors these
features to the planet, so returning to a sector or crossing a local frame preserves them.
Dunes remain gentler and basalt fields rougher. This relief is included in the collision
mesh, rather than being only a shading effect. Nearby 50 m tiles use 64 subdivisions on
desktop (about 0.78 m spacing, matching the original area), or 48 on mobile (about 1.04 m).
Outer tiles retain lower detail and morph between resolutions. Plains now have about the
original area's rock density, with fewer rocks in dunes and more in basalt; only nearby
rocks receive physics colliders. The original landing terrain remains unchanged.

### Draw distance and predictive streaming

Terrain sectors now extend roughly 600 m from the rover on desktop and 400 m on mobile,
with a wider coarse background and the planetary intermediate mesh beyond them. Several
LOD rings preserve detail farther away. Fast flight uses the extended sector window instead
of shrinking to 25 coarse tiles. Forward velocity shifts preloading ahead of the rover;
nearby collision sectors retain priority. The visible outer edge fades inside the preload
boundary so newly generated edge sectors can warm up before becoming prominent.

Floating-origin changes transport the old visible terrain into the new frame and retain it
briefly while replacement sectors become ready, rather than deleting the surface at once.
Nearby required sectors start at full coverage. Rocks and sites also preload ahead, draw
farther away, and remain available during high-speed flight. Work per frame and retained
sector counts remain bounded; visual performance still depends on device and travel speed.

### Orbital view quality

The inspection globe now uses a welded cube sphere (153,602 vertices on desktop), avoiding
the stretched triangles and pinched normals of a latitude/longitude mesh. A shared
procedural material computes surface colors and mineral detail per fragment for both
orbital inspection and actual flight. Subpixel patterns are filtered, and metre-scale
height noise is omitted from distant meshes instead of being undersampled into artifacts.
An adaptive 192 × 192 patch on desktop (96 × 96 on mobile) follows the zoom; the underlying
globe is cut away beneath its center to prevent overlapping coarse triangles. The HDR
crossfade targets use multisampling where supported. Orbital lighting and marker size
also adjust the presentation without changing ground-driving lighting.

The close-up preview now streams rocks and expedition equipment at the observed location,
without moving the rover or registering discoveries. Flight-only fallback layers are
excluded from that preview. Verified in headless Chrome with real WebGL rendering:
full globe, intermediate zoom, actual terrain at 8 m, and return to driving, with no captured
JavaScript or shader errors. This does not establish performance on every Android device.

### Touch gamepad

Touch devices use a proportional left stick for forward/reverse movement and steering;
small deflections give gentler input and the center has a dead zone. A second stick appears
in flight for nose pitch and lateral thrust. Large circular actions provide braking,
impulse, takeoff/ascent, descent, and scanning. Rápido is a toggle during flight, so fast
travel and two-stick manoeuvres do not require a third finger; it clears on landing or
focus loss. Brief ground bumps do not switch the interface to flight mode.

The map stays visible beside the action area. Mission and race panels start collapsed on
touch devices and can be expanded independently; destination selection is in the tools
menu. Drag the unobstructed world to move the camera. Pointer capture keeps each thumb's
input independent, and cancellation, focus loss, and orientation changes release controls.
The keyboard controls remain available. Verified with Chrome touch emulation at 390×844
and 844×390, including simultaneous steering/braking, two-stick flight, boost toggling,
and touch cancellation. The APK was not rebuilt.
