export function getDrivingPanel() {
    let panel = document.getElementById('rover-driving-panel');
    if (panel) return panel;
    const style = document.createElement('style');
    style.textContent = `
        #rover-driving-panel {
            position:fixed; right:max(18px,env(safe-area-inset-right));
            bottom:max(18px,env(safe-area-inset-bottom)); width:280px;
            display:grid; grid-template-columns:192px minmax(0,1fr); align-items:center; gap:8px;
            box-sizing:border-box; padding:8px; border:1px solid #7faaa76b; border-radius:4px;
            background:linear-gradient(145deg,#152429f5,#10191ff2);
            box-shadow:inset 0 2px #b6dad923,0 5px 18px #0004;
            color:#e0e9e7; font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
            pointer-events:none; z-index:104;
        }
        #rover-driving-panel .mission-console-header {
            grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:3px 6px; align-items:center; justify-content:space-between;
            font-size:8px; letter-spacing:1px; color:#88a9ad; border-bottom:1px solid #668b8b40;
            padding-bottom:6px; line-height:12px;
        }
        #rover-driving-panel .mission-console-status { display:flex; align-items:center; gap:5px; color:#a3d7ba; }
        #rover-driving-panel .mission-console-status::before { content:''; width:4px; height:4px;
            border-radius:50%; background:currentColor; }
        #rover-driving-panel[data-mode="moving"] .mission-console-status::before { animation:telemetry-pulse 1.6s ease-in-out infinite; }
        #rover-driving-panel[data-mode="airborne"] .mission-console-status,
        #rover-driving-panel[data-mode="braking"] .mission-console-status { color:#edb579; }
        #rover-driving-panel #mars-minimap, #rover-driving-panel #papaya-hud {
            position:relative; inset:auto; width:100%; min-width:0; padding:0; border:0;
            background:transparent; backdrop-filter:none; -webkit-backdrop-filter:none; box-sizing:border-box;
        }
        #rover-driving-panel #mars-minimap { grid-column:1; grid-row:2; border:1px solid #7faaa738; border-radius:2px; }
        #rover-driving-panel #papaya-hud { grid-column:2; grid-row:2; align-self:stretch;
            display:flex; flex-direction:column; justify-content:space-between; gap:7px;
            font-family:inherit; font-variant-numeric:tabular-nums; }
        #rover-driving-panel .telemetry-label { display:block; color:#85a2a6; font-size:7px; letter-spacing:1px; line-height:1.5; }
        #rover-driving-panel .telemetry-reading { display:block; min-width:0; overflow-wrap:anywhere; color:#e4eceb; font-size:11px; line-height:1.4; }
        #rover-driving-panel .telemetry-speed { display:flex; flex-wrap:wrap; align-items:baseline; gap:3px; min-width:0; }
        #rover-driving-panel #papaya-speed { color:#f0f4ee; font-size:18px; letter-spacing:-1px; line-height:1.2; min-width:0; overflow-wrap:anywhere; }
        #rover-driving-panel .telemetry-unit { font-size:7px; color:#9caaa8; white-space:nowrap; }
        #rover-driving-panel .telemetry-meter { height:3px; margin-top:5px; background:#44636755; overflow:hidden; }
        #rover-driving-panel .telemetry-meter span { display:block; height:100%; width:100%;
            background:#91c5ba; transform:scaleX(var(--speed-level,0)); transform-origin:left;
            transition:transform .15s linear; }
        #rover-driving-panel[data-steep="true"] #papaya-slope { color:#efbd77; }
        #rover-driving-panel .telemetry-key { display:block; font-size:7px; opacity:.55; margin-top:3px; }
        .touch-controls #rover-driving-panel {
            width:202px; grid-template-columns:100px minmax(0,1fr); gap:7px; padding:8px;
            right:max(10px,env(safe-area-inset-right)); bottom:max(10px,env(safe-area-inset-bottom));
        }
        .touch-controls #rover-driving-panel #papaya-hud { gap:4px; }
        .touch-controls #rover-driving-panel .telemetry-stat { display:flex; justify-content:space-between; align-items:baseline; gap:3px; }
        .touch-controls #rover-driving-panel .telemetry-reading { font-size:9px; }
        .touch-controls #rover-driving-panel .telemetry-key { display:none; }
        @keyframes telemetry-pulse { 50% { opacity:.3; } }
        @media(prefers-reduced-motion:reduce) {
            #rover-driving-panel[data-mode="moving"] .mission-console-status::before { animation:none; }
            #rover-driving-panel .telemetry-meter span { transition:none; }
        }
    `;
    document.head.appendChild(style);
    panel = document.createElement('section');
    panel.id = 'rover-driving-panel';
    panel.setAttribute('aria-label', 'Mapa e instrumentos del rover');
    panel.innerHTML = '<header class="mission-console-header"><span id="papaya-heading">RUMBO 0° N</span><span class="mission-console-status" id="papaya-drive-mode">EN ESPERA</span></header>';
    document.body.appendChild(panel);
    return panel;
}
