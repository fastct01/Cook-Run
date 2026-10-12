// ─────────────────────────────────────────────────────────────────────────────
// DEFEND client · the roof HUD (docs/r3/ui/Roof.png + HUD-Kit.png "Roof guns"; values from
// docs/r3/ui/src/Roof.html). Dark glass from public/css/tokens.css (with fallbacks if it isn't loaded).
//   const hud = new RoofHud(root);            // root: the HUD layer element (absolute, covers the game)
//   hud.show(bool)
//   hud.update(vm)                            // view model (DefendClient builds it each frame)
//   hud.toast({ icon, text, sub, value, tone })   one-line toast, top right (fades, never bounces)
//   hud.hitMarker(kind)                       'hit' | 'disabled'
//   hud.layoutTags(list)                      cop tags [{ id, x, y, ax, ay, unit, chips: [[icon, text, tone]] }]
//   hud.destroy()
// Panels: top-centre stop/Doc chip · top-right bust ring + toasts · centre crosshair (per gun) + target
// label · cop tags with leader lines · bottom-left controls · bottom-centre gun slots 1–6 + ammo with
// the reload ring · the rifle scope overlay · a hint line. Top-left (Wanted) and bottom-right (health)
// stay the main HUD's (hud.setMode('roof')). One DOM write per value change, no layout reads.
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
.dfd { position:absolute; inset:0; pointer-events:none; font-family:var(--g-font,'Archivo',system-ui,sans-serif); color:var(--g-text-1,#F1ECE4); z-index:30; user-select:none; -webkit-user-select:none; }
.dfd[hidden] { display:none !important; }
.dfd * { box-sizing:border-box; }
.dfd-glass { background:var(--g-glass,rgba(14,15,17,.72)); border:1px solid var(--g-line,rgba(255,255,255,.10)); border-radius:var(--g-radius,10px); box-shadow:var(--g-shadow,0 6px 18px rgba(0,0,0,.26)); -webkit-backdrop-filter:blur(var(--g-blur,10px)); backdrop-filter:blur(var(--g-blur,10px)); }
.dfd-hi { background:var(--g-glass-hi,rgba(14,15,17,.84)); }
.dfd-lab { font-stretch:75%; font-weight:700; font-size:9.5px; line-height:1; letter-spacing:.08em; text-transform:uppercase; color:var(--g-text-2,#BDB8B0); }
.dfd-num { font-stretch:88%; font-weight:750; font-variant-numeric:tabular-nums; }
.dfd-key { display:inline-flex; align-items:center; justify-content:center; flex:none; min-width:18px; height:18px; padding:0 4px; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.26); border-bottom-width:2px; border-radius:4px; font-stretch:85%; font-weight:700; font-size:9px; line-height:1; color:var(--g-text-1,#F1ECE4); }
/* top-centre stop chip */
.dfd-stop { position:absolute; left:50%; top:16px; transform:translateX(-50%); width:420px; height:56px; padding:0 14px; display:flex; align-items:center; gap:12px; transition:opacity var(--g-fast,140ms); }
.dfd-stop .main { flex:1; min-width:0; }
.dfd-stop .line { font-weight:650; font-size:13.5px; line-height:1; margin-top:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dfd-stop .sep { flex:none; width:1px; height:34px; background:var(--g-line-2,rgba(255,255,255,.18)); margin:0 2px; }
.dfd-stop .right { text-align:right; min-width:64px; }
.dfd-stop .big { font-size:21px; line-height:1; margin-top:4px; }
.dfd-stop .bar { height:3px; border-radius:2px; background:rgba(255,255,255,.12); margin-top:7px; overflow:hidden; }
.dfd-stop .bar i { display:block; height:100%; width:0; background:var(--g-teal,#5FB3A8); transition:width 200ms linear; }
/* top-right bust */
.dfd-bust { position:absolute; right:16px; top:16px; width:232px; height:56px; padding:0 12px; display:flex; align-items:center; gap:12px; }
.dfd-bust .ring { position:relative; width:40px; height:40px; flex:none; }
.dfd-bust .ring svg { position:absolute; inset:0; }
.dfd-bust .ring .ico { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
.dfd-bust .txt { flex:1; min-width:0; }
.dfd-bust .row { display:flex; justify-content:space-between; align-items:center; }
.dfd-bust .sub { font-weight:500; font-size:12px; line-height:1; color:var(--g-text-2,#BDB8B0); margin-top:7px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dfd-bust.hot { border-color:rgba(229,72,58,.55); }
/* toasts */
.dfd-toasts { position:absolute; right:16px; top:88px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.dfd-toast { display:inline-flex; align-items:center; gap:8px; height:30px; padding:0 11px; border-radius:8px; white-space:nowrap; opacity:0; transform:translateY(-6px); transition:opacity 160ms var(--g-ease,ease), transform 160ms var(--g-ease,ease); }
.dfd-toast.on { opacity:1; transform:none; }
.dfd-toast b { font-weight:650; font-size:12.5px; line-height:1; color:var(--g-text-1,#F1ECE4); }
.dfd-toast span { font-weight:500; font-size:11.5px; line-height:1; color:var(--g-text-2,#BDB8B0); }
.dfd-toast em { font-style:normal; font-stretch:88%; font-weight:750; font-size:13px; line-height:1; font-variant-numeric:tabular-nums; color:var(--g-amber,#F2B90F); }
.dfd-toast em.rust { color:#F4A270; } .dfd-toast em.red { color:var(--g-red,#E5483A); } .dfd-toast em.green { color:var(--g-green,#5BBF6A); }
/* crosshair + target label */
.dfd-xh { position:absolute; left:50%; top:50%; width:64px; height:64px; margin:-32px 0 0 -32px; filter:drop-shadow(0 0 1.5px rgba(0,0,0,.85)); transition:opacity 120ms; }
.dfd-xh .hit { opacity:0; transition:opacity 90ms; }
.dfd-xh.hit .hit { opacity:1; }
.dfd-xh.dis .hit path { stroke:var(--g-amber,#F2B90F); }
.dfd-tgt { position:absolute; left:50%; top:calc(50% + 40px); transform:translateX(-50%); display:inline-flex; align-items:center; gap:8px; height:20px; padding:0 7px; border-radius:8px; white-space:nowrap; opacity:0; transition:opacity 120ms; }
.dfd-tgt.on { opacity:1; }
.dfd-tgt .d { font-stretch:88%; font-weight:700; font-size:11px; line-height:1; font-variant-numeric:tabular-nums; }
.dfd-tgt .p { font-stretch:75%; font-weight:750; font-size:9px; line-height:1; letter-spacing:.08em; text-transform:uppercase; color:var(--g-text-2,#BDB8B0); }
.dfd-tgt .p.good { color:var(--g-amber,#F2B90F); } .dfd-tgt .p.far { color:var(--g-text-3,#8E8A84); }
/* cop tags */
.dfd-tags { position:absolute; inset:0; }
.dfd-tag { position:absolute; left:0; top:0; display:inline-flex; align-items:center; gap:9px; height:26px; padding:0 9px; border-radius:8px; white-space:nowrap; will-change:transform; }
.dfd-tag .u { font-stretch:75%; font-weight:750; font-size:9px; line-height:1; letter-spacing:.08em; text-transform:uppercase; color:#8DB6FF; }
.dfd-tag .c { display:inline-flex; align-items:center; gap:5px; font-weight:650; font-size:12px; line-height:1; }
.dfd-lead { position:absolute; left:0; top:0; overflow:visible; }
/* bottom-left controls */
.dfd-ctl { position:absolute; left:16px; bottom:16px; width:264px; height:64px; padding:0 12px; display:flex; flex-direction:column; justify-content:center; gap:6px; }
.dfd-ctl .r { display:flex; align-items:center; gap:12px; height:20px; }
.dfd-ctl .k { display:inline-flex; align-items:center; gap:5px; font-weight:500; font-size:11.5px; line-height:1; color:var(--g-text-2,#BDB8B0); }
/* bottom-centre weapons */
.dfd-wpn { position:absolute; left:50%; bottom:16px; transform:translateX(-50%); height:64px; padding:5px 8px 5px 6px; display:flex; align-items:center; gap:4px; pointer-events:auto; }
.dfd-slot { position:relative; flex:none; width:92px; height:52px; padding:0; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10); border-radius:7px; cursor:pointer; color:inherit; font:inherit; transition:background 120ms, border-color 120ms; }
.dfd-slot.t { width:54px; background:rgba(255,255,255,.06); }
.dfd-slot.sel { background:rgba(242,185,15,.12); border-color:var(--g-amber,#F2B90F); }
.dfd-slot.empty { opacity:.5; }
.dfd-slot .kk { position:absolute; left:4px; top:4px; display:inline-flex; align-items:center; justify-content:center; min-width:14px; height:14px; border:1px solid rgba(241,236,228,.34); border-radius:3px; font-stretch:85%; font-weight:700; font-size:8.5px; line-height:1; }
.dfd-slot .n { position:absolute; right:5px; top:5px; font-stretch:88%; font-weight:700; font-size:10px; line-height:1; font-variant-numeric:tabular-nums; color:var(--g-text-2,#BDB8B0); }
.dfd-slot.sel .n, .dfd-slot.sel .nm { color:var(--g-amber,#F2B90F); }
.dfd-slot .n.red { color:var(--g-red,#E5483A); }
.dfd-slot .ic { position:absolute; left:50%; top:17px; transform:translateX(-50%); }
.dfd-slot.t .ic { top:15px; }
.dfd-slot .nm { position:absolute; left:0; right:0; bottom:5px; text-align:center; font-stretch:75%; font-weight:750; font-size:8.5px; line-height:1; letter-spacing:.08em; text-transform:uppercase; color:var(--g-text-2,#BDB8B0); }
.dfd-slot.t .nm { bottom:6px; }
.dfd-vs { flex:none; width:1px; height:36px; background:var(--g-line-2,rgba(255,255,255,.18)); margin:0 6px; }
.dfd-ammo { display:flex; align-items:center; gap:9px; width:112px; padding-left:4px; }
.dfd-ammo .ring { position:relative; width:26px; height:26px; flex:none; }
.dfd-ammo .ring svg { position:absolute; inset:0; }
.dfd-ammo .ring b { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:9px; }
.dfd-ammo .v { display:flex; align-items:baseline; gap:3px; margin-top:4px; }
.dfd-ammo .m { font-size:22px; line-height:1; }
.dfd-ammo .rs { font-stretch:88%; font-weight:600; font-size:13px; line-height:1; color:var(--g-text-2,#BDB8B0); font-variant-numeric:tabular-nums; }
.dfd-ammo.reload .lab { color:var(--g-amber,#F2B90F); }
.dfd-ammo.dry .m, .dfd-ammo.dry .lab { color:var(--g-red,#E5483A); }
/* hint line */
.dfd-hint { position:absolute; left:50%; bottom:90px; transform:translateX(-50%); height:24px; padding:0 10px; display:inline-flex; align-items:center; gap:7px; border-radius:8px; white-space:nowrap; font-weight:500; font-size:11.5px; color:var(--g-text-2,#BDB8B0); background:var(--g-glass-lo,rgba(14,15,17,.56)); border:1px solid var(--g-line,rgba(255,255,255,.10)); transition:opacity 160ms; }
.dfd-hint b { color:var(--g-text-1,#F1ECE4); font-weight:650; }
.dfd-hint:empty { opacity:0; }
/* rifle scope */
.dfd-scope { position:absolute; inset:0; opacity:0; transition:opacity 90ms; }
.dfd-scope.on { opacity:1; }
.dfd-scope .mask { position:absolute; inset:0; background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0, rgba(0,0,0,0) var(--r,300px), rgba(6,7,8,.94) calc(var(--r,300px) + 1.5px), #060708 calc(var(--r,300px) + 30px)); }
.dfd-scope .lens { position:absolute; left:50%; top:50%; width:calc(var(--r,300px) * 2); height:calc(var(--r,300px) * 2); transform:translate(-50%,-50%); border-radius:50%; box-shadow:inset 0 0 70px 18px rgba(0,0,0,.6), inset 0 0 0 2px rgba(0,0,0,.85); }
.dfd-scope svg { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); overflow:visible; }
.dfd-scope .rd { position:absolute; left:50%; bottom:calc(50% - var(--r,300px) + 26px); transform:translateX(-50%); font-stretch:88%; font-weight:700; font-size:12px; font-variant-numeric:tabular-nums; color:rgba(241,236,228,.85); text-shadow:0 1px 2px #000; letter-spacing:.04em; }
/* climb / hold banner */
.dfd-banner { position:absolute; left:50%; top:calc(50% - 90px); transform:translateX(-50%); padding:0 14px; height:34px; display:inline-flex; align-items:center; gap:9px; border-radius:8px; font-weight:650; font-size:13px; opacity:0; transition:opacity 160ms; }
.dfd-banner.on { opacity:1; }
@media (prefers-reduced-motion: reduce) { .dfd-toast { transition:opacity 1ms; transform:none; } }
@media (max-width: 900px) { .dfd-ctl { display:none; } .dfd-stop { width:340px; } }
`;

// ── icons (Roof.html / HUD-Kit: generic, unbranded silhouettes) ─────────────────
const ICO = {
  revolver: '<svg aria-hidden="true" width="44" height="18.5" viewBox="0 0 62 26" fill="currentColor"><path d="M20.5 5.2h40v4.4h-40z"/><path d="M56.4 3.4h2.6v2.2h-2.6z"/><rect x="35" y="9.2" width="18.5" height="2.6" rx="1.1"/><rect x="22.5" y="4.4" width="13.5" height="10.6" rx="2.2"/><path d="M16.8 5.4L20.5 4.6 23 4.6 23 15.4 19 15.4z"/><path d="M17.2 6L13.4 2.2 15 1.4 19.6 5z"/><path d="M16.2 5.6C14.6 9 12.6 13.4 10.6 17.6 9.4 20.1 8.8 22.4 9.3 24.6L17.6 24.8C17.1 22.4 17.5 20.2 18.6 18L21 14.6 19.6 7.2z"/><path d="M20.8 15.2c.4 3.4 2.2 5 5 5 2.6 0 4.2-1.6 4.4-4.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M24.6 6.6h10M24.6 9.7h10M24.6 12.8h10" stroke="rgba(0,0,0,0.38)" stroke-width="0.9"/></svg>',
  shotgun: '<svg aria-hidden="true" width="74" height="13.6" viewBox="0 0 120 22" fill="currentColor"><rect x="0.6" y="7" width="2.8" height="13.2" rx="1.1"/><path d="M3 7.2L34 9.3 37 9.3 37 15.6 31 15.8 3 20z"/><path d="M36 7.4h21.5a1.5 1.5 0 0 1 1.5 1.5v6.6H36z"/><path d="M40.5 15.4c.5 3.4 2.4 4.9 5.2 4.9s4.6-1.5 5-4.9" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="58.5" y="7.8" width="60" height="3.2" rx="0.8"/><rect x="116.4" y="6.6" width="1.8" height="1.4" rx="0.4"/><rect x="58.5" y="11.6" width="47" height="2.8" rx="1.2"/><rect x="67" y="10.4" width="25" height="5.8" rx="2.4"/><path d="M70.5 11.2v4.2M74 11.2v4.2M77.5 11.2v4.2M81 11.2v4.2M84.5 11.2v4.2M88 11.2v4.2" stroke="rgba(0,0,0,0.38)" stroke-width="0.9"/></svg>',
  rifle: '<svg aria-hidden="true" width="74" height="13.6" viewBox="0 0 120 22" fill="currentColor"><rect x="0.6" y="9.2" width="2.8" height="11.4" rx="1.1"/><path d="M3 9.6L29 11.1C33 11.9 36.5 12.4 40.5 12.4H82.5C84 12.4 84.6 13.2 84.6 14 84.6 14.9 84 15.4 82.5 15.4H44.6C42.4 15.6 41.2 16.6 40.6 18.2L39.3 21H34.4L35.4 17.6C33.8 16.7 32.2 16.7 30.2 17.2 21 19.2 12 20 3 20.4z"/><rect x="40" y="9.8" width="26.5" height="3.2" rx="1.2"/><rect x="66" y="10.4" width="53" height="2" rx="0.6"/><rect x="45" y="4.3" width="31" height="2.9" rx="1.4"/><path d="M40.4 3H47V8.6H40.4C39.5 6.8 39.5 4.8 40.4 3z"/><path d="M74.5 3.6L83 2.4V9.2L74.5 8z"/><rect x="57.5" y="2.3" width="3.4" height="2.4" rx="0.6"/><rect x="49.4" y="6.6" width="2.6" height="3.6"/><rect x="68.4" y="6.6" width="2.6" height="3.6"/><path d="M57 12.6L52.6 16.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="52" cy="17.3" r="1.7"/></svg>',
  firecracker: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="10.5" width="12" height="6" rx="1.5" transform="rotate(-32 9.5 13.5)"/><path d="M14.6 7.3c.8-1.8 2.2-2.6 3.6-2.2"/><path d="M20 2.5v1.6M21.8 5.2h-1.6M20 6.3l1.1 1.1M18.4 3.8l-1.1-1.1"/></svg>',
  balloon: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5c3.3 0 5.5-3 5.5-6.3A5.5 5.5 0 0 0 6.5 9.2c0 3.3 2.2 6.3 5.5 6.3z"/><path d="M12 15.5l-1 2h2zM12 17.5c0 1.6-1.6 2.2-1.6 3.8"/><path d="M17.6 15.5v1.5M19.4 17.8v1"/></svg>',
  flare: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21l5.2-9 1.8 1-5.2 9z"/><path d="M13.2 12.2c-.9-1.9.1-3.9 2.5-5 .2 1.4 1 2.2 2.2 2.5-.6 2.2-2.6 3.5-4.7 2.5z"/><path d="M16.5 5.2c.7-1.6 2-2.4 3.6-2.2"/></svg>',
  cuffs: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F1ECE4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="15" r="4.2"/><circle cx="17" cy="15" r="4.2"/><path d="M7 10.8V8.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2.3"/></svg>',
  tyre: (c = '#F1ECE4') => `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.3 19.5a8 8 0 1 1 11.4 0z"/><circle cx="12" cy="12.6" r="2.8"/><path d="M18.5 3.5l1.5-1.5M20.5 7.5h2M16 2l.4-1.6"/></svg>`,
  steam: (c = '#F1ECE4') => `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20c-1.8-2.2 1.8-3.8 0-6s1.8-3.8 0-6M12 20c-1.8-2.2 1.8-3.8 0-6s1.8-3.8 0-6s1.8-2.6 0-4.5M17 20c-1.8-2.2 1.8-3.8 0-6s1.8-3.8 0-6"/></svg>`,
  power: (c = '#F2B90F') => `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v8.5"/><path d="M7 6.5a7.5 7.5 0 1 0 10 0"/></svg>`,
  back: (c = '#BDB8B0') => `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H6M11 6l-6 6 6 6"/><path d="M20 7v10"/></svg>`,
  gun: (c = '#E07A3C') => `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5h17v4h-9l-1.5 7H5.5l1.5-7H3z"/></svg>`,
  shield: (c = '#F1ECE4') => `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.5-3 7.6-7 9.5-4-1.9-7-5-7-9.5V6z"/></svg>`,
  pin: (n) => `<svg aria-hidden="true" width="21" height="27" viewBox="0 0 16 21" style="display:block;overflow:visible"><path d="M8 21C8 21 1.2 13.6 1.2 8.2A6.8 6.8 0 1 1 14.8 8.2C14.8 13.6 8 21 8 21Z" fill="#F2B90F" stroke="#0E0F11" stroke-width="0.8"/><text x="8" y="11.4" text-anchor="middle" style="font-family:'Archivo',sans-serif;font-stretch:85%;font-weight:800;font-size:9.5px;fill:#17130A">${n}</text></svg>`,
  ladder: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F1ECE4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/></svg>',
};

// crosshairs (64×64, HUD-Kit "Roof guns")
const XH = {
  revolver: '<circle cx="32" cy="32" r="1.6" fill="#FFF"/><path d="M32 26V18M32 38v8M26 32h-8M38 32h8" stroke="#FFF" stroke-width="1.6" stroke-linecap="round"/>',
  shotgun: '<circle cx="32" cy="32" r="1.6" fill="#FFF"/><circle cx="32" cy="32" r="12" fill="none" stroke="#FFF" stroke-width="1.5" stroke-dasharray="4.2 3.6"/>',
  rifle: '<path d="M32 21v22M21 32h22" stroke="#FFF" stroke-width="1.3" stroke-linecap="round"/><circle cx="32" cy="32" r="1.2" fill="#FFF"/>',
  throw: '<circle cx="32" cy="32" r="9" fill="none" stroke="#FFF" stroke-width="1.6"/><circle cx="32" cy="32" r="1.8" fill="#FFF"/>',
};
const XH_HIT = '<g class="hit"><path d="M23 23L16 16M41 23L48 16M23 41L16 48M41 41L48 48" stroke="#FFF" stroke-width="2.2" stroke-linecap="round"/></g>';

const GUN_NAME = { revolver: 'Revolver', shotgun: 'Pump shotgun', rifle: 'Hunting rifle', firecracker: 'Cracker', balloon: 'Paint', flare: 'Flare' };
export const SLOT_ORDER = ['revolver', 'shotgun', 'rifle', 'firecracker', 'balloon', 'flare'];

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class RoofHud {
  constructor(root) {
    this.doc = typeof document !== 'undefined' ? document : null;
    if (!this.doc) return;
    if (!this.doc.getElementById('dfd-css')) { const st = el('style'); st.id = 'dfd-css'; st.textContent = CSS; this.doc.head.appendChild(st); }
    this.root = el('div', 'dfd');
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Roof defence');
    (root || this.doc.body).appendChild(this.root);
    this.vals = new Map();
    this.onSlot = null;
    this._build();
  }

  _build() {
    const R = this.root;
    // scope (under everything else)
    this.scope = el('div', 'dfd-scope', '<div class="mask"></div><div class="lens"></div><svg width="10" height="10" viewBox="-5 -5 10 10"></svg><div class="rd"></div>');
    R.appendChild(this.scope);
    this.tags = el('div', 'dfd-tags'); R.appendChild(this.tags);
    this.tagEls = new Map();
    // stop chip
    this.stop = el('div', 'dfd-stop dfd-glass', `<span class="pin"></span><div class="main"><div class="dfd-lab t1"></div><div class="line"></div><div class="bar"><i></i></div></div><span class="sep"></span><div class="right"><div class="dfd-lab t2"></div><div class="big dfd-num"></div></div>`);
    R.appendChild(this.stop);
    // bust
    this.bust = el('section', 'dfd-bust dfd-glass', `<div class="ring"><svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="4"/><circle class="arc" cx="20" cy="20" r="18" fill="none" stroke="#E5483A" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 113.1" transform="rotate(-90 20 20)"/></svg><div class="ico">${ICO.cuffs}</div></div><div class="txt"><div class="row"><span class="dfd-lab">Bust</span><span class="dfd-num pct" style="font-size:12px;font-weight:700">0%</span></div><div class="sub"></div></div>`);
    this.bust.setAttribute('aria-label', 'Bust');
    R.appendChild(this.bust);
    this.toasts = el('div', 'dfd-toasts'); R.appendChild(this.toasts);
    // crosshair + target
    this.xh = el('div', 'dfd-xh', '<svg width="64" height="64" viewBox="0 0 64 64"></svg>');
    R.appendChild(this.xh);
    this.tgt = el('div', 'dfd-tgt dfd-glass dfd-hi', '<span class="d"></span><span class="p"></span>');
    R.appendChild(this.tgt);
    this.banner = el('div', 'dfd-banner dfd-glass', '');
    R.appendChild(this.banner);
    // controls
    this.ctl = el('section', 'dfd-ctl dfd-glass', '');
    this.ctl.setAttribute('aria-label', 'Controls');
    R.appendChild(this.ctl);
    // hint
    this.hint = el('div', 'dfd-hint', '');
    R.appendChild(this.hint);
    // weapons
    this.wpn = el('section', 'dfd-wpn dfd-glass dfd-hi');
    this.wpn.setAttribute('aria-label', 'Weapons');
    this.slots = {};
    SLOT_ORDER.forEach((id, i) => {
      if (i === 3) this.wpn.appendChild(el('span', 'dfd-vs'));
      const t = i >= 3;
      const b = el('button', 'dfd-slot' + (t ? ' t' : ''), `<span class="kk">${i + 1}</span><span class="n"></span><span class="ic">${ICO[id]}</span><span class="nm">${GUN_NAME[id]}</span>`);
      b.type = 'button'; b.setAttribute('aria-label', `${GUN_NAME[id]} (${i + 1})`);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.onSlot) this.onSlot(id); });
      this.wpn.appendChild(b);
      this.slots[id] = b;
    });
    this.wpn.appendChild(el('span', 'dfd-vs'));
    this.ammo = el('div', 'dfd-ammo', `<div class="ring"><svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"/><circle class="arc" cx="13" cy="13" r="11.5" fill="none" stroke="rgba(241,236,228,0.5)" stroke-width="3" stroke-linecap="round" stroke-dasharray="72.26 72.26" transform="rotate(-90 13 13)"/></svg><b>R</b></div><div><span class="dfd-lab lab">Ammo</span><div class="v"><span class="dfd-num m">0</span><span class="rs">/ 0</span></div></div>`);
    this.wpn.appendChild(this.ammo);
    R.appendChild(this.wpn);
  }

  // write-on-change helpers
  _set(key, node, prop, v) { if (this.vals.get(key) === v) return; this.vals.set(key, v); node[prop] = v; }
  _cls(key, node, cls, on) { const k = key + '|' + cls; on = !!on; if (this.vals.get(k) === on) return; this.vals.set(k, on); node.classList.toggle(cls, on); }
  _style(key, node, prop, v) { if (this.vals.get(key) === v) return; this.vals.set(key, v); node.style.setProperty(prop, v); }
  _attr(key, node, a, v) { if (this.vals.get(key) === v) return; this.vals.set(key, v); node.setAttribute(a, v); }

  show(on) { if (!this.root) return; if (this.root.hidden === !on) return; this.root.hidden = !on; }

  /** vm: see DefendClient._vm() */
  update(vm) {
    if (!this.root || this.root.hidden) return;
    const q = (s) => this.root.querySelector(s);
    // ── stop chip
    const S = vm.stop;
    this._set('st.pin', this.stop.querySelector('.pin'), 'innerHTML', S.pin != null ? ICO.pin(S.pin) : ICO.shield());
    this._set('st.t1', this.stop.querySelector('.t1'), 'textContent', S.title);
    this._set('st.line', this.stop.querySelector('.line'), 'textContent', S.line);
    this._set('st.t2', this.stop.querySelector('.t2'), 'textContent', S.rightLabel);
    this._set('st.big', this.stop.querySelector('.big'), 'textContent', S.rightValue);
    this._style('st.bar', this.stop.querySelector('.bar i'), 'width', `${Math.round((S.frac ?? 0) * 100)}%`);
    this._style('st.barv', this.stop.querySelector('.bar'), 'visibility', S.frac != null ? 'visible' : 'hidden');
    // ── bust
    const B = vm.bust, pct = Math.round(B.value * 100);
    this._attr('bu.arc', this.bust.querySelector('.arc'), 'stroke-dasharray', `${(113.1 * B.value).toFixed(2)} 113.10`);
    this._set('bu.pct', this.bust.querySelector('.pct'), 'textContent', `${pct}%`);
    this._set('bu.sub', this.bust.querySelector('.sub'), 'textContent', B.sub);
    this._cls('bu', this.bust, 'hot', B.value > 0.01);
    // ── crosshair
    this._set('xh', this.xh.querySelector('svg'), 'innerHTML', (XH[vm.crosshair] || XH.revolver) + XH_HIT);
    this._style('xh.op', this.xh, 'opacity', vm.scope || vm.climbing ? '0' : '1');
    const T = vm.target;
    this._cls('tg', this.tgt, 'on', !!T && !vm.climbing && !vm.scope);
    if (T) {
      this._set('tg.d', this.tgt.querySelector('.d'), 'textContent', T.dist);
      this._set('tg.p', this.tgt.querySelector('.p'), 'textContent', T.part);
      this._set('tg.pc', this.tgt.querySelector('.p'), 'className', 'p' + (T.tone ? ' ' + T.tone : ''));
    }
    // ── scope
    this._cls('sc', this.scope, 'on', vm.scope);
    if (vm.scope) {
      const r = Math.round(Math.min(vm.w || 1280, vm.h || 720) * 0.43);
      this._style('sc.r', this.scope, '--r', r + 'px');
      if (this.vals.get('sc.svgr') !== r) {
        this.vals.set('sc.svgr', r);
        const svg = this.scope.querySelector('svg');
        svg.setAttribute('width', 2 * r); svg.setAttribute('height', 2 * r); svg.setAttribute('viewBox', `${-r} ${-r} ${2 * r} ${2 * r}`);
        let ticks = '';
        for (let i = 1; i <= 4; i++) { const d = i * r * 0.11; ticks += `<path d="M${-d} -5V5M${d} -5V5M-5 ${-d}H5M-5 ${d}H5" stroke="#0b0c0d" stroke-width="1.6"/>`; }
        svg.innerHTML = `<path d="M${-r} 0H${-r * 0.06}M${r * 0.06} 0H${r}M0 ${-r}V${-r * 0.06}M0 ${r * 0.06}V${r}" stroke="#0b0c0d" stroke-width="1.4"/><path d="M${-r} 0H${-r * 0.55}M${r * 0.55} 0H${r}M0 ${r * 0.55}V${r}" stroke="#0b0c0d" stroke-width="5"/>${ticks}<circle r="2.6" fill="#E5483A"/><circle r="5.5" fill="none" stroke="rgba(229,72,58,0.45)" stroke-width="1"/>`;
      }
      this._set('sc.rd', this.scope.querySelector('.rd'), 'textContent', vm.scopeText || '');
    }
    // ── banner (climbing / dry)
    this._cls('bn', this.banner, 'on', !!vm.banner);
    if (vm.banner) this._set('bn.t', this.banner, 'innerHTML', vm.banner);
    // ── controls
    this._set('ctl', this.ctl, 'innerHTML', vm.controls);
    // ── hint
    this._set('hint', this.hint, 'innerHTML', vm.scope ? '' : vm.hint || '');
    // ── weapons
    for (const id of SLOT_ORDER) {
      const b = this.slots[id], s = vm.slots[id];
      this._cls('sl.' + id, b, 'sel', s.sel);
      this._cls('sl.' + id, b, 'empty', s.empty);
      this._set('sl.n.' + id, b.querySelector('.n'), 'textContent', s.count);
      this._set('sl.nc.' + id, b.querySelector('.n'), 'className', 'n' + (s.red ? ' red' : ''));
    }
    const A = vm.ammo;
    this._set('am.m', this.ammo.querySelector('.m'), 'textContent', String(A.mag));
    this._set('am.r', this.ammo.querySelector('.rs'), 'textContent', `/ ${A.reserve}`);
    this._set('am.l', this.ammo.querySelector('.lab'), 'textContent', A.label);
    this._cls('am', this.ammo, 'reload', A.reload > 0);
    this._cls('am', this.ammo, 'dry', A.dry);
    const arc = this.ammo.querySelector('.arc');
    const k = A.reload > 0 ? A.reload : 1;
    this._attr('am.arc', arc, 'stroke-dasharray', `${(72.26 * k).toFixed(2)} 72.26`);
    this._attr('am.arcc', arc, 'stroke', A.reload > 0 ? '#F2B90F' : A.dry ? '#E5483A' : 'rgba(241,236,228,0.5)');
    void q;
  }

  hitMarker(kind = 'hit') {
    if (!this.xh) return;
    this.xh.classList.remove('hit', 'dis');
    void this.xh.offsetWidth;   // restart (cheap, only on a hit)
    this.xh.classList.add('hit');
    if (kind === 'disabled') this.xh.classList.add('dis');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => this.xh && this.xh.classList.remove('hit', 'dis'), kind === 'disabled' ? 420 : 200);
  }

  /** toast { key, icon, text, sub, value, tone } — same key updates in place */
  toast(t) {
    if (!this.toasts) return;
    const key = t.key || (t.text + (t.sub || ''));
    let e = this.toasts.querySelector(`[data-k="${CSS_ESC(key)}"]`);
    const html = `${t.icon || ''}<b>${t.text}</b>${t.sub ? `<span>${t.sub}</span>` : ''}${t.value ? `<em class="${t.tone || ''}">${t.value}</em>` : ''}`;
    if (!e) {
      e = el('div', 'dfd-toast dfd-glass');
      e.dataset.k = key;
      this.toasts.appendChild(e);
      while (this.toasts.children.length > 4) this.toasts.firstElementChild.remove();
      void e.offsetWidth;   // start the fade from the hidden style (no rAF needed)
      e.classList.add('on');
    }
    if (e._html !== html) { e._html = html; e.innerHTML = html; }
    clearTimeout(e._t);
    e._t = setTimeout(() => { e.classList.remove('on'); setTimeout(() => e.remove(), 220); }, t.ms || 2600);
  }

  /** cop tags: [{ id, x, y, ax, ay, unit, chips: [[iconHtml, text]] }] (screen px; ax/ay = the car point) */
  layoutTags(list) {
    if (!this.tags) return;
    const seen = new Set();
    for (const t of list) {
      seen.add(t.id);
      let e = this.tagEls.get(t.id);
      if (!e) {
        const tag = el('div', 'dfd-tag dfd-glass');
        const svg = this.doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'dfd-lead'); svg.setAttribute('width', '1'); svg.setAttribute('height', '1');
        svg.innerHTML = '<path stroke="rgba(241,236,228,0.7)" stroke-width="1.2" fill="none"/><circle r="2.6" fill="#F1ECE4" stroke="#0E0F11" stroke-width="1"/>';
        this.tags.appendChild(svg); this.tags.appendChild(tag);
        e = { tag, svg, html: '' };
        this.tagEls.set(t.id, e);
      }
      const html = `<span class="u">Unit ${t.unit}</span>` + t.chips.map(([ic, tx]) => `<span class="c">${ic}${tx}</span>`).join('');
      if (e.html !== html) { e.html = html; e.tag.innerHTML = html; }
      e.tag.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px)`;
      // leader from the tag's bottom edge to the car
      const lx = t.x + 26, ly = t.y + 26;
      e.svg.querySelector('path').setAttribute('d', `M${lx.toFixed(1)} ${ly.toFixed(1)}L${t.ax.toFixed(1)} ${t.ay.toFixed(1)}`);
      const c = e.svg.querySelector('circle'); c.setAttribute('cx', t.ax.toFixed(1)); c.setAttribute('cy', t.ay.toFixed(1));
    }
    for (const [id, e] of this.tagEls) if (!seen.has(id)) { e.tag.remove(); e.svg.remove(); this.tagEls.delete(id); }
  }

  destroy() {
    if (this.root) this.root.remove();
    this.root = null; this.tagEls && this.tagEls.clear();
  }
}
const CSS_ESC = (s) => String(s).replace(/["\\]/g, '\\$&');
export { ICO, GUN_NAME, fmtTime };
