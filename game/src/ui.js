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
            grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between;
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
        #rover-driving-panel .telemetry-reading { display:block; color:#e4eceb; font-size:11px; line-height:1.4; }
        #rover-driving-panel .telemetry-speed { display:flex; align-items:baseline; gap:3px; }
        #rover-driving-panel #papaya-speed { color:#f0f4ee; font-size:18px; letter-spacing:-1px; line-height:1.2; }
        #rover-driving-panel .telemetry-unit { font-size:7px; color:#9caaa8; }
        #rover-driving-panel .telemetry-meter { height:3px; margin-top:5px; background:#44636755; overflow:hidden; }
        #rover-driving-panel .telemetry-meter span { display:block; height:100%; width:100%;
            background:#91c5ba; transform:scaleX(var(--speed-level,0)); transform-origin:left;
            transition:transform .15s linear; }
        #rover-driving-panel[data-steep="true"] #papaya-slope { color:#efbd77; }
        #rover-driving-panel #papaya-hop { pointer-events:auto; width:100%; min-height:30px;
            margin:0; padding:5px 2px; border:1px solid #779c995e; border-radius:2px;
            background:#29434355; color:#c1d7d0; font:600 8px ui-monospace,monospace;
            letter-spacing:.5px; cursor:pointer; touch-action:manipulation; }
        #rover-driving-panel #papaya-hop:disabled { opacity:.45; cursor:default; }
        #rover-driving-panel #papaya-hop:focus-visible { outline:2px solid #e9b16b; outline-offset:2px; }
        #rover-driving-panel .telemetry-key { display:block; font-size:7px; opacity:.55; margin-top:3px; }
        .touch-controls #rover-driving-panel {
            width:202px; grid-template-columns:100px minmax(0,1fr); gap:7px; padding:8px;
            right:max(10px,env(safe-area-inset-right)); bottom:max(10px,env(safe-area-inset-bottom));
        }
        .touch-controls #rover-driving-panel #papaya-hud { gap:4px; }
        .touch-controls #rover-driving-panel .telemetry-stat { display:flex; justify-content:space-between; align-items:baseline; gap:3px; }
        .touch-controls #rover-driving-panel .telemetry-reading { font-size:9px; }
        .touch-controls #rover-driving-panel #papaya-hop { min-height:40px; }
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
    panel.innerHTML = '<header class="mission-console-header"><span>PAPAYA / NAV</span><span class="mission-console-status" id="papaya-drive-mode">EN ESPERA</span></header>';
    document.body.appendChild(panel);
    return panel;
}

export function getGameSidebar() {
    let sidebar = document.getElementById('rover-sidebar');
    if (sidebar) return sidebar;

    const style = document.createElement('style');
    style.textContent = `
        #rover-sidebar {
            position:fixed; top:18px; right:18px; width:min(498px,calc(100vw - 36px)); z-index:102;
            display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px;
            align-items:start;
            max-height:calc(100dvh - 254px); overflow-y:auto;
            overscroll-behavior:contain; scrollbar-width:thin;
        }
        #rover-sidebar #mars-survey, #rover-sidebar #beacon-race-panel {
            position:relative; inset:auto; transform:none; width:100%;
            max-height:none; overflow:visible; min-width:0; box-sizing:border-box;
        }
        #rover-sidebar #beacon-race-panel { grid-column:1; grid-row:1; }
        #rover-sidebar:has(#beacon-race-panel[data-collapsed="true"]) {grid-template-columns:max-content minmax(0,1fr)}
        #rover-sidebar:has(#mars-survey[data-collapsed="true"]) {grid-template-columns:minmax(0,1fr) max-content}
        #rover-sidebar:has(#beacon-race-panel[data-collapsed="true"]):has(#mars-survey[data-collapsed="true"]) {
            grid-template-columns:max-content max-content;width:max-content;max-width:calc(100vw - 24px);gap:6px;
        }
        #rover-sidebar #beacon-race-panel[data-collapsed="true"],
        #rover-sidebar #mars-survey[data-collapsed="true"] {
            width:max-content;min-height:32px;padding:0 24px 0 11px;display:flex;align-items:center;
            border:1px solid #829d9838;border-radius:7px;background:#16272b91;
            backdrop-filter:blur(5px);box-shadow:none;color:#b4c9c1;
        }
        #rover-sidebar #beacon-race-panel[data-collapsed="true"] .race-panel-header {display:flex;gap:7px;align-items:center}
        #rover-sidebar #beacon-race-panel[data-collapsed="true"] strong,
        #rover-sidebar #mars-survey[data-collapsed="true"] small {
            margin:0;font:600 9px/1.2 ui-monospace,monospace;letter-spacing:.7px;color:inherit;white-space:nowrap;
        }
        #rover-sidebar #mars-survey[data-collapsed="true"] .survey-summary {display:none}
        #rover-sidebar #beacon-race-panel[data-collapsed="true"] [data-time] {font:10px ui-monospace,monospace;color:#e2c29b}
        #rover-sidebar #beacon-race-panel[data-collapsed="true"] [data-toggle-panel],
        #rover-sidebar #mars-survey[data-collapsed="true"] [data-toggle] {
            position:absolute;inset:0;width:100%;height:100%;min-width:0;min-height:0;padding:0;
            border:0;border-radius:inherit;background:transparent;font-size:0;box-shadow:none;
        }
        #rover-sidebar #beacon-race-panel[data-collapsed="true"] [data-toggle-panel]::after,
        #rover-sidebar #mars-survey[data-collapsed="true"] [data-toggle]::after {
            content:'⌄';position:absolute;right:8px;top:50%;transform:translateY(-60%);font:13px system-ui;color:#a7bfb58c;
        }
        #rover-sidebar #beacon-race-panel[data-collapsed="true"]:hover,
        #rover-sidebar #mars-survey[data-collapsed="true"]:hover {background:#233b3fdd;border-color:#a0c5b981}
        html.touch-controls #rover-sidebar #beacon-race-panel[data-collapsed="true"],
        html.touch-controls #rover-sidebar #mars-survey[data-collapsed="true"] {min-height:44px}

        #rover-sidebar #mars-survey { grid-column:2; grid-row:1; }
        @media(max-width:600px) {
            #rover-sidebar { top:10px; right:10px; width:min(378px,calc(100vw - 20px)); max-height:calc(100dvh - 254px); }
        }
        .touch-controls #rover-sidebar {
            top:max(10px,env(safe-area-inset-top)); right:max(10px,env(safe-area-inset-right));
            width:min(376px,calc(100vw - 20px - env(safe-area-inset-left) - env(safe-area-inset-right))); gap:8px;
            max-height:calc(100dvh - 185px - env(safe-area-inset-top));
        }
        @media(max-width:600px) {
            .touch-controls #rover-sidebar { width:min(376px,calc(100vw - 20px)); top:10px;
                max-height:calc(100dvh - 335px); }
        }
        @media(max-width:600px) and (orientation:portrait) {
            .touch-controls #rover-sidebar { max-height:max(60px,calc(100dvh - 360px)); }
        }
    `;
    document.head.appendChild(style);
    sidebar = document.createElement('div');
    sidebar.id = 'rover-sidebar';
    document.body.appendChild(sidebar);
    return sidebar;
}
