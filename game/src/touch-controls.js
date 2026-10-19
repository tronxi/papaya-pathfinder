import './touch-controls.css';

const ICONS = {
    brake: '<path d="M8 5v14M16 5v14"/>',
    hop: '<path d="m6 13 6-7 6 7M12 6v14M6 20h12"/>',
    up: '<path d="m6 12 6-7 6 7M12 5v14"/>',
    down: '<path d="m6 12 6 7 6-7M12 5v14"/>',
    boost: '<path d="m5 16 7-6 7 6M5 10l7-6 7 6"/>',
    scan: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    destination: '<path d="M5 21V4m0 0c5-5 9 5 14 0v10c-5 5-9-5-14 0"/>',
    menu: '<path d="M5 6h14M5 12h14M5 18h14"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
const action = (name, label, key, extra = '') => `<button type="button" class="touch-action touch-${name}" data-key="${key}" aria-label="${label}" aria-pressed="false" ${extra}>${icon(name)}<span>${label}</span></button>`;

// Each pointer owns one control. Releasing one thumb never releases another.
export function createTouchControls() {
    const keys = new Set(), pointers = new Map();
    const axes = { throttle: 0, steering: 0, pitch: 0, strafe: 0 };
    const media = window.matchMedia('(pointer: coarse)');
    let boost = false, flight = false, nextUntil = 0, airTime = 0;
    const root = document.createElement('div');
    root.id = 'rover-touch-controls'; root.dataset.flight = 'false';
    root.setAttribute('aria-label', 'Controles táctiles del rover');
    const pad = (name, label) => `<div class="touch-stick touch-stick-${name}" data-stick="${name}" role="group" aria-label="${label}">
        <span class="touch-stick-rings" aria-hidden="true"></span><span class="touch-stick-cross" aria-hidden="true"></span>
        <span class="touch-stick-knob" aria-hidden="true"></span><span class="touch-stick-label">${label}</span></div>`;
    root.innerHTML = `<div class="touch-mode" aria-live="polite"><i></i><span>CONDUCCIÓN</span></div>
        ${pad('drive', 'AVANZAR · GIRAR')}${pad('aim', 'MORRO · LATERAL')}
        <div class="touch-actions">
            ${action('brake', 'Freno', 'Space')}${action('hop', 'Impulso', 'KeyF')}
            ${action('up', 'Despegar', 'KeyZ')}${action('down', 'Bajar', 'KeyX')}
            ${action('boost', 'Rápido', 'KeyG', 'data-toggle-boost')}
            ${action('scan', 'Escanear', 'KeyE')}
        </div>
        <button type="button" class="touch-utility-toggle" aria-label="Herramientas de exploración" aria-expanded="false">${icon('menu')}</button>
        <div class="touch-utilities" hidden>${action('destination', 'Destino', 'KeyN')}
            <p>Arrastra fuera de los mandos para mover la cámara.</p></div>`;
    document.body.appendChild(root);
    const buttons = [...root.querySelectorAll('[data-key]')];
    const pads = Object.fromEntries([...root.querySelectorAll('[data-stick]')].map(element => [element.dataset.stick, element]));
    const utility = root.querySelector('.touch-utilities');
    const utilityToggle = root.querySelector('.touch-utility-toggle');
    function refresh() {
        keys.clear();
        for (const record of pointers.values()) if (record.code) keys.add(record.code);
        if (axes.throttle > 0) keys.add('KeyW'); if (axes.throttle < 0) keys.add('KeyS');
        if (axes.steering > 0) keys.add('KeyA'); if (axes.steering < 0) keys.add('KeyD');
        if (axes.pitch > 0) keys.add('ArrowDown'); if (axes.pitch < 0) keys.add('ArrowUp');
        if (axes.strafe > 0) keys.add('ArrowLeft'); if (axes.strafe < 0) keys.add('ArrowRight');
        if (boost && flight) keys.add('KeyG');
        for (const button of buttons) button.setAttribute('aria-pressed', String(keys.has(button.dataset.key)));
    }
    function moveStick(event, record) {
        const bounds = record.element.getBoundingClientRect();
        const radius = bounds.width * .34;
        let x = (event.clientX - bounds.left - bounds.width / 2) / radius;
        let y = (event.clientY - bounds.top - bounds.height / 2) / radius;
        const length = Math.hypot(x, y);
        if (length > 1) { x /= length; y /= length; }
        const response = value => Math.abs(value) < .14 ? 0 : Math.sign(value) * (Math.abs(value) - .14) / .86;
        if (record.stick === 'drive') { axes.throttle = -response(y); axes.steering = -response(x); }
        else { axes.pitch = response(y); axes.strafe = -response(x); }
        record.element.style.setProperty('--stick-x', `${x * radius}px`);
        record.element.style.setProperty('--stick-y', `${y * radius}px`);
        refresh();
    }
    function release(event) {
        const record = pointers.get(event.pointerId); if (!record) return;
        pointers.delete(event.pointerId);
        if (record.stick) {
            if (record.stick === 'drive') axes.throttle = axes.steering = 0;
            else axes.pitch = axes.strafe = 0;
            record.element.style.setProperty('--stick-x', '0px'); record.element.style.setProperty('--stick-y', '0px');
            record.element.classList.remove('is-active');
        }
        refresh();
    }
    for (const [name, element] of Object.entries(pads)) {
        element.addEventListener('pointerdown', event => {
            if (event.button !== 0 || (name === 'aim' && !flight) || [...pointers.values()].some(record => record.stick === name)) return;
            event.preventDefault(); event.stopPropagation();
            const record = { element, stick: name }; pointers.set(event.pointerId, record);
            element.setPointerCapture(event.pointerId); element.classList.add('is-active'); moveStick(event, record);
        });
        element.addEventListener('pointermove', event => {
            const record = pointers.get(event.pointerId); if (record?.element !== element) return;
            event.preventDefault(); moveStick(event, record);
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, release);
    }
    function toggleBoost() { if (flight) { boost = !boost; refresh(); } }
    for (const button of buttons) {
        button.addEventListener('pointerdown', event => {
            if (event.button !== 0 || button.disabled) return;
            event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId);
            if (button.hasAttribute('data-toggle-boost')) { toggleBoost(); return; }
            pointers.set(event.pointerId, { element: button, code: button.dataset.key });
            if (button.dataset.key === 'KeyN') nextUntil = performance.now() + 180;
            refresh();
        });
        button.addEventListener('click', event => { if (event.detail === 0 && button.hasAttribute('data-toggle-boost')) toggleBoost(); });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    }
    root.addEventListener('contextmenu', event => event.preventDefault());
    utilityToggle.addEventListener('click', () => { utility.hidden = !utility.hidden; utilityToggle.setAttribute('aria-expanded', String(!utility.hidden)); });
    function clear() {
        pointers.clear(); boost = false; nextUntil = 0; airTime = 0;
        utility.hidden = true; utilityToggle.setAttribute('aria-expanded', 'false');
        for (const key of Object.keys(axes)) axes[key] = 0;
        for (const element of Object.values(pads)) {
            element.style.setProperty('--stick-x', '0px'); element.style.setProperty('--stick-y', '0px'); element.classList.remove('is-active');
        }
        refresh();
    }
    function syncDisplay() { document.documentElement.classList.toggle('touch-controls', media.matches); root.hidden = !media.matches; clear(); }
    media.addEventListener('change', syncDisplay);
    window.addEventListener('blur', clear); window.addEventListener('orientationchange', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    syncDisplay();
    return {
        has: code => media.matches && (keys.has(code) || (code === 'KeyN' && performance.now() < nextUntil)),
        axis: name => media.matches ? axes[name] ?? 0 : 0,
        update({ airborne, powered = false, delta = 1/60 }) {
            airTime = airborne ? airTime + delta : 0;
            const nextFlight = powered || airTime > .18;
            if (flight === nextFlight) return;
            flight = nextFlight; root.dataset.flight = String(flight);
            root.querySelector('.touch-mode span').textContent = flight ? 'VUELO · PROPULSORES' : 'CONDUCCIÓN';
            root.querySelector('.touch-up span').textContent = flight ? 'Subir' : 'Despegar';
            root.querySelector('.touch-up').setAttribute('aria-label', flight ? 'Subir' : 'Despegar');
            if (!flight) {
                boost = false; axes.pitch = axes.strafe = 0;
                for (const [id, record] of pointers) if (record.stick === 'aim' || record.code === 'KeyX') release({ pointerId: id });
            }
            refresh();
        },
        reset: clear,
        get enabled() { return media.matches; }
    };
}
