import * as THREE from 'three';
import { createOrbitalObjectives } from './orbital-objectives.js';
import { createPlanetGlobeGeometry } from './planet-geometry.js';
import { mobileGraphics } from './performance.js';
import { addPlanetSurfaceDetail } from './planet-material.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

// A lightweight orbital scene, separate from the local terrain/physics world.
// A uniform globe and an adaptive close-up patch share the terrain height field.
export function createPlanetView({ renderer, planet, getPosition, onEnter, onExit, onDescend, renderSurface, catalog, explorationPanel, refreshExploration, racePanel, refreshRace }) {
    const objectives = createOrbitalObjectives({ renderer, catalog, mobile: mobileGraphics });
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b12);
    const radius = planet.radius;
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, radius * 30);
    let controls = null;
    function dragSensitivity() {
        // Trackball deltas are normalized to canvas width. Match the ground
        // distance under each pixel, rather than the planet's center distance.
        return Math.min(1.6, altitude * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.aspect / radius);
    }
    const surface = new THREE.MeshStandardMaterial({ roughness: 1 });
    addPlanetSurfaceDetail(surface);
    const patchSurface = new THREE.MeshStandardMaterial({roughness:1,transparent:true,depthWrite:true});
    addPlanetSurfaceDetail(patchSurface,{patch:true});
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    const globeGeometry = createPlanetGlobeGeometry(planet, mobileGraphics);
    scene.add(new THREE.Mesh(globeGeometry, surface));
    scene.add(new THREE.HemisphereLight(0xffe5cc, 0x35251f, 0.65));
    const sun = new THREE.DirectionalLight(0xfff4e5, 3.0);
    sun.position.set(radius * 3, radius * 2, radius * 4); scene.add(sun);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.006, 80, 48), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
        uniforms: { strength: { value: 1 } },
        vertexShader: `varying vec3 n; varying vec3 view;
            void main(){ vec4 p = modelViewMatrix * vec4(position,1.0); n=normalize(normalMatrix*normal); view=normalize(-p.xyz); gl_Position=projectionMatrix*p; }`,
        fragmentShader: `uniform float strength; varying vec3 n; varying vec3 view;
            void main(){float rim=pow(1.0-abs(dot(normalize(n),normalize(view))),4.0);gl_FragColor=vec4(0.78,0.43,0.24,rim*0.32*strength);}`
    })); scene.add(atmosphere);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x9ce6c5 })); scene.add(marker);
    const home = new THREE.Mesh(marker.geometry, new THREE.MeshBasicMaterial({ color: 0xffd290 }));
    home.position.set(0, radius * 1.008, 0); scene.add(home);
    const stars = new Float32Array(600 * 3);
    let seed = 92715;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 600; i++) {
        const y = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
        stars.set([r * Math.cos(a) * radius * 10, y * radius * 10, r * Math.sin(a) * radius * 10], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xcbd5e5, size: radius * 0.006, depthWrite: false })));
    const patchSegments=mobileGraphics?96:192;
    const patchGeometry = new THREE.PlaneGeometry(2,2,patchSegments,patchSegments);
    const patch = new THREE.Mesh(patchGeometry, patchSurface); patch.visible = false; scene.add(patch);
    const patchDirection = new THREE.Vector3();
    const patchBasis = new THREE.Quaternion();
    const patchSample = new THREE.Vector3();
    let patchExtent=0;
    const patchFocus={value:new THREE.Vector3()},patchHole={value:0};
    const surfaceHook=surface.onBeforeCompile;
    surface.onBeforeCompile=function(shader,renderer) {
        surfaceHook.call(this,shader,renderer);
        shader.uniforms.orbitPatchFocus=patchFocus;shader.uniforms.orbitPatchHole=patchHole;
        shader.fragmentShader='uniform vec3 orbitPatchFocus;\nuniform float orbitPatchHole;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('vec3 p = flightSurface;',`
            vec3 p = flightSurface;
            if(orbitPatchHole>0.0 && distance(normalize(p),orbitPatchFocus)*${radius.toFixed(1)}<orbitPatchHole)discard;
        `);
    };
    const surfaceKey=surface.customProgramCacheKey();
    surface.customProgramCacheKey=()=>surfaceKey+'-orbital-patch-cutout';
    function updatePatch(direction, altitude) {
        patch.visible = altitude < 30000;
        patchHole.value=0;
        if (!patch.visible) return;
        const extent=THREE.MathUtils.clamp(altitude*1.4,700,24000);
        const opacity=1-THREE.MathUtils.smoothstep(altitude,18000,30000);
        patchSurface.opacity=opacity;
        if(patchDirection.distanceTo(direction)*radius>extent*.08 || Math.abs(extent-patchExtent)>extent*.12) {
            patchDirection.copy(direction);patchExtent=extent;
            patchBasis.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
            const p=patchGeometry.attributes.position;
            for(let i=0;i<p.count;i++) {
                const x=(i%(patchSegments+1)/patchSegments-.5)*2*extent;
                const y=(.5-Math.floor(i/(patchSegments+1))/patchSegments)*2*extent;
                patchSample.set(x,y,radius).applyQuaternion(patchBasis).normalize();
                point.copy(patchSample).multiplyScalar(radius+planet.elevation(patchSample,extent*2/patchSegments<6));
                p.setXYZ(i,point.x,point.y,point.z);
            }
            p.needsUpdate=true;patchGeometry.computeVertexNormals();patchGeometry.computeBoundingSphere();
        }
        patchFocus.value.copy(patchDirection);
        if(opacity>.999)patchHole.value=patchExtent*.6;
    }
    const style = document.createElement('style');
    style.textContent = `
        #planet-view-toggle { position:fixed; right:max(14px,env(safe-area-inset-right)); left:auto; top:max(14px,env(safe-area-inset-top)); z-index:130; padding:0;
            color:#d9eee7; background:#16282de8; border:1px solid #729c9377; border-radius:5px;
            display:grid; place-items:center; width:44px; height:44px; box-sizing:border-box;
            cursor:pointer; touch-action:manipulation; }
        #planet-view-toggle svg { display:block; }
        #planet-orbit-reticle { display:none; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
            width:12px; height:12px; border:1px solid #fff0c799; border-radius:50%; z-index:121; pointer-events:none; }
        body[data-planet-view="true"] #planet-orbit-reticle { display:block; }
        #planet-orbit-panel { position:fixed; left:50%; bottom:max(20px,env(safe-area-inset-bottom)); transform:translateX(-50%);
            z-index:125; width:min(460px,calc(100vw - 28px)); box-sizing:border-box; padding:14px;
            background:#111e27ed; color:#dcece7; border:1px solid #739b9477; border-radius:8px; font:12px/1.5 ui-monospace,monospace; max-height:calc(100dvh - 90px); overflow-y:auto; }
        #planet-orbit-panel[hidden] { display:none; }
        #planet-orbit-panel strong { display:block; color:#f0cda1; font-size:14px; }
        #planet-orbit-panel p { margin:6px 0 10px; opacity:.8; }
        #planet-orbit-panel .orbit-buttons { display:flex; gap:8px; flex-wrap:wrap; }
        #planet-orbit-panel button { background:#294348; border:1px solid #7caaa080; border-radius:4px; color:#e1eee7;
            min-height:40px; padding:8px 12px; font:inherit; cursor:pointer; touch-action:manipulation; }
        #planet-orbit-panel button[data-land] { background:#65503b; }
        #planet-orbit-panel .orbit-header { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        #planet-orbit-panel .orbit-options { margin-top:10px; }
        #planet-orbit-panel .orbit-legend { margin-bottom:8px; font-size:10px; }
        #planet-orbit-panel [data-options-toggle] { display:none; }
        @media (max-width: 600px), (max-height: 500px) {
            #planet-orbit-panel { bottom:max(8px,env(safe-area-inset-bottom)); width:min(460px,calc(100vw - 16px));
                padding:8px; max-height:42dvh; overflow:hidden; font-size:11px; }
            #planet-orbit-panel .orbit-header { margin-bottom:6px; }
            #planet-orbit-panel strong { font-size:11px; flex-shrink:0; }
            #planet-orbit-panel [data-readout] { min-width:0; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            #planet-orbit-panel .orbit-primary { display:grid; grid-template-columns:44px 44px 1fr auto; gap:6px; }
            #planet-orbit-panel button { min-height:44px; padding:6px 10px; }
            #planet-orbit-panel [data-options-toggle] { display:block; }
            #planet-orbit-panel .orbit-options { display:none; }
            #planet-orbit-panel[data-expanded="true"] { display:flex; flex-direction:column; }
            #planet-orbit-panel[data-expanded="true"] .orbit-options { display:block; overflow-y:auto; min-height:0;
                overscroll-behavior:contain; border-top:1px solid #739b9444; padding-top:8px; }
            #planet-orbit-panel .orbit-header, #planet-orbit-panel .orbit-primary { flex-shrink:0; }
        }
        #rover-controls-help { width:min(520px,calc(100vw - 32px)); max-height:calc(100dvh - 48px);
            box-sizing:border-box; overflow-y:auto; padding:20px; border:1px solid #739b9477;
            border-radius:10px; background:#111e27; color:#dcece7; font:13px/1.6 ui-monospace,monospace; }
        #rover-controls-help::backdrop { background:#030a11b8; }
        #rover-controls-help h2 { margin:0; color:#f0cda1; font-size:18px; }
        #rover-controls-help h3 { margin:18px 0 6px; color:#f0cda1; font-size:14px; }
        #rover-controls-help p { margin:6px 0; }
        #rover-controls-help dl { display:grid; grid-template-columns:auto 1fr; gap:6px 16px; margin:8px 0; }
        #rover-controls-help dt { color:#f0cda1; font-weight:bold; }
        #rover-controls-help dd { margin:0; }
        #rover-controls-help header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        #planet-orbit-panel .orbit-races { margin-top:10px; border-top:1px solid #739b9444; }
        #planet-orbit-panel .orbit-races summary { cursor:pointer; padding:10px 0; color:#f0cda1; min-height:24px; }
        #planet-orbit-panel #beacon-race-panel { position:static; inset:auto; transform:none; width:100%;
            padding:0; border:0; background:transparent; font:inherit; }
        #planet-orbit-panel #beacon-race-panel .race-panel-header { display:flex; justify-content:space-between; }
        #planet-orbit-panel #beacon-race-panel [data-heading] { display:none; }
        #planet-orbit-panel #beacon-race-panel select { width:100%; min-height:40px; padding:6px; margin:6px 0;
            background:#263b43; color:#f0e7d3; border:1px solid #74948c77; border-radius:4px; }
        body[data-planet-view="true"] #rover-driving-panel,
        body[data-planet-view="true"] #rover-touch-controls, body[data-planet-view="true"] #beacon-race-banner { display:none!important; }
    `; document.head.appendChild(style);
    const toggle = document.createElement('button'); toggle.id = 'planet-view-toggle'; toggle.type = 'button';
    toggle.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    toggle.setAttribute('aria-label', 'Abrir menú orbital');
    toggle.setAttribute('aria-controls', 'planet-orbit-panel'); toggle.setAttribute('aria-expanded', 'false');
    document.body.appendChild(toggle);
    const panel = document.createElement('aside'); panel.id = 'planet-orbit-panel'; panel.hidden = true;
    panel.innerHTML = `<div class="orbit-header"><strong>MARTE</strong><div data-readout></div></div>
        <div class="orbit-buttons orbit-primary"><button type="button" data-in aria-label="Acercarse al planeta">+</button>
        <button type="button" data-out aria-label="Alejarse del planeta">−</button>
        <button type="button" data-land>Descender aquí</button>
        <button type="button" data-options-toggle aria-expanded="false" aria-controls="planet-orbit-options">Opciones</button></div>
        <div id="planet-orbit-options" class="orbit-options">
        <div class="orbit-legend"><span style="color:#ffd290">● Pendiente</span> · <span style="color:#9ce6c5">● Registrado</span> · ◉ Elegido</div>
        <div class="orbit-buttons"><button type="button" data-focus-objective>Centrar objetivo</button>
        <button type="button" data-home>Ir a Base Papaya</button>
        <button type="button" data-close>Volver al rover</button></div></div>`;
    const options = panel.querySelector('.orbit-options');
    const optionsToggle = panel.querySelector('[data-options-toggle]');
    function setExpanded(expanded) {
        panel.dataset.expanded = String(expanded);
        optionsToggle.setAttribute('aria-expanded', String(expanded));
        optionsToggle.textContent = expanded ? 'Ocultar' : 'Opciones';
    }
    optionsToggle.addEventListener('click', () => setExpanded(panel.dataset.expanded !== 'true'));
    if (explorationPanel) options.appendChild(explorationPanel);
    if (racePanel) {
        const races = document.createElement('details'); races.className = 'orbit-races';
        const summary = document.createElement('summary'); summary.textContent = 'Carreras';
        races.append(summary, racePanel); options.appendChild(races);
    }
    const helpButton = document.createElement('button');
    helpButton.type = 'button'; helpButton.textContent = 'Controles';
    helpButton.style.marginTop = '10px';
    helpButton.setAttribute('aria-haspopup', 'dialog');
    helpButton.setAttribute('aria-controls', 'rover-controls-help');
    const help = document.createElement('dialog'); help.id = 'rover-controls-help';
    help.setAttribute('aria-labelledby', 'rover-controls-title');
    help.innerHTML = `<header><h2 id="rover-controls-title">Cómo jugar</h2>
        <button type="button" data-dismiss-help aria-label="Cerrar controles" autofocus>✕</button></header>
        <h3>Teclado</h3><dl>
        <dt>W / S</dt><dd>Avanzar / retroceder.</dd>
        <dt>A / D o ← / →</dt><dd>Girar.</dd>
        <dt>Espacio</dt><dd>Despegar o subir. Al soltar, mantener la altura.</dd>
        <dt>C</dt><dd>Frenar en tierra. En vuelo, bajar y aproximarse al suelo.</dd>
        <dt>F</dt><dd>Saltar en tierra. En vuelo, frenar y estabilizar.</dd>
        <dt>W dos veces</dt><dd>Pulsar dos veces y mantener la segunda pulsación para activar el turbo en tierra o en vuelo. Soltar W para desactivarlo.</dd>
        <dt>↑ / ↓</dt><dd>En vuelo: bajar / levantar el morro. Al soltar, recuperar suavemente el vuelo horizontal.</dd>
        <dt>E</dt><dd>En tierra, mantener para escanear junto al objetivo.</dd>
        <dt>Z / X / G</dt><dd>Alternativas para subir, bajar y activar el turbo.</dd></dl>
        <h3>Móvil</h3><p>Joystick izquierdo: avanzar, retroceder y girar. En vuelo, el izquierdo controla el avance y el desplazamiento lateral; el derecho gira y orienta el morro. Al soltarlo, el rover recupera suavemente el vuelo horizontal.</p>
        <p>Mantén los botones para frenar, subir, bajar o escanear. Toca «Saltar» para dar un salto y «Turbo» para activar o desactivar la velocidad rápida en vuelo.</p>
        <h3>Explorar</h3><p>Abre ☰ y toca un punto del planeta para elegir un objetivo. Usa «Centrar objetivo» y «Descender aquí» para acercarte. Ya en tierra, sigue el minimapa y detente junto al objetivo para escanearlo.</p>
        <p>Arrastra el planeta para girarlo y usa + / − para acercarte o alejarte. «Ir a Base Papaya» te devuelve a la base.</p>
        <h3>Carreras</h3><p>Abre «Carreras» en el menú, elige una prueba y sigue las balizas en orden.</p>`;
    options.appendChild(helpButton); panel.appendChild(help);
    helpButton.addEventListener('click', () => help.showModal());
    help.querySelector('[data-dismiss-help]').addEventListener('click', () => help.close());
    // Escape dismisses the popup without also closing the orbital menu.
    help.addEventListener('keydown', event => event.stopPropagation());
    help.addEventListener('close', () => { if (!panel.hidden) helpButton.focus(); });
    document.body.appendChild(panel);
    const reticle = document.createElement('div'); reticle.id = 'planet-orbit-reticle';
    reticle.setAttribute('aria-hidden', 'true'); document.body.appendChild(reticle);
    const readout = panel.querySelector('[data-readout]');
    const blendScene = new THREE.Scene();
    const blendCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blendMaterial = new THREE.ShaderMaterial({
        depthTest: false, depthWrite: false,
        uniforms: { orbital: { value: null }, surface: { value: null }, amount: { value: 0 } },
        vertexShader: `varying vec2 blendUv; void main(){blendUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
        fragmentShader: `uniform sampler2D orbital; uniform sampler2D surface; uniform float amount;
            varying vec2 blendUv;
            void main(){
                gl_FragColor=mix(texture2D(orbital,blendUv),texture2D(surface,blendUv),amount);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`
    });
    blendScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blendMaterial));
    const bufferSize = new THREE.Vector2();
    let orbitalTarget = null, surfaceTarget = null, surfaceBlend = 0;
    function releaseTargets() {
        orbitalTarget?.dispose(); surfaceTarget?.dispose();
        orbitalTarget = surfaceTarget = null;
        blendMaterial.uniforms.orbital.value = blendMaterial.uniforms.surface.value = null;
    }
    function ensureTargets() {
        renderer.getDrawingBufferSize(bufferSize);
        if (!orbitalTarget) {
            orbitalTarget = new THREE.WebGLRenderTarget(bufferSize.x, bufferSize.y, { type: THREE.HalfFloatType,
                samples:Math.min(mobileGraphics?2:4,renderer.capabilities?.maxSamples??0) });
            surfaceTarget = orbitalTarget.clone();
            blendMaterial.uniforms.orbital.value = orbitalTarget.texture;
            blendMaterial.uniforms.surface.value = surfaceTarget.texture;
        } else if (orbitalTarget.width !== bufferSize.x || orbitalTarget.height !== bufferSize.y) {
            orbitalTarget.setSize(bufferSize.x, bufferSize.y); surfaceTarget.setSize(bufferSize.x, bufferSize.y);
        }
    }

    let active = false, altitude = radius * 1.8, targetAltitude = altitude;
    let landingError = '';
    function close() {
        if (!active) return;
        if (help.open) help.close();
        active = false; panel.hidden = true; objectives.hide();
        controls?.dispose(); controls = null;
        renderer.domElement.style.touchAction = 'none';
        releaseTargets(); surfaceBlend = 0;
        document.body.dataset.planetView = 'false'; toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir menú orbital');
        if (panel.contains(document.activeElement)) toggle.focus();
        onExit?.();
    }
    function open() {
        const position = getPosition(); if (!position || active) return;
        landingError = '';
        active = true; surfaceBlend = 0; altitude = targetAltitude = radius * 1.8;
        normal.copy(position).normalize();
        // Choose a nonparallel orbit axis at the poles, keeping the current
        // rover location exactly under the center of the opening view.
        if (Math.abs(normal.y) > 0.95) camera.up.set(0, 0, -1);
        else camera.up.set(0, 1, 0);
        camera.position.copy(normal).multiplyScalar(radius + altitude);
        controls = new TrackballControls(camera, renderer.domElement);
        controls.noPan = true; controls.noZoom = true;
        controls.staticMoving = true;
        controls.minDistance = radius - 100; controls.maxDistance = radius * 7;
        controls.target.set(0, 0, 0);
        controls.rotateSpeed = dragSensitivity(); controls.update();
        marker.position.copy(position).normalize().multiplyScalar(radius * 1.008);
        patchDirection.set(0, 0, 0);
        setExpanded(false);
        panel.hidden = false; objectives.show(); document.body.dataset.planetView = 'true';
        // Fit the sphere to the narrowest screen dimension, reserving room for
        // the compact toolbar instead of cropping the planet behind the menu.
        const compact = window.matchMedia('(max-width: 600px), (max-height: 500px)').matches;
        const toolbar = compact ? panel.getBoundingClientRect().height : 0;
        const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
        const visibleHeight = Math.max(100, window.innerHeight - 2 * (toolbar + 16));
        const fitTangent = Math.tan(halfFov) * Math.min(
            (window.innerWidth - 32) / window.innerHeight, visibleHeight / window.innerHeight);
        altitude = targetAltitude = Math.max(radius * 1.8, radius / Math.sin(Math.atan(fitTangent)) - radius);
        controls.maxDistance = Math.max(radius * 7, radius + altitude);
        camera.position.copy(normal).multiplyScalar(radius + altitude);
        controls.update();
        toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Cerrar menú orbital'); onEnter?.();
    }
    function zoom(factor) { landingError = ''; targetAltitude = THREE.MathUtils.clamp(targetAltitude * factor, 8, radius * 6); }
    toggle.addEventListener('click', () => active ? close() : open());
    panel.querySelector('[data-close]').addEventListener('click', close);
    panel.querySelector('[data-in]').addEventListener('click', () => zoom(0.5));
    panel.querySelector('[data-out]').addEventListener('click', () => zoom(2));
    panel.querySelector('[data-focus-objective]').addEventListener('click', () => {
        const target = catalog.info().target;
        if (!target) return;
        landingError = '';
        normal.copy(target.position).normalize();
        camera.position.copy(normal).multiplyScalar(radius + planet.elevation(normal) + altitude);
        camera.up.addScaledVector(normal, -camera.up.dot(normal));
        if (camera.up.lengthSq() < 0.001) camera.up.set(Math.abs(normal.y) > 0.95 ? 1 : 0, Math.abs(normal.y) > 0.95 ? 0 : 1, 0);
        camera.up.normalize(); camera.lookAt(controls.target); controls.update();
    });
    function descend(destination) {
        if (onDescend(destination) === false) {
            landingError = 'No hay espacio libre para aterrizar. Elige otro punto.';
            readout.textContent = landingError;
            return;
        }
        close();
    }
    panel.querySelector('[data-land]').addEventListener('click', () => descend(camera.position.clone().normalize()));
    panel.querySelector('[data-home]').addEventListener('click', () => descend(new THREE.Vector3(0, 1, 0)));
    renderer.domElement.addEventListener('wheel', event => {
        if (!active) return;
        event.preventDefault(); zoom(Math.exp(THREE.MathUtils.clamp(event.deltaY * 0.002, -0.7, 0.7)));
    }, { passive: false });
    return {
        get active() { return active; }, close, toggle() { active ? close() : open(); },
        resize(width, height) {
            camera.aspect = width / height; camera.updateProjectionMatrix(); controls?.handleResize();
        },
        render(delta) {
            altitude += (targetAltitude - altitude) * (1 - Math.exp(-4 * delta));
            controls.rotateSpeed = dragSensitivity();
            controls.update();
            normal.copy(camera.position).normalize();
            camera.position.copy(normal).multiplyScalar(radius + planet.elevation(normal) + altitude);
            camera.near = THREE.MathUtils.clamp(altitude * 0.01, 0.1, 10);
            camera.updateProjectionMatrix(); camera.lookAt(controls.target);
            atmosphere.material.uniforms.strength.value = THREE.MathUtils.smoothstep(altitude, 3000, 12000);
            updatePatch(normal, altitude);
            const lat = THREE.MathUtils.radToDeg(Math.asin(normal.y));
            const lon = THREE.MathUtils.radToDeg(Math.atan2(normal.x, normal.z));
            const requestedBlend = 1 - THREE.MathUtils.smoothstep(altitude, 100, 1800);
            surfaceBlend += (requestedBlend - surfaceBlend) * (1 - Math.exp(-6 * delta));
            // Prepare geometry before it is visible, then crossfade both views
            // with identical camera framing instead of switching at a threshold.
            if (altitude < 2600 && renderSurface) renderSurface(camera.position, normal, camera.up, altitude, true);
            let detailed = false;
            const markerSize=THREE.MathUtils.clamp(altitude*.003,5,radius*.004);
            marker.scale.setScalar(markerSize);home.scale.setScalar(markerSize);
            marker.material.transparent = home.material.transparent = true;
            marker.material.opacity = home.material.opacity = THREE.MathUtils.smoothstep(altitude, 1800, 6000);
            if (surfaceBlend > 0.998 && renderSurface) {
                releaseTargets();
                detailed = renderSurface(camera.position, normal, camera.up, altitude);
            } else if (surfaceBlend > 0.002 && renderSurface) {
                ensureTargets();
                const previousTarget = renderer.getRenderTarget();
                try {
                    renderer.setRenderTarget(orbitalTarget); renderer.render(scene, camera);
                    renderer.setRenderTarget(surfaceTarget);
                    detailed = renderSurface(camera.position, normal, camera.up, altitude);
                } finally { renderer.setRenderTarget(previousTarget); }
                if (detailed) {
                    blendMaterial.uniforms.amount.value = surfaceBlend;
                    renderer.render(blendScene, blendCamera);
                }
            }

            refreshExploration?.(); refreshRace?.();
            const heightLabel = altitude < 1000 ? `${Math.round(altitude)} m` : `${(altitude / 1000).toFixed(1)} km`;
            readout.textContent = landingError || `${heightLabel} de altura · ${lat.toFixed(2)}° · ${lon.toFixed(2)}°${detailed ? surfaceBlend > 0.998 ? ' · TERRENO REAL' : ` · DETALLE ${Math.round(surfaceBlend * 100)}%` : ''}`;
            if (!detailed) {
                if (surfaceBlend <= 0.002) releaseTargets();
                renderer.render(scene, camera);
            }
            objectives.render(camera);
        }
    };
}
