# Porting Cook & Run to Unity 6 (URP)

A practical guide for moving the browser prototype (three.js + Node) to **Unity 6 (6000.x LTS) with the
Universal Render Pipeline**. The JS code was written with this port in mind:
- the simulation is pure logic with no DOM or three.js,
- all tuning lives in JSON,
- every network message is plain JSON that maps 1:1 to C# structs,
- the cook's minigames are logic classes with a separate view (a 3D presenter per station in the van
  lab, or a 2D draw step in the fallback panel),
- the 3D van lab is a thin layer on top: a layout file (`van.json`), a pure-logic Doc controller, and
  presenters that only *read* minigame state.

So most of the port is translation, not redesign.

> **The golden rule:** keep the **simulation and lab logic as plain C#** (no `UnityEngine`) in
> **sim space**, the exact same coordinates and numbers as the JS. Unity only *presents* it. Convert
> coordinates in one place (`SimSpace`, §1). Then the C# port can be unit-tested against the JS, and it
> can even talk to the browser version (§4, option B).

---

## Contents
0. [Setup: packages & project layout](#0-setup-packages--project-layout)
1. [Coordinate mapping](#1-coordinate-mapping)
2. [File-by-file mapping](#2-file-by-file-mapping)
3. [Data: JSON → ScriptableObjects](#3-data-json--scriptableobjects)
4. [Networking: two options](#4-networking-two-options)
5. [Step-by-step port order (with code)](#5-step-by-step-port-order), including
   [5.7 The 3D van lab](#57-the-3d-van-lab)
6. [Input System mapping](#6-input-system-mapping)
7. [Gotchas](#7-gotchas)
8. [The 40-minute expansion](#8-the-40-minute-expansion): set-pieces, garage, shops, roof, first-person cab

---

## 0. Setup: packages & project layout

**Packages** (Package Manager):

| Package | Why |
|---|---|
| Universal RP (template "Universal 3D") | renderer |
| Input System (`com.unity.inputsystem`) | keyboard / gamepad / touch actions (§6) |
| Cinemachine 3 (`com.unity.cinemachine`) + Splines | chase / jump cameras, the van lab's dollhouse + close-up cameras (§5.7) |
| glTFast (`com.unity.cloud.gltfast`) | import the `.glb` files exported from `public/assets.html` |
| Newtonsoft Json (`com.unity.nuget.newtonsoft-json`) | read our JSON (needs dictionaries, which `JsonUtility` can't do) |
| Test Framework | parity tests against the JS |
| Netcode for GameObjects (`com.unity.netcode.gameobjects`) + Multiplayer Services (`com.unity.services.multiplayer`) | option A networking (§4) |
| NativeWebSocket (git: `https://github.com/endel/NativeWebSocket.git#upm`) | option B networking (§4) |

**Folders and assembly definitions.** Asmdefs keep the sim engine-agnostic, and the compiler enforces it.

```
Assets/CookRun/
  Data/            route.json, rules.json, lab.json, van.json (copied from public/js/data, byte-identical) + GameData.asset
  Scripts/Sim/     CookRun.Sim.asmdef   ← "No Engine References" ✔ (pure C#: Rng, Track, Road, GameSim, systems, Protocol)
  Scripts/Cook/    CookRun.Cook.asmdef  ← "No Engine References" ✔ (CookLab + presence, StepStations, minigames, DocMotor)  refs: Sim
  Scripts/Game/    CookRun.Game.asmdef  ← Unity side: GameLoop, SimSpace, VanSpace, presenters, cameras, HUD, van lab, net
  Tests/EditMode/  CookRun.Tests.asmdef ← NUnit parity tests, refs: Sim, Cook, Newtonsoft
  Models/ (.glb)   Prefabs/ (incl. VanInterior + station prefabs)   UI/ (UXML, USS)   Audio/   Scenes/ (Boot, Lobby, Game, VanLabTest)
```

Optional: **AI Navigation** (`com.unity.ai.navigation`), only if you give Doc a real NavMesh instead of
the rectangle walker in §5.7.

Keep one source of truth for the data: copy the JSON with a small script, or keep the Unity project
as a folder next to `public/` and copy on build.

---

## 1. Coordinate mapping

three.js is **right-handed, Y-up**. Unity is **left-handed, Y-up**. Our route runs toward **+Z**, and in
three.js the **driver's right is −X** (`CONTRACT.md`, `track.js`). If you copied the numbers straight
into Unity, the world would be mirrored: traffic would drive on the left and every right turn would
become a left turn.

**Fix: flip X at the presentation boundary.**

| Quantity | Sim space (JS and C# sim) | Unity space |
|---|---|---|
| Position | `(x, y, z)` | `(−x, y, z)` |
| Lateral offset `u` (u > 0 = driver's right) | `x = centerX(z) − u` | `x_u = u − centerX(z)`, so the driver's right is **+X** |
| Yaw (`forward = (sin yaw, 0, cos yaw)`) | `yaw` (radians; steering right ⇒ yaw decreases) | `yaw_u = −yaw` → `Quaternion.Euler(0, −yaw·Rad2Deg, 0)` (steering right ⇒ Unity yaw increases, clockwise from above ✔) |
| Body pose (`render/rv.js` applies `rotation.set(−pitch, yaw, roll)` in `'YXZ'` order) | `pitch` > 0 nose up, `roll` > 0 leans to the driver's right | `Quaternion.Euler(−pitch°, −yaw°, −roll°)` (Unity's Z-X-Y Euler order is the same as three's `'YXZ'`) |
| Velocities, `latAcc` sign, normals | `(vx, vy, vz)` | `(−vx, vy, vz)` |
| Triangle winding (procedural meshes) | counter-clockwise = front | **reverse each triangle** after mirroring X, or faces turn inside out |

```csharp
// SimSpace.cs (Game assembly): the ONLY place that knows about the X flip.
using UnityEngine;

public static class SimSpace
{
    public static Vector3 Pos(double x, double y, double z) => new Vector3((float)-x, (float)y, (float)z);
    public static Quaternion Yaw(double yaw) => Quaternion.Euler(0f, (float)(-yaw * Mathf.Rad2Deg), 0f);
    public static Quaternion Pose(double yaw, double pitch, double roll) =>
        Quaternion.Euler((float)(-pitch * Mathf.Rad2Deg), (float)(-yaw * Mathf.Rad2Deg), (float)(-roll * Mathf.Rad2Deg));
    public static Vector3 Dir(double x, double y, double z) => new Vector3((float)-x, (float)y, (float)z);
    public static (double x, double y, double z) ToSim(Vector3 p) => (-p.x, p.y, p.z);   // e.g. for mouse picks
}
```

**Models.** glTF is right-handed with the asset's front facing **+Z**, the same as our models
(`createModel`: origin at ground centre, front +Z, metres). glTFast and UnityGLTF convert the
handedness on import (they mirror X and fix the winding for you), so a model that faces +Z in the
showroom should face +Z (Unity's forward) after import, with its right side on +X. **Verify once per
model family:**
1. Drop the RV prefab at the origin with no rotation.
2. The headlights must point along the blue +Z arrow, and the rust-red door must be on the same side as
   in `public/assets.html`.
3. If it's wrong, fix it **once in the prefab** (a child `Model` rotated 180°, or scale −1 on X). Never
   fix it in code.

---

## 2. File-by-file mapping

| Web (this repo) | Unity | Notes |
|---|---|---|
| `public/js/data/route.json`, `rules.json`, `lab.json` | Same files as **TextAssets** + a `GameDataAsset : ScriptableObject` that parses them into POCOs (`RouteData`, `RulesData`, `LabData`) | §3. Designers edit the JSON. Optional: an editor inspector to tweak values |
| `public/js/data/van.json` | TextAsset → `VanData` POCO (interior box, walkable rectangles, stations + stand points, cab, Doc, sway, cameras) | RV-local metres in **sim handedness** (+X = driver's left): convert with `VanSpace` (§5.7). An editor script builds the `VanInterior` prefab from it |
| `public/js/data/loadData.js` | `GameDataAsset.Load()` | cached |
| `public/js/shared/protocol.js` | `Protocol.cs`: `const string` message types, `enum Kind : byte` (same order as `KIND`!), `[Serializable]` `Snapshot`, `LabState`, `CookCommand`, `EndResult`, `DriverInput` | `KIND` order is the wire id: append only |
| `public/js/sim/rng.js` | `Rng.cs` | §5.1, complete code, bit-identical |
| `public/js/sim/track.js` | `Track.cs` (pure C#) | §5.1, complete port of `CenterX` and friends |
| `public/js/sim/road.js` | `Road.cs`: baked `double[]` samples every 1 m | same lane addressing `(dir, rank)` |
| `public/js/sim/util.js` | `SimMath` static class | `WrapAngle`, `Approach`, `R2`… (watch rounding, §7) |
| `public/js/sim/GameSim.js` + each system (RV, traffic, pedestrians, police/heat, obstacles, stops, events, bridge, scoring) | `GameSim` + one plain C# class per system, ticked by a **`GameLoop : MonoBehaviour`** in `FixedUpdate` (`fixedDeltaTime = 1/60`) | engine-agnostic; `Step(input, dt)`, `Snapshot()`, `NetSnapshot()`, `DrainNetEvents()`, `ApplyCookCommand()`, `SetLabState()` |
| `public/js/sim/test/run-headless.js` | EditMode tests: a scripted bot drives the whole route headless | fast regression checks |
| `public/js/render/WorldView.js` | `Game` scene + **`SnapshotPresenter`** (pools prefabs by entity id) | §5.4 |
| `public/js/render/entities.js`, `rig.js` | `EntityView` prefabs (one per `Kind`) + per-kind animation scripts | the rig/one-draw-call trick isn't needed: the SRP Batcher and GPU instancing do that job |
| `public/js/render/rv.js` | `RvView`: wheel spin and steer, suspension sway, vent smoke, fire glow, nitro flames, dust | reads `snap.rv`, `snap.feel`, `snap.lab` |
| `public/js/render/chunks.js`, `roadBuilder.js` | `RoadChunkBuilder` (procedural `Mesh` per 50 m) + `ScenerySpawner` seeded with `Rng(Rng.HashSeed(seed, chunkIndex))` | both players get the same world. Remember the winding flip (§1) |
| `public/js/render/bake.js`, `models.js`, `fallbackModels.js` | not needed: prefabs + static batching / SRP Batcher. Fallback = a grey placeholder prefab | |
| `public/js/render/cameras.js` | **Cinemachine 3**: chase = `CinemachineCamera` + `CinemachineFollow` (offset ≈ (0, 6, −13), damping) + `CinemachineRotationComposer`, FOV widened with speed by a script, `CinemachineImpulseSource` for shake. Rear (2D-fallback cook only) = camera parented at the rear window looking back. Cinematic jump = `CinemachineSplineDolly` beside the gap, given priority on `EV.JUMP` and released on `LANDED` | the cook's 3D cameras are in `van/vanCamera.js` (below) |
| `public/js/render/env.js` | Directional light (follows the RV), `RenderSettings` linear fog (`fogStartDistance`/`fogEndDistance` from `fogNear`/`fogFar`), gradient skybox (Shader Graph). Blend biome colours with `Track.BiomeWeights` | dust storm = fog override |
| `public/js/render/particles.js`, `fx.js`, `textures.js` | **Shuriken** Particle Systems (or VFX Graph on desktop only, §7), comic pop-up words with TextMeshPro, ground markers as decals | |
| `public/js/render/audio.js` (synthesised WebAudio) | **AudioSources + AudioMixer** (groups: Engine, Siren, SFX, Lab, UI, Music). Engine loop pitch from speed | replace the synthesis with recorded clips |
| `public/js/ui/hud.js` + `css/hud.css` | **UI Toolkit**: `Hud.uxml` + `hud.uss` + `HudPresenter` | stars, speed, hp, bags, gadgets, bridge speed meter, toasts, end screen |
| `public/js/ui/lobby.js` | `Lobby.uxml` + `LobbyController` (Sessions, or the WebSocket lobby) | §4 |
| `public/js/cook/CookLab.js` | `CookLab.cs` (pure C#, Cook assembly) | same state machine: idle → requesting → running → done/failed, plus **station presence** (`SetPresenceMode`, `SetPresence`, `StationForStep`, `StepStation`, `AwayFromStation`, §5.7) |
| `public/js/cook/stations.js` | `StepStations` static map (Cook assembly) | step type → station id: grind → grind, measure → measure, heat/stir → stove, cool → cool, break → break, hammer → hammer |
| `public/js/cook/minigames/Minigame.js` + `grind`, `measure`, `heat`, `stir`, `cool`, `break`, `hammer`, `index.js` | `Minigame` base + one class per step + `MinigameFactory` | §5.6. `draw()` moves to a view class; in 3D the view is a `StepPresenter` (§5.7) |
| `public/js/cook/CookUI.js`, `LabScene.js`, `theme.js`, `draw.js`, `icons.js`, `css/cook.css` | **2D fallback only** (`?lab2d=1` on the web): UI Toolkit `CookPanel.uxml`/`cook.uss`, a `MinigameCanvas` (`Painter2D`, §5.6), a `CookTheme` ScriptableObject, icons as sprites or vector images | optional in Unity; handy as a debug view of the minigames |
| `public/js/van/VanLab3D.js` | `VanLab : MonoBehaviour` on the `VanInterior` root | `SetActive(bool)`, per-frame order (Doc → presence → stations → highlight), key forwarding, `DocState` (§5.7) |
| `public/js/van/interior.js` | `VanInterior.prefab`, a child of the RV's `Body` (the tilt group) | shell with the near walls cut low, cab with Rook and a steering wheel driven by `rv.steer`, merged furniture, station prefabs with `Anchor` children |
| `public/js/van/DocController.js` | `DocMotor` (pure C#, Cook assembly) + `DocView : MonoBehaviour` (Animator) | walking in van-local space over the `walkable` rectangles, click-to-move, sway push, hop/stumble. Not a `CharacterController` (§5.7) |
| `public/js/van/vanCamera.js` | Two `CinemachineCamera`s: `DollhouseCam` (Follow, world-up binding, zoom levels) + `CloseUpCam` (parented to the station anchor), blended by priority | §5.7 |
| `public/js/van/hazards3d.js` | `LabHazardsView`: stove fire (Shuriken + flickering light), fumes haze (particles or a local volume), vent fan + chimney smoke, curtains (Animator), extinguisher pickup/spray, hull holes, stash bags, pantry jar fills | reads `CookLab` (fumes, fire, ventOpen, curtainsClosed, extinguisher) and `snap.rv.hp` |
| `public/js/van/presenters/**` (`index.js`: `createPresenter`, `buildIdleProps`, `STEP_STATION`; one file per step type; `fx.js`) | `StationView` + one `StepPresenter` subclass per step type on the station prefabs; idle props as a child object; pooled `ParticleSystem`s for presenter FX | input by `Physics.Raycast` into the props (§5.7) |
| `public/js/van/VanHud.js`, `css/van.css` | UI Toolkit `VanHud.uxml` / `van.uss` | "E · Stove" prompt, step panel (label, progress, hint), recipe board overlay |
| `public/van-test.html`, `public/van-presenters-test.html` | `VanLabTest.unity` (interior on a fake moving RV) and a bench scene per presenter | |
| `public/js/net/NetClient.js` | option A: NGO `NetworkManager` + `CoopLink : NetworkBehaviour`. Option B: `WsNetClient` (NativeWebSocket) | §4 |
| `public/js/net/LocalBus.js` | `LocalBus.cs`: two in-process endpoints with a queue (deliver next frame, deep-copy) | solo mode |
| `server/index.js`, `rooms.js`, `render.yaml` | option A: replaced by Relay + Sessions. Option B: **kept as is** | |
| `public/js/main.js` | `GameBootstrap` (scene flow: Boot → Lobby → Game) + `SessionController` (solo / online driver / online cook) | solo: **Tab** switches seats, and the `AutopilotDriver` drives while you cook (§5.7) |
| `public/assets.html` + `public/js/assets/**` | export every kind as `.glb` → `Assets/CookRun/Models` → prefabs | §5.3 |

---

## 3. Data: JSON → ScriptableObjects

`JsonUtility` can't read dictionaries or nulls. Ours has plenty: `stops[].gives`, `recipes[].needs`,
`startInventory`, `heat.sources`, `obstacles`, `traffic`, `ingredients`. So parse with
**Newtonsoft**. It matches field names case-insensitively, so plain POCOs work with no attributes, and
the Sim assembly stays free of any JSON dependency.

```csharp
// Sim assembly: plain data classes mirroring the JSON (excerpt; add the rest the same way).
using System.Collections.Generic;

namespace CookRun.Sim
{
    public sealed class RouteData
    {
        public double routeLength;
        public uint? defaultSeed;
        public double? biomeBlend;                 // nullable: the JS uses `?? 80`
        public BiomeData[] biomes;
        public StopData[] stops;
        public RouteEvent[] events;
        public BridgeData bridge;
        public SellPointData sellPoint;
    }
    public sealed class BiomeData
    {
        public string id, name;
        public double from, to;
        public int lanes;
        public double laneWidth, shoulder, curveAmp, curveWave, trafficPer100m, pedPer100m, obstaclePer100m;
        public bool sidewalk;
        public string[] traffic, obstacles, scenery;
        public double? intersectionEvery;
        public Dictionary<string, string> colors;  // ground, roadside, road, line, sky, fog, sun
        public double fogNear, fogFar;
    }
    public sealed class StopData
    {
        public string id, name, model;
        public double z, lotLength, lotDepth, loadTime;
        public int side;                           // +1 = driver's right, -1 = left
        public Dictionary<string, int> gives;
        public bool key;
    }
    public sealed class BridgeData
    {
        public string name;
        public double straightFrom, rampStart, lip, rampHeight, gapStart, gapEnd, landingEnd, landingHeight;
        public double minSpeedHint, checkpointZ, canyonDepth, gravity;
    }
    public sealed class RouteEvent { public string type; public double? from, to, z, period, warn, pass, every; }
    public sealed class SellPointData { public double z, radius; public int side, requiredUnits; public string name, model; }
}
```

```csharp
// Game assembly
using Newtonsoft.Json;
using UnityEngine;
using CookRun.Sim;
using CookRun.Cook;   // VanData

public sealed class GameData   // a plain class (not a `record`: Unity lacks IsExternalInit)
{
    public readonly RouteData Route; public readonly RulesData Rules; public readonly LabData Lab; public readonly VanData Van;
    public GameData(RouteData r, RulesData ru, LabData l, VanData v) { Route = r; Rules = ru; Lab = l; Van = v; }
}

[CreateAssetMenu(menuName = "Cook & Run/Game Data")]
public sealed class GameDataAsset : ScriptableObject
{
    public TextAsset route, rules, lab, van;       // drag the four JSON files here
    [System.NonSerialized] GameData _cache;
    public GameData Load() => _cache ??= new GameData(
        JsonConvert.DeserializeObject<RouteData>(route.text),
        JsonConvert.DeserializeObject<RulesData>(rules.text),
        JsonConvert.DeserializeObject<LabData>(lab.text),
        JsonConvert.DeserializeObject<VanData>(van.text));      // VanData: §5.7
}
```

Same rule as the web build: **add keys, never rename or remove them.**

---

## 4. Networking: two options

The web game is **host-authoritative**. The driver runs the 60 Hz sim and sends the cook a snapshot at
15 Hz (`rules.json › net.snapshotHz`). The cook sends `LabState` at 6 Hz (`net.labHz`) plus commands
immediately. The Node server only pairs players and relays messages. Keep that topology in Unity.

### Option A: Netcode for GameObjects + Relay (recommended for a native build)
- **Host = driver, client = cook.** The driver's machine calls `StartHost` and runs `GameSim`. The cook
  is a client and runs `CookLab`.
- **Multiplayer Services "Sessions"** (Lobby + Relay together) replace `server/`. The host creates a
  2-player session with Relay and shares `session.Code`, which replaces the 4-letter room code. The
  cook joins by code. No server to run, NAT punch-through is handled for you, and the free tier covers
  student traffic.
- **The catch:** NGO can't talk to the browser version.

```csharp
using System.Threading.Tasks;
using Unity.Services.Authentication;
using Unity.Services.Core;
using Unity.Services.Multiplayer;

public static class CoopSession
{
    public static async Task<ISession> HostAsync()
    {
        await SignInAsync();
        // RelayNetworkOptions(protocol, region: null = auto by ping, preserveRegion). Older SDKs: .WithRelayNetwork()
        var options = new SessionOptions { MaxPlayers = 2 }
            .WithRelayNetwork(new RelayNetworkOptions(RelayProtocol.Default, null, true));
        var session = await MultiplayerService.Instance.CreateSessionAsync(options);
        // session.Code → show it / copy it. With NGO installed, the session configures
        // UnityTransport for Relay and starts the NetworkManager (host here, client on join).
        return session;
    }

    public static async Task<ISession> JoinAsync(string code)
    {
        await SignInAsync();
        return await MultiplayerService.Instance.JoinSessionByCodeAsync(code);   // starts NGO as client
    }

    static async Task SignInAsync()
    {
        if (UnityServices.State != ServicesInitializationState.Initialized) await UnityServices.InitializeAsync();
        if (!AuthenticationService.Instance.IsSignedIn) await AuthenticationService.Instance.SignInAnonymouslyAsync();
    }
}
```
(Link the project to a Unity Cloud project first: *Edit → Project Settings → Services*. Store roles and
ready flags as session player properties.)

### Option B: keep the Node server, use NativeWebSocket (cross-play)
Unity connects to the **same** `wss://<service>.onrender.com/ws` and speaks the **same JSON protocol**
(`protocol.js` + `docs/NOTES-net.md`). A Unity driver can then play with a browser cook, or the other
way round. The lobby (`create`/`join`/`role`/`ready`/`start`) and the relay (`{t:'g', m}`) work
unchanged. For this the C# snapshot JSON must match the JS exactly: field names, `ents` as tuples,
numbers rounded to 2 dp.

```csharp
using System;
using System.Text;
using System.Threading.Tasks;
using NativeWebSocket;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

public sealed class WsNetClient : MonoBehaviour
{
    WebSocket _ws;
    public event Action<JObject> OnMessage;       // lobby: room/start/error/peerLeft/pong ; game: {t:'g', m, from}
    public event Action OnOpen;

    public void Connect(string url = "wss://cook-and-run.onrender.com/ws")
    {
        _ws = new WebSocket(url);
        _ws.OnOpen += () => OnOpen?.Invoke();
        _ws.OnMessage += bytes => OnMessage?.Invoke(JObject.Parse(Encoding.UTF8.GetString(bytes)));
        _ws.OnClose += code => Debug.Log($"ws closed {code}");   // 1012 = server redeploy
        _ = _ws.Connect();                         // NOTE: this task completes only when the socket CLOSES
    }

    void Update()
    {
#if !UNITY_WEBGL || UNITY_EDITOR
        _ws?.DispatchMessageQueue();               // deliver messages on the main thread
#endif
    }

    public Task Send(object msg) => _ws.SendText(JsonConvert.SerializeObject(msg));
    public Task SendGame(object m) => Send(new { t = "g", m });    // e.g. new { k = "lab", l = labState }
    async void OnDestroy() { if (_ws != null) await _ws.Close(); }
}
```

**Recommendation:** use **NGO + Relay** for a native (desktop or mobile) build. Use the **WebSocket path**
if you want cross-play with the browser version, or to keep the Render server and invite links. The
sim, lab and presenters are identical either way. Only the transport class changes, so you can start
with B (the server already exists) and add A later.

### Protocol → NGO mapping

| Web message (`protocol.js`) | NGO equivalent | Delivery |
|---|---|---|
| `create` / `join` / `role` / `ready` / `start` / `leave` | Sessions: create / join by code / player properties / host loads the `Game` scene with `NetworkManager.SceneManager.LoadScene` / `LeaveAsync` | – |
| `S2C.START { seed, roles }` | `NetworkVariable<uint> Seed` written by the host on spawn | reliable |
| `PEER_LEFT` | `NetworkManager.OnClientDisconnectCallback` | – |
| `PING`/`PONG` | built in: `UnityTransport.GetCurrentRtt(clientId)` | – |
| `GM.SNAP` (driver → cook, 15 Hz) | `SnapshotRpc(SnapshotPacket)` with a **custom `INetworkSerializable`** (quantised entities) | **unreliable** (latest wins) |
| `snapshot.events` | `EventsRpc(string json)`: one reliable "ClientRpc" per send tick, only when non-empty | **reliable** (see §7: they can't ride on an unreliable snapshot) |
| `GM.LAB` (cook → driver, 6 Hz) | `LabStateRpc(LabStatePacket)`, `SendTo.Server` ("ServerRpc") | **reliable** (`cookHurt` is a delta) |
| `GM.CMD` (startRecipe, recipeDone, recipeFail, explosion, callout) | `CookCommandRpc(CookCommandPacket)`, `SendTo.Server` | reliable |
| `GM.END` | `EndRpc(EndResultPacket)` + `NetworkVariable<byte> Phase` | reliable |
| `GM.CHAT` | `ChatRpc(FixedString128Bytes)`, `SendTo.NotMe` | reliable |

NGO 1.8+ uses one `[Rpc(SendTo.X)]` attribute. `SendTo.Server` is the old `[ServerRpc]` and
`SendTo.NotServer` / `ClientsAndHost` cover `[ClientRpc]`. Method names **must end in `Rpc`**.

---

## 5. Step-by-step port order

Each step ends with something you can run. The effort estimates add up to the M3 estimate in
`GAME_DESIGN.md` §11.

| # | Step | Done when | Effort |
|---|---|---|---|
| 1 | Data + Track + Rng + parity tests | EditMode tests match the JS golden values | 10–15 h |
| 2 | GameSim headless + debug gizmos | A bot (or you, via gizmos) drives 7 km in the Scene view | 35–55 h |
| 3 | Import `.glb` assets → prefabs with the same named parts | All `Kind`s + RV + stores + bridge spawn correctly oriented | 10–15 h |
| 4 | Presenter + cameras + road and scenery | Playable solo driving with real art | 15–25 h |
| 5 | HUD (UI Toolkit) | Stars, speed, hp, bags, stops, bridge meter, toasts, end screen | 8–12 h |
| 6 | Cook lab logic + minigames + **3D van lab** | All 7 minigames playable on their stations in the 3D van; Doc walks, sways and stumbles; hazards in 3D; solo Tab switch with the autopilot driving | 35–55 h |
| 7 | Networking | Two machines play a full run | 15–25 h |
| 8 | Polish | Audio, VFX, post-processing, performance, builds | 15–25 h |

### 5.1 Data + Track + Rng with parity tests

**`Rng.cs`** (complete). A port of `public/js/sim/rng.js`. The `uint` arithmetic reproduces the JS
`>>>` and `Math.imul` exactly, so the sequence is **bit-identical** for the same seed (verified: seed
1337 gives `0.1844118325971067, 0.18998925131745636, 0.8104719922412187, …`).

```csharp
// Rng.cs — port of public/js/sim/rng.js (mulberry32). Bit-identical to the JS for the same seed.
using System;
using System.Collections.Generic;

namespace CookRun.Sim
{
    public sealed class Rng
    {
        uint _a;

        public Rng(uint seed) { _a = seed; }       // JS: mulberry32(seed) does `seed >>> 0`; pass seeds as uint

        /// Uniform double in [0, 1). Same sequence as `mulberry32(seed)()` in JS.
        public double NextDouble()
        {
            unchecked
            {
                _a += 0x6D2B79F5u;
                uint t = _a;
                t = (t ^ (t >> 15)) * (t | 1u);            // Math.imul(t ^ (t >>> 15), t | 1)
                t ^= t + (t ^ (t >> 7)) * (t | 61u);       // t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
                return (t ^ (t >> 14)) / 4294967296.0;     // ((t ^ (t >>> 14)) >>> 0) / 2^32
            }
        }

        public double Float(double min = 0, double max = 1) => min + (max - min) * NextDouble();
        public int Int(int min, int maxInclusive) => (int)Math.Floor(Float(min, maxInclusive + 1)); // Floor, not a cast
        public T Pick<T>(IReadOnlyList<T> arr) => arr[(int)Math.Floor(NextDouble() * arr.Count)];
        public bool Chance(double p) => NextDouble() < p;
        public int Sign() => NextDouble() < 0.5 ? -1 : 1;

        /// Port of hashSeed(...nums): stable seed from integers (per-chunk scenery).
        public static uint HashSeed(params int[] nums)
        {
            unchecked
            {
                uint h = 2166136261u;
                foreach (int n in nums) { h ^= (uint)n; h *= 16777619u; }
                return h;
            }
        }
    }
}
```

**`Track.cs`**: a complete port of `track.js`, including `CenterX` and everything it depends on. It
stays in sim space and uses `double` for parity. Verified against the JS: `CenterX` agrees to within
1e-15 at every sample point for seed 1337.

```csharp
// Track.cs — 1:1 port of public/js/sim/track.js. Pure C#, SIM SPACE (driver's right = −X).
using System;

namespace CookRun.Sim
{
    public struct StopLot { public double cx, cz, halfLen, halfDepth, u; }

    public sealed class Track
    {
        public readonly RouteData Route;
        public readonly BiomeData[] Biomes;
        public readonly double Length;
        public readonly BridgeData Bridge;
        readonly double _blendLen;
        readonly double[,] _phases;               // [biome, 0|1], per-seed curve phases
        readonly double[] _w;                     // scratch weights (one Track per thread)

        static readonly Func<BiomeData, double> KCurveAmp = b => b.curveAmp;
        static readonly Func<BiomeData, double> KLanes = b => b.lanes;
        static readonly Func<BiomeData, double> KLaneWidth = b => b.laneWidth;
        static readonly Func<BiomeData, double> KShoulder = b => b.shoulder;

        public Track(RouteData route, uint? seed = null)
        {
            Route = route;
            Biomes = route.biomes;
            Length = route.routeLength;
            _blendLen = route.biomeBlend ?? 80;
            Bridge = route.bridge;
            _w = new double[Biomes.Length];
            var r = new Rng(seed ?? route.defaultSeed ?? 1);
            _phases = new double[Biomes.Length, 2];
            for (int i = 0; i < Biomes.Length; i++)   // same call order as the JS biomes.map(() => [r(), r()])
            {
                _phases[i, 0] = r.NextDouble() * Math.PI * 2;
                _phases[i, 1] = r.NextDouble() * Math.PI * 2;
            }
        }

        static double Smooth(double t) => t * t * (3 - 2 * t);
        static double Clamp(double v, double a, double b) => v < a ? a : v > b ? b : v;

        // ── biomes ───────────────────────────────────────────────────────────
        public int BiomeIndexAt(double z)
        {
            for (int i = 0; i < Biomes.Length; i++) if (z < Biomes[i].to) return i;
            return Biomes.Length - 1;
        }
        public BiomeData BiomeAt(double z) => Biomes[BiomeIndexAt(z)];

        /// Smooth cross-fade weights of every biome at z (blendLen metres around borders).
        public void BiomeWeights(double z, double[] w)
        {
            Array.Clear(w, 0, w.Length);
            int i = BiomeIndexAt(z);
            double half = _blendLen / 2;
            var b = Biomes[i];
            if (i > 0 && z < b.from + half)
            {
                double t = Smooth(Clamp((z - (b.from - half)) / _blendLen, 0, 1));
                w[i - 1] = 1 - t; w[i] = t;
            }
            else if (i < Biomes.Length - 1 && z > b.to - half)
            {
                double t = Smooth(Clamp((z - (b.to - half)) / _blendLen, 0, 1));
                w[i] = 1 - t; w[i + 1] = t;
            }
            else w[i] = 1;
        }
        public double[] BiomeWeights(double z) { var w = new double[Biomes.Length]; BiomeWeights(z, w); return w; }

        /// Numeric biome param blended across borders, e.g. Param(z, b => b.shoulder).
        public double Param(double z, Func<BiomeData, double> key)
        {
            BiomeWeights(z, _w);
            double v = 0;
            for (int i = 0; i < _w.Length; i++) if (_w[i] != 0) v += _w[i] * key(Biomes[i]);
            return v;
        }

        // ── geometry ─────────────────────────────────────────────────────────
        // Curve amplitude multiplier: 0 at the start, 0 through the bridge straight.
        double StraightMask(double z)
        {
            double m = Smooth(Clamp(z / 120, 0, 1));
            var br = Bridge;
            if (br != null)
            {
                double a = br.straightFrom, b = br.landingEnd + 60;
                if (z > a - 120 && z < b + 120)
                {
                    double fin = 1 - Smooth(Clamp((z - (a - 120)) / 120, 0, 1));
                    double fout = Smooth(Clamp((z - b) / 120, 0, 1));
                    m *= z < b ? fin : fout;
                }
            }
            return m;
        }

        /// One global wiggle shape; each biome only scales its amplitude (blended), so borders never kink.
        public double CenterX(double z)
        {
            double amp = Param(z, KCurveAmp);
            double p1 = _phases[0, 0], p2 = _phases[0, 1];
            double p3 = Biomes.Length > 1 ? _phases[1, 0] : 0;            // JS: this.phases[1] || [0]
            double k = (Math.PI * 2) / 600;
            double shape = 0.6 * Math.Sin(z * k + p1)
                         + 0.28 * Math.Sin(z * k * 2.07 + p2)            // keep the JS evaluation order
                         + 0.12 * Math.Sin(z * k * 3.9 + p3);
            return amp * shape * StraightMask(z);
        }

        public double Slope(double z) { const double e = 0.5; return (CenterX(z + e) - CenterX(z - e)) / (2 * e); }
        public double HeadingAt(double z) => Math.Atan(Slope(z));      // sim yaw of the road

        public int LanesAt(double z) => BiomeAt(z).lanes;
        public double LaneWidth(double z) => Param(z, KLaneWidth);
        public double HalfWidth(double z) => (Param(z, KLanes) * Param(z, KLaneWidth)) / 2;
        public double Shoulder(double z) => Param(z, KShoulder);

        /// Lane i counted left→right from the driver's view (u increasing).
        public double LaneU(double z, int i)
        {
            int n = LanesAt(z); double w = LaneWidth(z);
            return (i - (n - 1) / 2.0) * w;                               // 2.0! integer division would give 0
        }
        public int LaneDir(double z, int i) => LaneU(z, i) > 0 ? 1 : -1; // +1 forward, -1 oncoming

        public double XAt(double z, double u) => CenterX(z) - u;
        public double UAt(double x, double z) => CenterX(z) - x;
        public bool IsOnRoad(double x, double z, double margin = 0) => Math.Abs(UAt(x, z)) <= HalfWidth(z) + margin;

        // ── vertical profile (canyon bridge) ─────────────────────────────────
        /// Height of the drivable surface at z, or null over the canyon gap.
        public double? SurfaceY(double z)
        {
            var b = Bridge;
            if (b == null) return 0;
            if (z >= b.rampStart && z < b.lip) return ((z - b.rampStart) / (b.lip - b.rampStart)) * b.rampHeight;
            if (z >= b.gapStart && z < b.gapEnd) return null;
            if (z >= b.gapEnd && z < b.landingEnd)
            {
                double t = (z - b.gapEnd) / (b.landingEnd - b.gapEnd);
                return b.landingHeight * (1 - t);
            }
            return 0;
        }
        public double RampAngle() => Math.Atan2(Bridge.rampHeight, Bridge.lip - Bridge.rampStart);
        public bool InBridgeZone(double z) => Bridge != null && z >= Bridge.rampStart - 10 && z <= Bridge.landingEnd + 10;

        public StopLot StopLotOf(StopData stop)
        {
            double hw = HalfWidth(stop.z) + Shoulder(stop.z);
            double u = stop.side * (hw + stop.lotDepth / 2 - 1.0);       // lot overlaps the shoulder slightly
            return new StopLot { cx = XAt(stop.z, u), cz = stop.z, halfLen = stop.lotLength / 2, halfDepth = stop.lotDepth / 2, u = u };
        }
    }
}
```

**Golden values from the JS.** Add a tiny Node script to the web repo, e.g. `scripts/golden.mjs`:

```js
// node scripts/golden.mjs 1337 > golden.json   — reference values for the Unity parity tests
import { mulberry32, hashSeed } from '../public/js/sim/rng.js';
import { Track } from '../public/js/sim/track.js';
import { loadDataNode } from '../public/js/data/loadData.js';

const seed = Number(process.argv[2] ?? 1337);
const { route } = await loadDataNode();
const r = mulberry32(seed);
const track = new Track(route, seed);
const zs = [0, 60, 500, 1400, 2000, 3150, 4800, 6000, 6280, 6300, 6355, 6900];
console.log(JSON.stringify({
  seed,
  rng: Array.from({ length: 8 }, () => r()),
  hashSeed: { '3,7': hashSeed(3, 7), '-1,1337': hashSeed(-1, 1337) },
  track: zs.map((z) => ({ z, centerX: track.centerX(z), heading: track.headingAt(z), halfWidth: track.halfWidth(z), surfaceY: track.surfaceY(z) })),
}, null, 1));
```

A few of those values for seed 1337 (with the current `route.json`):

| Check | Value |
|---|---|
| `rng` first 3 | 0.1844118325971067, 0.18998925131745636, 0.8104719922412187 |
| `hashSeed(3, 7)` / `hashSeed(-1, 1337)` | 981014255 / 4052477781 |
| `centerX(60)` / `centerX(3150)` / `centerX(4800)` | 1.7382027273519172 / 11.864039392507316 / 6.1084849459536406 |
| `headingAt(4800)` | 0.16151630375128706 |
| `halfWidth(1400)` (city/suburbs border, 50/50 blend) | 5.25 |
| `surfaceY(6300)` | null (over the gap) |
| `stopLot(hardware)` | cx −12.868760923848127, u 15.8 |
| `rampAngle()` | 9.09° |

```csharp
// Tests/EditMode/ParityTests.cs
using NUnit.Framework;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using CookRun.Sim;

public class ParityTests
{
    static RouteData Route() =>
        Newtonsoft.Json.JsonConvert.DeserializeObject<RouteData>(
            AssetDatabase.LoadAssetAtPath<TextAsset>("Assets/CookRun/Data/route.json").text);

    [Test] public void Rng_IsBitIdentical()
    {
        var r = new Rng(1337);
        Assert.AreEqual(0.1844118325971067, r.NextDouble());   // exact: integer maths
        Assert.AreEqual(0.18998925131745636, r.NextDouble());
        Assert.AreEqual(0.8104719922412187, r.NextDouble());
        Assert.AreEqual(4052477781u, Rng.HashSeed(-1, 1337));
    }

    [Test] public void Track_MatchesGoldenFile()
    {
        var golden = JObject.Parse(AssetDatabase.LoadAssetAtPath<TextAsset>("Assets/CookRun/Tests/EditMode/golden.json").text);
        var track = new Track(Route(), (uint)golden["seed"]);
        foreach (var p in golden["track"])
        {
            double z = (double)p["z"];
            Assert.AreEqual((double)p["centerX"], track.CenterX(z), 1e-9, $"centerX({z})");
            Assert.AreEqual((double)p["heading"], track.HeadingAt(z), 1e-9, $"heading({z})");
            Assert.AreEqual((double)p["halfWidth"], track.HalfWidth(z), 1e-9, $"halfWidth({z})");
            if (p["surfaceY"].Type == JTokenType.Null) Assert.IsNull(track.SurfaceY(z));
            else Assert.AreEqual((double)p["surfaceY"], track.SurfaceY(z).Value, 1e-9);
        }
    }
}
```
The RNG is compared **exactly**. Trig results use a 1e-9 tolerance, because `Math.Sin` can differ in
the last bit between V8 and .NET.

### 5.2 GameSim headless in Unity, with debug gizmos

Port `GameSim` and each system as plain C# classes in `Scripts/Sim` (no `UnityEngine`; the asmdef
enforces it). One `MonoBehaviour` drives the sim at a fixed 60 Hz:

```csharp
// GameLoop.cs (Game assembly) — host/driver only. Owns the sim; reads input; feeds the presenter.
using UnityEngine;
using UnityEngine.InputSystem;
using CookRun.Sim;

public sealed class GameLoop : MonoBehaviour
{
    [SerializeField] GameDataAsset data;
    [SerializeField] InputActionAsset actions;          // CookRun.inputactions (§6)
    [SerializeField] SnapshotPresenter presenter;

    public GameSim Sim { get; private set; }
    public Snapshot Last { get; private set; }
    const double Dt = 1.0 / 60.0;                       // pass this, not Time.fixedDeltaTime (a float)

    InputAction _throttle, _steer, _handbrake, _horn, _smoke, _oil, _nitro, _reset;
    bool _smokeQ, _oilQ, _nitroQ, _resetQ;              // edge-triggered presses, latched until the next step

    public void Begin(uint seed, bool solo)
    {
        Time.fixedDeltaTime = 1f / 60f;
        Physics.simulationMode = SimulationMode.Script; // the sim does its own collisions
        Sim = new GameSim(data.Load(), new SimOptions { Seed = seed, Solo = solo });
        var map = actions.FindActionMap("Driver", true);
        _throttle = map["Throttle"]; _steer = map["Steer"]; _handbrake = map["Handbrake"]; _horn = map["Horn"];
        _smoke = map["Smoke"]; _oil = map["Oil"]; _nitro = map["Nitro"]; _reset = map["Reset"];
        map.Enable();
    }

    void Update()
    {
        if (Sim == null) return;
        _smokeQ |= _smoke.WasPressedThisFrame();
        _oilQ   |= _oil.WasPressedThisFrame();
        _nitroQ |= _nitro.WasPressedThisFrame();
        _resetQ |= _reset.WasPressedThisFrame();
        Last = Sim.Snapshot();                          // full detail; drains the LOCAL event queue
        if (presenter) presenter.Present(Last);
    }

    void FixedUpdate()
    {
        if (Sim == null) return;
        var input = new DriverInput
        {
            throttle = _throttle.ReadValue<float>(),
            steer = _steer.ReadValue<float>(),          // +1 = right, same as the JS
            handbrake = _handbrake.IsPressed(),
            horn = _horn.IsPressed(),
            smoke = _smokeQ, oil = _oilQ, nitro = _nitroQ, reset = _resetQ,
        };
        _smokeQ = _oilQ = _nitroQ = _resetQ = false;    // true for exactly one sim step
        Sim.Step(input, Dt);
    }
}
```

Before any art exists, draw the sim with gizmos:

```csharp
// SimGizmos.cs — road edges + entities as wire spheres. Good enough to drive the whole route.
using UnityEngine;
using CookRun.Sim;

public sealed class SimGizmos : MonoBehaviour
{
    [SerializeField] GameLoop loop;
    void OnDrawGizmos()
    {
        var s = loop ? loop.Last : null; if (s == null) return;
        var track = loop.Sim.Track;                     // expose the Track from your GameSim
        Gizmos.color = Color.yellow;
        for (double z = s.rv.z - 60; z < s.rv.z + 260; z += 5)
        {
            double hw0 = track.HalfWidth(z), hw1 = track.HalfWidth(z + 5);
            Gizmos.DrawLine(SimSpace.Pos(track.XAt(z, -hw0), 0, z), SimSpace.Pos(track.XAt(z + 5, -hw1), 0, z + 5));
            Gizmos.DrawLine(SimSpace.Pos(track.XAt(z, hw0), 0, z), SimSpace.Pos(track.XAt(z + 5, hw1), 0, z + 5));
        }
        Gizmos.color = Color.cyan;
        Gizmos.DrawWireCube(SimSpace.Pos(s.rv.x, s.rv.y + 1.7, s.rv.z), new Vector3(2.6f, 3.4f, 8.6f)); // rules.rv size
        foreach (var e in s.ents)
        {
            var kind = (Kind)(int)e[1];
            Gizmos.color = kind <= Kind.rival ? Color.red : kind == Kind.ped ? Color.green : Color.gray;
            Gizmos.DrawWireSphere(SimSpace.Pos(e[2], e[3], e[4]), 1f);
        }
    }
}
```
Port the systems in the same order the JS sim builds them, and write a headless EditMode test that
drives a bot down the whole route (like `public/js/sim/test/run-headless.js`).

### 5.3 Import the `.glb` assets and build prefabs

1. Open `public/assets.html` (the showroom) and export every kind as `.glb` (see `docs/ASSETS.md`).
   Put the files in `Assets/CookRun/Models/`. glTFast imports each one as a model asset.
2. For each kind, make a **Prefab Variant** and add its view script (`EntityView`, `CopView`,
   `PedView`, `RvView`…). Keep the **named parts** exactly as exported: vehicles `wheel_*`; RV `vent`,
   `door`; cops `light_red`, `light_blue`; heli `rotor`, `tail_rotor`, `spot`; ped `leg_l`, `leg_r`,
   `arm_l`, `arm_r`, `head`; train `car_*`; crossing gate `arm`. Find them once in `Awake`, e.g.
   `transform.Find("wheel_fl")` or by scanning children whose names start with `wheel_`. Limb pivots
   are already at the hip and shoulder, so animate `localRotation`.
3. **Vertex colours.** Our models are vertex-coloured (`assets/palette.js`). If a model imports white or
   grey, its material ignores the glTF `COLOR_0` channel. Make one URP **Shader Graph** (Vertex Color →
   Base Color, Smoothness 0, the Lit or Simple Lit target) and share it across all models. That keeps
   the SRP Batcher happy. Emissive parts (cop lights, windows) get their own material.
4. Check the orientation once (§1). Units are already metres.
5. Build a `KindPrefabs` ScriptableObject: an array indexed by `Kind` (the same order as `protocol.js`).

### 5.4 Presenter + cameras

The presenter is a port of `render/entities.js`. It turns snapshot tuples
`[id, kindId, x, y, z, yaw, variant, state]` into pooled prefabs, hides ids that disappear, and
recycles them after 1 s (they often come back at the edge of the snapshot radius).

```csharp
// SnapshotPresenter.cs — pools prefabs by entity id. Used by the driver (every frame, no interpolation)
// and the cook (interpolated snapshots, see below). Snapshot.ents is a List<double[]> of
// [id, kindId, x, y, z, yaw, variant, state] tuples, exactly as in protocol.js.
using System;
using System.Collections.Generic;
using UnityEngine;
using CookRun.Sim;

public class EntityView : MonoBehaviour
{
    public virtual void SetVariant(int variant) { }               // paint colour, ped outfit…
    public virtual void SetState(int state, float dt) { }         // ped: 0 walk 1 panic 2 airborne 3 dazed 4 getting up
}

public sealed class SnapshotPresenter : MonoBehaviour
{
    [SerializeField] KindPrefabs prefabs;                          // prefab per Kind (index = kindId)
    [SerializeField] RvView rv;
    [SerializeField] Transform root;
    const float RecycleAfter = 1f;

    sealed class Slot { public EntityView View; public int Kind; public float HiddenAt = -1f; }
    readonly Dictionary<int, Slot> _byId = new Dictionary<int, Slot>();
    readonly Dictionary<int, Stack<EntityView>> _pool = new Dictionary<int, Stack<EntityView>>();
    readonly HashSet<int> _seen = new HashSet<int>();
    readonly List<int> _expired = new List<int>();

    public event Action<SimEvent> OnSimEvent;                      // audio, fx, HUD toasts, cameras

    public void Present(Snapshot s, bool playEvents = true)
    {
        rv.Apply(s.rv, s.feel, s.lab);
        _seen.Clear();
        foreach (var e in s.ents)
        {
            int id = (int)e[0], kind = (int)e[1];
            _seen.Add(id);
            if (!_byId.TryGetValue(id, out var slot) || slot.Kind != kind)
            {
                if (slot != null) Release(slot);
                slot = new Slot { View = Rent(kind), Kind = kind };
                _byId[id] = slot;
            }
            slot.HiddenAt = -1f;
            var v = slot.View;
            if (!v.gameObject.activeSelf) v.gameObject.SetActive(true);
            v.transform.SetPositionAndRotation(SimSpace.Pos(e[2], e[3], e[4]), SimSpace.Yaw(e[5]));
            v.SetVariant((int)e[6]);
            v.SetState((int)e[7], Time.deltaTime);
        }

        float now = Time.time;
        _expired.Clear();
        foreach (var kv in _byId)
        {
            if (_seen.Contains(kv.Key)) continue;
            var slot = kv.Value;
            if (slot.HiddenAt < 0f) { slot.HiddenAt = now; slot.View.gameObject.SetActive(false); }
            else if (now - slot.HiddenAt > RecycleAfter) _expired.Add(kv.Key);
        }
        foreach (int id in _expired) { Release(_byId[id]); _byId.Remove(id); }

        if (playEvents) foreach (var ev in s.events) OnSimEvent?.Invoke(ev);   // once per snapshot, never per frame
    }

    EntityView Rent(int kind)
    {
        if (_pool.TryGetValue(kind, out var stack) && stack.Count > 0) return stack.Pop();
        return Instantiate(prefabs.For(kind), root);
    }

    void Release(Slot slot)
    {
        slot.View.gameObject.SetActive(false);
        if (!_pool.TryGetValue(slot.Kind, out var stack)) _pool[slot.Kind] = stack = new Stack<EntityView>();
        stack.Push(slot.View);
    }
}
```

**Cook-side interpolation** (the JS uses a ~100 ms buffer). Keep the last few snapshots with their
arrival time. Each frame, render at `now − 0.1 s`: find the two snapshots around that time and lerp
positions by id. Lerp yaw naively, since the sim keeps yaw continuous and never wraps it. Call
`Present(interpolated, playEvents: false)`, and fire events once when each snapshot **arrives**.

**Cameras (Cinemachine 3):**
- **Chase** (driver): `CinemachineCamera` + `CinemachineFollow` (follow offset ≈ (0, 6, −13), position
  damping ~0.3–0.6) + `CinemachineRotationComposer` aimed at a look-ahead target ~30 m down the road.
  A small script widens the FOV with `snap.rv.speed` and leans into turns. A `CinemachineImpulseSource`
  fires on `crash` and `landed` events.
- **Cook**: the 3D van lab's **dollhouse** and **close-up** cameras (§5.7). Only the 2D fallback uses
  the old **rear** camera: a `CinemachineCamera` parented to the RV at the rear window, rotated 180°,
  with a window-frame overlay in UI Toolkit.
- **Cinematic jump**: a `CinemachineSplineDolly` on a spline beside the canyon gap (z 6,280–6,360).
  Raise its priority on `EV.JUMP` and drop it on `EV.LANDED` or `EV.FELL`. The `CinemachineBrain` blends
  between cameras.

**Road and scenery:** port `roadBuilder.js` and `chunks.js`. Build a `Mesh` per 50 m chunk from `Track`
(write vertices with `SimSpace.Pos`, then **reverse the triangle order**, §1). Spawn scenery per chunk
with `new Rng(Rng.HashSeed((int)seed, chunkIndex))`, the exact JS call order, so the browser and Unity
players see the same world. Use static batching or GPU instancing for repeated scenery.

### 5.5 HUD (UI Toolkit)

`Hud.uxml` + `hud.uss` + `HudPresenter : MonoBehaviour` reading the same snapshot fields as `hud.js`:

| HUD element | Snapshot field |
|---|---|
| Heat stars, "seen" eye, bust meter | `heat.stars`, `heat.seen`, `bust` |
| Speed, nitro bar | `rv.speed`, `rv.nitro` |
| RV hp, crew hp | `rv.hp`, `crew.driver`, `crew.cook` |
| Bags / quality, gadget counts | `inv.units`, `inv.quality`, `inv.gadgets` |
| Next stop, loading bar, "blocked" | `nearStop`, `stop.progress`, `stop.blocked` |
| Bridge distance + speed needed | `bridge.dist`, `bridge.speedNeeded` |
| Progress along the route | `dist / routeLength`, `biome` |
| Toasts | `events` (`msg`, `stars`, `copsGaveUp`, `stopDone`, …) and cook callouts |
| End screen | `EndResult` (won, reason, units, quality, payout, points, chaos, knocked, timeSec, stars) |

Only touch a `VisualElement` when its value changes: cache the last value and compare, like `CookUI.js`'s
`_set(...)`. Set `.text` and `style.width` rather than rebuilding elements.

### 5.6 Cook lab logic + minigames

`CookLab` and the minigames are logic only. Port them to the Cook assembly (no `UnityEngine`) and keep
their input in **normalised focus coordinates** (`nx, ny ∈ 0..1`, y down, 4:3 area), just like the JS.
In the shipped design the minigames are played on 3D props in the van (§5.7): each station presenter
maps its raycast hits onto these focus coordinates. The `Painter2D` canvas further down is only
needed for the 2D fallback panel (`?lab2d=1` on the web) or as a debug view.

```csharp
// Minigame.cs — port of public/js/cook/minigames/Minigame.js (logic only; drawing lives in a view).
using System;

namespace CookRun.Cook
{
    public enum Tone { Info, Good, Bad }
    public struct Feel { public double LatAcc, Bump, BumpHit, Speed; }    // smoothed by CookLab from snap.feel

    public interface IMinigameContext
    {
        LabHazards Hazards { get; }                 // lab.json › hazards
        double Rand();                              // seeded Rng, never System.Random / UnityEngine.Random
        void Emit(string type, object data = null); // 'stepDone', 'stepFailed', 'bump'… (audio/fx hooks)
        void StartFire(double amount);
        void Toast(string text, Tone tone);
    }

    public abstract class Minigame
    {
        public const double Aspect = 4.0 / 3.0, BenchY = 0.8;
        protected struct PointerState { public double X, Y; public bool Down, Inside; }

        protected readonly StepData P;              // the recipe step from lab.json
        protected readonly IMinigameContext Ctx;
        protected PointerState pointer;
        protected double score = 1;

        public string Type => P.type;
        public string Label => P.label;
        public double T { get; private set; }
        public double Progress { get; protected set; }
        public bool Done { get; private set; }
        public bool Failed { get; private set; }
        public string FailReason { get; private set; }
        public double Score => Math.Clamp(score, 0, 1);
        public virtual string Instructions => Label;
        public virtual double FumesPerSec => P.fumesPerSec ?? 0;
        public virtual bool Overheating => false;
        protected double BumpThreshold => Ctx.Hazards.bumpSpillThreshold ?? 0.55;

        protected Minigame(StepData p, IMinigameContext ctx) { P = p; Ctx = ctx; pointer.X = pointer.Y = 0.5; }

        public virtual void PointerDown(double nx, double ny) { pointer.X = nx; pointer.Y = ny; pointer.Down = true; pointer.Inside = true; }
        public virtual void PointerMove(double nx, double ny)
        {
            pointer.X = nx; pointer.Y = ny;
            pointer.Inside = nx >= -0.05 && nx <= 1.05 && ny >= -0.05 && ny <= 1.05;
        }
        public virtual void PointerUp(double nx, double ny) { pointer.X = nx; pointer.Y = ny; pointer.Down = false; }
        public virtual bool Key(string code) => false;      // "Equal" / "Minus" for the burner, as in the JS

        public virtual void Update(double dt, in Feel feel) { T += dt; }

        protected void Finish() { if (!Done && !Failed) { Done = true; Progress = 1; Ctx.Emit("stepDone", Score); } }
        protected void Fail(string reason) { if (!Done && !Failed) { Failed = true; FailReason = reason; Ctx.Emit("stepFailed", reason); } }
        protected void Toast(string text, Tone tone = Tone.Info) => Ctx.Toast(text, tone);

        protected static double WrapAngle(double a)
        {
            while (a > Math.PI) a -= Math.PI * 2;
            while (a < -Math.PI) a += Math.PI * 2;
            return a;
        }
    }

    // Example: GrindGame — full logic port of public/js/cook/minigames/grind.js.
    public sealed class GrindGame : Minigame
    {
        const double CX = 0.5, CY = 0.58, Squash = 0.42;
        readonly int _turns;
        double? _lastA; double _omega, _spinVel, _bumpCd;
        public double TurnsDone { get; private set; }
        public double Powder { get; private set; } = 1;
        public double Spin { get; private set; }         // the view rotates the contents by this
        public double ShakeT { get; private set; }       // the view shakes the mortar while > 0

        public GrindGame(StepData p, IMinigameContext ctx) : base(p, ctx) { _turns = Math.Max(1, p.turns ?? 6); }

        public override string Instructions =>
            Done ? "Ground fine" : TurnsDone == 0 ? "Drag in circles around the mortar" : "Keep circling";

        double Angle(double nx, double ny) => Math.Atan2((ny - CY) / Squash, (nx - CX) * Aspect);

        public override void PointerDown(double nx, double ny) { base.PointerDown(nx, ny); _lastA = Angle(nx, ny); }
        public override void PointerUp(double nx, double ny) { base.PointerUp(nx, ny); _lastA = null; }

        public override void PointerMove(double nx, double ny)
        {
            base.PointerMove(nx, ny);
            if (!pointer.Down || Done || Failed) { _lastA = null; return; }
            double dx = (nx - CX) * Aspect, dy = (ny - CY) / Squash;
            double r = Math.Sqrt(dx * dx + dy * dy), a = Angle(nx, ny);
            if (r < 0.035 || r > 0.75) { _lastA = a; return; }
            if (_lastA.HasValue)
            {
                double da = WrapAngle(a - _lastA.Value);
                if (Math.Abs(da) > 1.4) da = 0;                              // ignore jumps across the centre
                _omega = _omega * 0.8 + da * 0.2;
                if (Math.Sign(da) == Math.Sign(_omega) || Math.Abs(_omega) < 1e-4)   // cheap anti-wiggle
                {
                    TurnsDone = Math.Min(_turns, TurnsDone + Math.Abs(da) / (Math.PI * 2));
                    _spinVel += da * 6;
                }
            }
            _lastA = a;
        }

        public override void Update(double dt, in Feel feel)
        {
            base.Update(dt, feel);
            Spin += _spinVel * dt; _spinVel *= Math.Exp(-dt * 3.5);
            _bumpCd -= dt; ShakeT = Math.Max(0, ShakeT - dt);
            if (Done || Failed) return;
            double thr = BumpThreshold;
            if (feel.BumpHit > thr && _bumpCd <= 0)
            {
                _bumpCd = 0.5;
                Powder = Math.Max(0, Powder - (0.06 + (feel.BumpHit - thr) * 0.35));
                ShakeT = 0.35;
                Ctx.Emit("powderSpill");                                    // the view spawns the powder particles
                Toast("Bump! Some powder flew out", Tone.Bad);
                if (Powder < 0.12) { Fail("The mortar got knocked over"); return; }
            }
            Progress = TurnsDone / _turns;
            score = Math.Clamp(Powder, 0.12, 1);
            if (TurnsDone >= _turns - 1e-6) Finish();
        }
    }
}
```

**Drawing the minigames.** The JS draws each minigame with Canvas2D in a y-down coordinate space. UI
Toolkit's **`Painter2D`** vector API is also y-down and has nearly the same calls, so `draw()` ports
almost line for line:

| Canvas2D (`cook/draw.js`) | `Painter2D` (`MeshGenerationContext.painter2D`) |
|---|---|
| `beginPath / moveTo / lineTo / closePath` | `BeginPath / MoveTo / LineTo / ClosePath` |
| `arc(x, y, r, a0, a1)` | `Arc(center, r, Angle.Radians(a0), Angle.Radians(a1))` |
| `bezierCurveTo` | `BezierCurveTo(p1, p2, p3)` |
| `fill() / stroke()`, `fillStyle`, `strokeStyle`, `lineWidth`, `lineCap` | `Fill() / Stroke()`, `fillColor`, `strokeColor`, `lineWidth`, `lineCap` |
| `ellipse(...)` | helper: 4 Béziers (k = 0.5523) |
| `globalAlpha` | multiply the colour alpha |
| `fillText` | `Label` elements positioned over the canvas |

```csharp
// MinigameCanvas.cs (Game assembly) — a VisualElement that draws the current minigame and forwards pointers.
using UnityEngine;
using UnityEngine.UIElements;
using CookRun.Cook;

public sealed class MinigameCanvas : VisualElement
{
    public CookLab Lab;
    public IMinigamePainter Painter;                // one painter per step type (GrindPainter, MeasurePainter…)

    public MinigameCanvas()
    {
        generateVisualContent += ctx => { if (Lab?.Current != null) Painter?.Draw(ctx.painter2D, Lab.Current, contentRect.size); };
        RegisterCallback<PointerDownEvent>(e => { this.CapturePointer(e.pointerId); var n = Norm(e.localPosition); Lab?.PointerDown(n.x, n.y); });
        RegisterCallback<PointerMoveEvent>(e => { var n = Norm(e.localPosition); Lab?.PointerMove(n.x, n.y); });
        RegisterCallback<PointerUpEvent>(e => { this.ReleasePointer(e.pointerId); var n = Norm(e.localPosition); Lab?.PointerUp(n.x, n.y); });
    }

    Vector2 Norm(Vector3 p) => new Vector2(p.x / Mathf.Max(1, contentRect.width), p.y / Mathf.Max(1, contentRect.height));
    public void Tick() => MarkDirtyRepaint();       // call every frame from CookController.Update
}

public interface IMinigamePainter { void Draw(Painter2D p, Minigame game, Vector2 size); }
```
Give the canvas a fixed 4:3 aspect in USS. Lay out the recipe book, the vent/curtains/extinguisher
toggles, the fumes and fire bars, and the callout buttons as UXML around it (see
`docs/cook-*.png` for the layouts). A compact docked panel (~520×400) is the same UXML with a compact
USS class.

### 5.7 The 3D van lab

The cook doesn't play a flat panel any more. Doc walks around a cut-away lab inside the moving RV and
cooks at physical stations (`GAME_DESIGN.md` §6, `VAN_CONTRACT.md`). The port keeps the web build's
split: the rules stay in plain C#, and Unity only presents them.

| Layer | Web | Unity |
|---|---|---|
| Layout data | `data/van.json` | `VanData` POCO (Cook assembly), loaded by `GameDataAsset` (§3) |
| Step logic, hazards, presence | `cook/CookLab.js`, `cook/stations.js`, `cook/minigames/*` | `CookLab`, `StepStations`, `Minigame` subclasses (Cook assembly, no engine) |
| Doc's movement | `van/DocController.js` (pure logic) | `DocMotor` (Cook assembly) + `DocView : MonoBehaviour` |
| Interior | `van/interior.js` | `VanInterior.prefab`, a child of the RV's `Body` |
| Cameras | `van/vanCamera.js` | Cinemachine `DollhouseCam` + `CloseUpCam`, priority blend |
| Stations | `van/presenters/**`, `van/hazards3d.js` | `StationView` + `StepPresenter` MonoBehaviours on station prefabs, `LabHazardsView` |
| HUD | `van/VanHud.js`, `css/van.css` | UI Toolkit `VanHud.uxml` / `van.uss` |
| Orchestrator | `van/VanLab3D.js` | `VanLab : MonoBehaviour` on the interior root |

#### Van space and the interior prefab

`van.json` is in **RV-local metres with the sim's handedness**: origin = RV ground centre, +Z = front,
+Y up, **+X = the driver's left** (the rust-red door is on −X). Flip X once, exactly like `SimSpace` (§1),
and after that Unity's +X is the driver's right (the door side), as everywhere else in the Unity world.

```csharp
// VanSpace.cs (Game assembly): van.json / anchor space ↔ Unity local space. Same X flip as SimSpace.
using UnityEngine;
using CookRun.Cook;

public static class VanSpace
{
    public static Vector3 Local(double x, double y, double z) => new Vector3((float)-x, (float)y, (float)z);
    public static Vector3 Local(VanPoint p) => Local(p.x, p.y, p.z);
    public static (double x, double y, double z) ToVan(Vector3 p) => (-p.x, p.y, p.z);
}
```

```csharp
// VanData.cs (Cook assembly): mirrors van.json. Excerpt; Newtonsoft fills it (§3).
namespace CookRun.Cook
{
    public sealed class VanData
    {
        public VanBox rv; public VanRect[] walkable; public double counterHeight;
        public VanStation[] stations; public VanCab cab; public DocParams doc; public SwayParams sway; public VanCameraData camera;
        public VanStation Station(string id) => System.Array.Find(stations, s => s.id == id);
    }
    public sealed class VanBox { public double length, width, floorY, ceilingY, wallInnerX, rearInnerZ, cabPartitionZ; public double? cutHeight, counterDepth; }
    public sealed class VanRect { public string id; public double minX, maxX, minZ, maxZ; }   // allowed positions of Doc's CENTRE
    public struct VanPoint { public double x, y, z; }
    public sealed class VanStation { public string id, name, kind, faces; public double x, z; public int side; public VanPoint stand; public string[] steps; }
    public sealed class VanCab { public VanPoint driverSeat, passengerSeat, steeringWheel; }
    public sealed class DocParams { public double radius, walkSpeed, accel, interactRadius, scale; }
    public sealed class SwayParams { public double latAccStart, pushPerMps2, bumpHop, stumbleBump, stumbleSeconds, gripWhileWorking; }
    public sealed class VanCameraData { public CamPoseData dollhouse; public double[] zoomLevels; }
    public sealed class CamPoseData { public VanPoint pos, target; public double fov; }
}
```

The interior is a **prefab parented to the RV's body**, the transform `RvView` poses with pitch, roll
and suspension sway (the three.js "tilt group"). Everything inside works in local space, and the
world motion comes for free:

```
RV                      RvView: position + yaw from the snapshot
└─ Body                 pitch, roll, sway (the three.js tilt group)
   ├─ Model             rv.glb
   └─ VanInterior       VanLab + kinematic Rigidbody; inactive for the online driver
      ├─ Shell          floor, walls cut low on the camera side, partition, cupboards: one merged mesh
      ├─ Cab            seats, dash, SteeringWheel (rotates with rv.steer), Rook (driver.glb, seated)
      ├─ Stations/      recipe, pantry, grind, measure, curtains, stove, vent, cool, break, hammer, extinguisher, stash
      │                 (StationView prefabs, each with an Anchor child)
      ├─ Doc            cook.glb (scale 0.92) + DocView + Animator
      ├─ Hazards        LabHazardsView: fire, haze, fan + chimney smoke, curtains, extinguisher, hull holes
      ├─ Highlight      floor ring + bouncing arrow (next station)
      └─ Lights         strip light + warm point light (+ a flickering fire light)
```

Build the prefab with an **editor script that reads `van.json`** (station positions through
`VanSpace.Local`, bench tops at `floorY + counterHeight`), so the JSON stays the single source of truth
and a re-tune is one menu click. Each station's `Anchor` sits at the front-centre edge of its work
surface, rotated so local +Z points from the counter into the aisle (toward Doc).

**Anchor space has the same flip.** In the JS anchor frame +X is Doc's right as he faces the counter.
In Unity's left-handed frame, with +Z pointing at Doc, Doc's right is −X. So every anchor-space number
from the JS (prop layouts, the usable area x ∈ [−0.45, 0.45] / z ∈ [−0.6, 0], the hull patch plane
z = −0.6, close-up camera poses) goes through `VanSpace.Local` too, and raycast hits go back through
`VanSpace.ToVan` before they reach logic written against the JS frame.

#### Doc: a rectangle walker in van space, not a CharacterController

A `CharacterController` or `NavMeshAgent` moves in **world space** and collides with world colliders.
Inside an RV doing 30 m/s that rolls and pitches, that means jitter, being left behind, or falling
through the floor. Doc doesn't need any of it: `van.json › walkable` is a handful of rectangles of
allowed **centre** positions (already inset by his radius from the counters and walls). So port
`DocController.js` as a pure C# `DocMotor` that works in van-local coordinates, and let a small
`DocView` copy the result onto the model's `localPosition`. (The JS header suggests a
`CharacterController` with the walkable rectangles as `BoxCollider`s; that only behaves if the collision
runs in a space that doesn't move, i.e. the static proxy described under *Click-to-move* below.)

```csharp
// DocMotor.cs (Cook assembly, no UnityEngine). Sketch of public/js/van/DocController.js (the JS is the
// reference for the exact curves: stumble stagger, path following, facing). VAN-LOCAL space, van.json
// handedness (+X = driver's left, +Z = front).
using System;

namespace CookRun.Cook
{
    public sealed class DocMotor
    {
        public double X, Z, Vx, Vz;                  // Doc's centre on the floor (m) and walking velocity (m/s)
        public double StumbleT;                      // > 0: stumbling, can't walk or work
        public bool Working, Carrying;               // working a station / holding the extinguisher
        public double Lean;                          // visual lean (m) while working; DocView tilts the model
        public event Action Hopped, Stumbled, DroppedExtinguisher;   // DocView animates; VanLab drops the prop

        readonly VanData _v;
        double _lastBump;

        public DocMotor(VanData v) { _v = v; var s = v.Station("recipe").stand; X = s.x; Z = s.z; }

        /// moveX/moveZ: wished direction in van space (−1..1): Van/Move turned through the camera's floor basis
        /// (W = up the screen, as in DocController.setCameraBasis), or the next click-to-move waypoint.
        public void Step(double dt, double moveX, double moveZ, in Feel feel, VanPoint workStand = default)
        {
            var d = _v.doc; var s = _v.sway;

            // 1) bumps, on the rising edge (same test as CookLab): hop, or stumble and drop the extinguisher.
            //    A working Doc holds the counter: a big bump is only a hop (his bench takes the spill instead).
            double b = feel.Bump;
            if (b > 0.2 && b - _lastBump > 0.12)
            {
                if (b >= s.stumbleBump && !Working)
                {
                    StumbleT = s.stumbleSeconds;                       // 0.7 s: no walking, no using
                    Stumbled?.Invoke();
                    if (Carrying) { Carrying = false; DroppedExtinguisher?.Invoke(); }
                }
                else if (b >= s.bumpHop) Hopped?.Invoke();
            }
            _lastBump = b;

            // 2) sway: cornering pushes him toward the OUTSIDE of the turn. feel.LatAcc > 0 = turning left
            //    (sim yaw increasing), so the drift points to −X (the driver's right). 2.5 m/s² dead zone;
            //    pushPerMps2 = sideways drift speed (m/s) per m/s² over it, ×1.5 while stumbling.
            double over = Math.Max(0, Math.Abs(feel.LatAcc) - s.latAccStart);
            double drift = -Math.Sign(feel.LatAcc) * over * s.pushPerMps2 * (StumbleT > 0 ? 1.5 : 1);

            if (Working)
            {
                // hold the counter: ease onto the stand point, no drift, just lean with the van (scaled by grip)
                double k = 1 - Math.Exp(-dt * 12);
                X += (workStand.x - X) * k; Z += (workStand.z - Z) * k; Vx = Vz = 0;
                Lean += (Math.Clamp(drift * s.gripWhileWorking * 0.6, -0.14, 0.14) - Lean) * k;
                return;
            }
            Lean += (0 - Lean) * Math.Min(1, dt * 8);

            // 3) walk: approach the wished velocity (walkSpeed 2.6 m/s, accel 14 m/s²); none while stumbling
            double len = Math.Sqrt(moveX * moveX + moveZ * moveZ);
            if (len > 1) { moveX /= len; moveZ /= len; }
            bool canWalk = StumbleT <= 0;
            Vx = Approach(Vx, canWalk ? moveX * d.walkSpeed : 0, d.accel * dt);
            Vz = Approach(Vz, canWalk ? moveZ * d.walkSpeed : 0, d.accel * dt);
            X += (Vx + drift) * dt; Z += Vz * dt;
            if (StumbleT > 0) StumbleT -= dt;

            // 4) stay on the floor: snap to the nearest walkable rectangle and kill the velocity into the wall
            ClampToWalkable();
        }

        // _v.walkable plus, like the JS, a thin connector rectangle to any stand point that lies outside them
        void ClampToWalkable()
        {
            double bx = X, bz = Z, best = double.MaxValue;
            foreach (var r in _v.walkable)
            {
                double cx = Math.Clamp(X, r.minX, r.maxX), cz = Math.Clamp(Z, r.minZ, r.maxZ);
                double d2 = (cx - X) * (cx - X) + (cz - Z) * (cz - Z);
                if (d2 < best) { best = d2; bx = cx; bz = cz; if (d2 == 0) break; }   // inside one: done
            }
            if (bx != X) Vx = 0;
            if (bz != Z) Vz = 0;
            X = bx; Z = bz;
        }

        static double Approach(double v, double target, double step) =>
            v < target ? Math.Min(v + step, target) : Math.Max(v - step, target);
    }
}
```

```csharp
// DocView.cs (Game assembly): puts the Doc model where DocMotor says, in VanInterior's local space.
using UnityEngine;
using CookRun.Cook;

public sealed class DocView : MonoBehaviour
{
    [SerializeField] Animator anim;                  // Idle / Walk / Work / Carry / Stumble / Down
    public DocMotor Motor; public float FloorY;      // van.json › rv.floorY

    void LateUpdate()
    {
        transform.localPosition = VanSpace.Local(Motor.X, FloorY, Motor.Z);
        var v = VanSpace.Local(Motor.Vx, 0, Motor.Vz);
        if (v.sqrMagnitude > 0.04f)
            transform.localRotation = Quaternion.Slerp(transform.localRotation, Quaternion.LookRotation(v), 12f * Time.deltaTime);
        anim.SetFloat("Speed", v.magnitude);
        anim.SetBool("Working", Motor.Working);
        anim.SetBool("Stumbling", Motor.StumbleT > 0);
    }
}
```

**Click-to-move ("NavMesh-lite").** Raycast the click against a `LabFloor` layer (walk there) or a
`LabStation` layer (walk to that station's `stand` point, then use it). The walkable rectangles overlap
along the aisle, so a path is at most: step into the aisle, walk along it, step out to the target. Feed
the next waypoint to `DocMotor.Step` as the wished direction. If you later want an irregular interior
and a real NavMesh, bake it on a **static, invisible copy** of the interior at the world origin, let a
`NavMeshAgent` walk there, and copy its local position onto the visible Doc each frame.

#### Cameras: dollhouse + close-up, blended by priority

- **`DollhouseCam`**: a `CinemachineCamera` with Follow = `VanInterior`, a `CinemachineFollow` body
  (offset = `VanSpace.Local(camera.dollhouse.pos)`, binding mode **Lock To Target With World Up**, so it
  follows the van's yaw but not its pitch and roll: the road sways, the horizon doesn't) and a
  `CinemachineHardLookAt` aimed at an empty placed at `camera.dollhouse.target`. FOV from `fov`. The
  mouse wheel scales the follow offset by `zoomLevels[i]`. The web camera (`vanCamera.js`) keeps about
  30% of the van's pitch and roll, damped, for a little life; to match it, add a small script that
  rotates the look-at empty by 0.3 × the body's pitch/roll.
- **`CloseUpCam`**: a `CinemachineCamera` with **no position or rotation control**, so it simply stays
  where its transform is. Re-parent it to the station's close-up pose (two empties authored in each
  station prefab: the presenter's `camera()` pose) and raise its priority while Doc works there.
- The `CinemachineBrain`'s default blend (Ease In Out, about 0.5 s) does the camera easing from the web
  build for free.

```csharp
// VanCamera.cs (Game assembly): port of public/js/van/vanCamera.js (Cinemachine 3).
using Unity.Cinemachine;
using Unity.Cinemachine.TargetTracking;
using UnityEngine;
using CookRun.Cook;

public sealed class VanCamera : MonoBehaviour
{
    [SerializeField] CinemachineCamera dollhouse, closeUp;    // priorities: dollhouse 10, closeUp 0
    [SerializeField] CinemachineFollow follow;                // on the dollhouse camera
    Vector3 _offset; double[] _zoom; int _z = 1;

    public void Init(VanData v)
    {
        _offset = VanSpace.Local(v.camera.dollhouse.pos);
        _zoom = v.camera.zoomLevels;                          // [0.75, 1.0, 1.35]
        follow.TrackerSettings.BindingMode = BindingMode.LockToTargetWithWorldUp;
        dollhouse.Lens.FieldOfView = (float)v.camera.dollhouse.fov;
        ApplyZoom();
    }

    public void Zoom(int dir) { _z = Mathf.Clamp(_z + dir, 0, _zoom.Length - 1); ApplyZoom(); }
    void ApplyZoom() => follow.FollowOffset = _offset * (float)_zoom[_z];

    /// Doc starts working: jump the close-up camera to the station's pose; the Brain blends to it.
    public void Focus(Transform camPos, Transform camTarget, float fov)
    {
        closeUp.transform.SetParent(camPos, false);           // rides with the anchor, so with the van
        closeUp.transform.rotation = Quaternion.LookRotation(camTarget.position - camPos.position, camPos.up);
        closeUp.Lens.FieldOfView = fov;
        closeUp.Priority = 20;                                // PrioritySettings converts from int
    }

    public void Release() => closeUp.Priority = 0;            // blends back out to the dollhouse
}
```

For the online driver, and for solo while you're at the wheel, the chase camera has the highest
priority and `VanInterior` is inactive.

#### Station presenters: MonoBehaviours on the station prefabs

Each JS presenter (`createPresenter(stepType, { anchor, lab, game, step, recipe })`) becomes a
`StepPresenter` component on the station prefab that hosts that step type (`StepStations`): the mortar
on the grinding bench, the bottle and beaker on the measuring bench, the knob, pot, thermometer and
spoon on the stove (two presenters, `heat` and `stir`), the tray and spirit level on the ice bath, the
slab and bags on the bagging bench, the patch and nails on the hull patch. A presenter owns its props,
**reads** the C# minigame's public state every frame (`GrindGame.Spin`, `Powder`, `TurnsDone`…) and turns
raycast hits into minigame input. It never decides scores.

```csharp
// StepPresenter.cs (Game assembly): base for Grind/Measure/Heat/Stir/Cool/Break/HammerPresenter.
using UnityEngine;
using CookRun.Cook;

public abstract class StepPresenter : MonoBehaviour
{
    public abstract string StepType { get; }          // "grind", "measure", "heat", "stir", "cool", "break", "hammer"
    public Transform camPos, camTarget;               // = p.camera(): the close-up pose, authored in the prefab
    public float camFov = 40f;
    [TextArea] public string hint;                    // = p.hint, e.g. "Drag in circles over the pot"
    [SerializeField] protected Collider[] pick;       // = p.pick(): props + an invisible drag plane over the work area
    protected CookLab Lab;
    public Minigame Game { get; private set; }

    public virtual void Begin(CookLab lab, Minigame game) { Lab = lab; Game = game; gameObject.SetActive(true); }
    public virtual void End() { Game = null; gameObject.SetActive(false); }

    /// = p.update(dt, { feel, active }): move the props from Game's state (spin, fill level, needle, tilt…).
    public abstract void Tick(float dt, in Feel feel, bool active);

    // = p.pointerDown/Move/Up(hit). local = hit point in ANCHOR space (Unity), null when the ray missed.
    // Go through CookLab, not Game: CookLab drops input while Doc is away (presence).
    public virtual void PointerDown(Vector3? local) { if (local is Vector3 p) { var n = ToFocus(p); Lab.PointerDown(n.x, n.y); } }
    public virtual void PointerMove(Vector3? local) { if (local is Vector3 p) { var n = ToFocus(p); Lab.PointerMove(n.x, n.y); } }
    public virtual void PointerUp(Vector3? local) { var n = local is Vector3 p ? ToFocus(p) : new Vector2(0.5f, 0.5f); Lab.PointerUp(n.x, n.y); }
    public virtual bool Key(string code, bool down) => false;   // = p.key(): e.g. heat turns the knob on A/D, ←/→

    /// Default mapping, seen from above: the counter's usable area → the minigame's 4:3 focus rect
    /// (nx, ny ∈ 0..1, y down: the far edge by the wall is the top). Presenters override it to map their own
    /// prop (the knob's arc, the pot's disc, the wall patch) the way the JS presenter does.
    protected virtual Vector2 ToFocus(Vector3 local)
    {
        var (x, _, z) = VanSpace.ToVan(local);        // back to the JS anchor frame: +x = Doc's right
        return new Vector2((float)((x + 0.45) / 0.9), (float)((z + 0.6) / 0.6));
    }
}
```

```csharp
// StationView.cs (Game assembly): one per station prefab. Idle props, or the live presenter for lab.Current.
using System;
using UnityEngine;
using CookRun.Cook;

public sealed class StationView : MonoBehaviour
{
    public string stationId;                          // van.json › stations[].id (never renamed)
    public Transform anchor;                          // front-centre edge of the work surface; +Z toward Doc
    [SerializeField] GameObject idleProps;            // = buildIdleProps(stationId)
    [SerializeField] StepPresenter[] presenters;      // inactive children, one per step type hosted here
    public StepPresenter Live { get; private set; }

    public void Sync(CookLab lab, in Feel feel, bool docWorkingHere)
    {
        var g = lab.Current;
        string want = g != null && lab.StationForStep(g.Type) == stationId ? g.Type : null;
        if (Live != null && (Live.StepType != want || Live.Game != g)) { Live.End(); Live = null; }
        if (Live == null && want != null) { Live = Array.Find(presenters, p => p.StepType == want); Live?.Begin(lab, g); }
        idleProps.SetActive(Live == null);            // VanLab3D hides a station's idle props while a presenter lives
        Live?.Tick(Time.deltaTime, feel, docWorkingHere);
    }
}
```

```csharp
// LabPointer.cs (Game assembly): mouse / touch → Physics.Raycast → the live presenter.
using UnityEngine;
using UnityEngine.InputSystem;

public sealed class LabPointer : MonoBehaviour
{
    [SerializeField] Camera cam;                      // the Main Camera (with the CinemachineBrain)
    [SerializeField] LayerMask labProps;              // presenter colliders + drag planes
    public StationView Working;                       // set by VanLab while Doc works a station, else null

    void Update()
    {
        var p = Pointer.current;
        var live = Working ? Working.Live : null;
        if (p == null || live == null) return;
        Physics.SyncTransforms();                     // the van moved and the sim never steps physics (§7)
        Vector3? local = null;
        if (Physics.Raycast(cam.ScreenPointToRay(p.position.ReadValue()), out var hit, 4f, labProps))
            local = Working.anchor.InverseTransformPoint(hit.point);     // world → anchor space
        if (p.press.wasPressedThisFrame) live.PointerDown(local);
        else if (p.press.isPressed) live.PointerMove(local);
        if (p.press.wasReleasedThisFrame) live.PointerUp(local);
    }
}
```

Give every presenter an **invisible drag plane** over its work area (or the wall patch), so a drag that
leaves the pot or the knob still hits something, and size hit volumes for fingers on touch screens.

#### The CookLab presence API

`CookLab.js` gained station presence for the van; the 2D panel keeps the default `'any'`. Port it 1:1:

```csharp
// CookLab.cs (Cook assembly): the presence part. StepStations = public/js/cook/stations.js.
using System.Collections.Generic;

namespace CookRun.Cook
{
    public static class StepStations
    {
        public static readonly IReadOnlyDictionary<string, string> Map = new Dictionary<string, string>
        {
            ["grind"] = "grind", ["measure"] = "measure", ["heat"] = "stove", ["stir"] = "stove",
            ["cool"] = "cool", ["break"] = "break", ["hammer"] = "hammer",
        };
        public static string For(string stepType) => stepType != null && Map.TryGetValue(stepType, out var s) ? s : null;
    }

    public enum PresenceMode { Any, Station }      // Any = 2D panel, Station = Doc must be at the step's station

    public sealed partial class CookLab
    {
        public PresenceMode Presence { get; private set; } = PresenceMode.Any;
        public string PresenceStation { get; private set; }     // where Doc is working; null = nowhere

        public void SetPresenceMode(PresenceMode m) { bool was = AwayFromStation; Presence = m; if (!was && AwayFromStation) ReleaseInput(); }
        public void SetPresence(string stationId) { bool was = AwayFromStation; PresenceStation = stationId; if (!was && AwayFromStation) ReleaseInput(); }
        public string StationForStep(string type) => StepStations.For(type);

        /// The station to highlight: the current step's, or the NEXT step's during the 1.1 s result stamp.
        public string StepStation => Phase != LabPhase.Running || Recipe == null ? null
            : _pause > 0 ? StepStations.For(NextStepType) : StepStations.For(Current?.Type);

        public bool AwayFromStation => Presence == PresenceMode.Station && Phase == LabPhase.Running
                                       && Current != null && PresenceStation != StepStations.For(Current.Type);
        public bool InputEnabled => !CookDown && Phase == LabPhase.Running && _pause <= 0 && Current != null && !AwayFromStation;

        void ReleaseInput() { if (Current != null && Current.PointerIsDown) Current.PointerUp(0.5, 0.5); }

        void UpdateRunningStep(double dt)
        {
            var g = Current;
            bool paused = AwayFromStation && g.Type != "heat";    // the burner keeps burning while Doc is away
            if (!CookDown && !paused) g.Update(dt, Feel);
            // … done / failed / next step exactly as in the JS. Fumes and fire are updated elsewhere, always.
        }
    }
}
```

(`LabPhase` is the JS `LAB_STATES`: idle, requesting, running, done, failed. It's renamed so it doesn't
clash with the `LabState` network message.)

#### VanLab: the frame, and the solo seat switch

Call the lab and the van from **one** controller in a fixed order. Don't rely on Unity's Update order
between scripts:

```csharp
// CookController.Update (cook side, and solo while cooking): same order as main.js.
void Update()
{
    float dt = Time.deltaTime;
    Lab.Update(dt);                         // hazards + the current minigame (presence-gated)
    VanLab.Tick(dt, LastSnapshot);          // Doc → presence → stations/presenters → highlight → HUD
}

// VanLab.Tick (port of VanLab3D.update)
public void Tick(float dt, Snapshot snap)
{
    if (!_active) return;
    var feel = new Feel { LatAcc = snap?.feel.latAcc ?? 0, Bump = snap?.feel.bump ?? 0 };
    var stand = Doc.Working ? Data.Station(_workingAt).stand : default;
    Doc.Step(dt, _move.x, _move.y, feel, stand);             // _move: Van/Move as a van-space (x, z) direction
    Lab.SetPresence(Doc.Working ? _workingAt : null);        // away = input dropped, steps paused (not heat)
    foreach (var s in _stations) s.Sync(Lab, feel, Doc.Working && s.stationId == _workingAt);
    _highlight.Show(Lab.StepStation);                        // floor ring + bouncing arrow
    _hud.Prompt(NearestStation(Doc), Lab);                   // "E · Stove", "Not needed right now"
}
```

**Using a station** (`Van/Use`): `recipe` opens the recipe overlay (cards from `lab.json › recipes`,
greyed when the pantry can't pay; a pick calls `Lab.RequestRecipe(id)`); `pantry` shows the counts;
step stations set `Doc.Working`, `_workingAt` and `VanCamera.Focus(...)` when the current step belongs
there; `vent` and `curtains` call `Lab.ToggleVent()` / `Lab.ToggleCurtains()`; `extinguisher` sets
`Doc.Carrying`, and then each press near the fire calls `Lab.UseExtinguisher()` plus `Lab.Extinguish()`
while held (without it, `Use` by the fire beats it with a towel: `Lab.Extinguish()`). `Van/StepAway`
clears `Working` and calls `VanCamera.Release()`. While `Lab.CookDown`, Doc plays the lying-down state
and ignores input.

**Solo: Tab between the wheel and the lab.** Only one of the Driver and Van action maps is enabled at a
time, and `GameLoop` takes its `DriverInput` from the `AutopilotDriver` while you cook:

```csharp
// SessionController (solo): Tab = Van/SwitchSeat or Driver/SwitchSeat.
void ToggleSeat()
{
    _cooking = !_cooking;
    if (_cooking) { _driverMap.Disable(); _vanMap.Enable(); } else { _vanMap.Disable(); _driverMap.Enable(); }
    _vanLab.SetActive(_cooking);              // interior visible, dollhouse camera live, Doc takes input
    if (!_cooking) _lab.SetPresence(null);    // Doc waits: steps pause, but a lit burner keeps cooking
    _gameLoop.UseAutopilot = _cooking;        // FixedUpdate: input = autopilot.Update(Last) instead of the Driver map
}
```

**HUD.** `VanHud.uxml`: a prompt label pinned over the nearest station (world → panel with
`RuntimePanelUtils.CameraTransformWorldToPanel`), the step panel (step label, progress bar, the live
presenter's `hint`), the recipe overlay, and the fumes / fire / extinguisher readouts.

**Hazards.** `LabHazardsView` reads `CookLab` every frame: flames and a flickering point light on the
stove scaled by `Fire`, a haze whose density follows `Fumes`, the fan's spin and the chimney smoke from
`VentOpen`, the curtains' Animator from `CurtainsClosed`, the extinguisher's charges, hull holes from
`snap.rv.hp`, bags in the stash from `snap.inv.units`, and the pantry jars' fill from `snap.inv.mat`.

### 5.8 Networking

Pick option A or B (§4). The skeleton below is for **option A** (NGO). The cook side mirrors the JS
flow: `applySnapshot`, `update`, and `getLabState` at 6 Hz.

```csharp
// CoopLink.cs — one NetworkObject in the Game scene. Host = driver (runs GameSim), client = cook.
using Newtonsoft.Json;
using Unity.Collections;
using Unity.Netcode;
using UnityEngine;
using CookRun.Sim;

public sealed class CoopLink : NetworkBehaviour
{
    [SerializeField] GameLoop hostLoop;              // driver side
    [SerializeField] CookController cook;            // cook side (owns CookLab + VanLab + interpolator)
    [SerializeField] GameDataAsset data;

    public readonly NetworkVariable<uint> Seed = new NetworkVariable<uint>();
    public readonly NetworkVariable<byte> Phase = new NetworkVariable<byte>();   // 0 countdown 1 drive 2 won 3 lost

    float _snapAcc, _labAcc;
    float SnapInterval => 1f / data.Load().Rules.net.snapshotHz;   // 15 Hz
    float LabInterval => 1f / data.Load().Rules.net.labHz;         // 6 Hz

    public override void OnNetworkSpawn()
    {
        if (IsServer)
        {
            Seed.Value = GameSession.Seed;           // random non-zero uint chosen by the host
            hostLoop.Begin(Seed.Value, solo: false);
        }
        else if (Seed.Value != 0) StartCook(Seed.Value);
        else Seed.OnValueChanged += (_, s) => StartCook(s);
    }

    void StartCook(uint seed) => cook.Begin(seed, sendCommand: c => CookCommandRpc(JsonConvert.SerializeObject(c)));

    void Update()
    {
        if (!IsSpawned) return;
        if (IsServer && hostLoop.Sim != null)
        {
            if ((_snapAcc += Time.deltaTime) >= SnapInterval)
            {
                _snapAcc = 0f;
                SnapshotRpc(SnapshotPacket.From(hostLoop.Sim.NetSnapshot()));        // unreliable, latest wins
                var events = hostLoop.Sim.DrainNetEvents();                           // reliable side channel
                if (events.Count > 0) EventsRpc(JsonConvert.SerializeObject(events));
                Phase.Value = (byte)hostLoop.Sim.PhaseIndex;
            }
        }
        else if (!IsServer && cook.Lab != null)
        {
            if ((_labAcc += Time.deltaTime) >= LabInterval)
            {
                _labAcc = 0f;
                LabStateRpc(LabStatePacket.From(cook.Lab.GetLabState()));            // drains cookHurt → must be reliable
            }
        }
    }

    // ── driver → cook ────────────────────────────────────────────────────────
    [Rpc(SendTo.NotServer, Delivery = RpcDelivery.Unreliable)]
    void SnapshotRpc(SnapshotPacket p) => cook.OnSnapshot(p.ToSnapshot());

    [Rpc(SendTo.NotServer)]
    void EventsRpc(string json) => cook.OnEvents(JsonConvert.DeserializeObject<SimEvent[]>(json));

    [Rpc(SendTo.NotServer)]
    public void EndRpc(string resultJson) => cook.OnEnd(JsonConvert.DeserializeObject<EndResult>(resultJson));

    // ── cook → driver ────────────────────────────────────────────────────────
    [Rpc(SendTo.Server, RequireOwnership = false)]
    void LabStateRpc(LabStatePacket p) => hostLoop.Sim.SetLabState(p.ToLabState());

    [Rpc(SendTo.Server, RequireOwnership = false)]
    void CookCommandRpc(string json) => hostLoop.Sim.ApplyCookCommand(JsonConvert.DeserializeObject<CookCommand>(json));

    // ── either way ───────────────────────────────────────────────────────────
    [Rpc(SendTo.NotMe, RequireOwnership = false)]
    public void ChatRpc(FixedString128Bytes text) => Hud.Instance.Toast(text.ToString(), "info");
}

// Compact binary snapshot: quantise entity positions relative to the RV (±327 m at 1 cm).
public struct SnapshotPacket : INetworkSerializable
{
    public float SimTime, RvX, RvY, RvZ, RvYaw, RvPitch, RvRoll, RvSpeed, RvHp;
    // … heat, bust, inv, stop, bridge, feel, alert, lab echo: add the fields the cook needs
    public EntityPacket[] Ents;

    public void NetworkSerialize<T>(BufferSerializer<T> s) where T : IReaderWriter
    {
        s.SerializeValue(ref SimTime); s.SerializeValue(ref RvX); s.SerializeValue(ref RvY); s.SerializeValue(ref RvZ);
        s.SerializeValue(ref RvYaw); s.SerializeValue(ref RvPitch); s.SerializeValue(ref RvRoll);
        s.SerializeValue(ref RvSpeed); s.SerializeValue(ref RvHp);
        int n = Ents?.Length ?? 0;
        s.SerializeValue(ref n);
        if (s.IsReader) Ents = new EntityPacket[n];
        for (int i = 0; i < n; i++) s.SerializeValue(ref Ents[i]);
    }
    public static SnapshotPacket From(Snapshot snap) { /* fill fields; ents → EntityPacket (dx, dy, dz in cm) */ return default; }
    public Snapshot ToSnapshot() { /* inverse */ return null; }
}

public struct EntityPacket : INetworkSerializable
{
    public ushort Id; public byte Kind, Variant, State; public short Dx, Dy, Dz, Yaw;   // ≈ 13 bytes per entity
    public void NetworkSerialize<T>(BufferSerializer<T> s) where T : IReaderWriter
    {
        s.SerializeValue(ref Id); s.SerializeValue(ref Kind); s.SerializeValue(ref Variant); s.SerializeValue(ref State);
        s.SerializeValue(ref Dx); s.SerializeValue(ref Dy); s.SerializeValue(ref Dz); s.SerializeValue(ref Yaw);
    }
}
```
With 90 entities (`rules.json › net.maxEntitiesInSnapshot`) that's about 1.2 KB, compared with 3–12 KB
of JSON on the web. Keep it under the `UnityTransport` *Max Payload Size*. Write `LabStatePacket` the
same way. Commands and events are rare, so plain JSON strings are fine there.

**Solo mode** needs no networking. `LocalBus.cs` connects `GameLoop` and `CookController` in the same
process. Deliver messages on the next frame and copy them, like the JS `structuredClone`, so solo
exercises the same "arrives later, no shared references" path.

**Who hosts?** With NGO, the host is whoever created the session, and the sim must run on the
**driver**. So the player who drives creates the session. To allow a role swap after joining,
restart the session with the other player hosting. (The Node relay doesn't have this restriction.)

### 5.9 Polish
- **Audio:** an engine loop (pitch from speed), sirens (doppler via the 3D spatial blend), crossing
  bells, lab sounds (bubbling scaled by temperature, hiss, fire crackle), event one-shots. Route them
  through an `AudioMixer`, and duck the music on the jump.
- **VFX:** vent smoke, dust trail, nitro flames, hydrant geysers, smoke bomb cloud, oil sheen, cartoon
  dazed stars, rockfall dust. Use Shuriken for anything that must run on WebGL.
- **Post-processing:** a URP Volume with light colour grading per biome (warm in the canyon), subtle
  bloom on cop lights, and vignette when hp is low.
- **Performance:** Frame Debugger and Profiler. Aim for under 250 batches like the web budget (300 for the cook's view,
  with ≤ 120 for the van interior), and
  turn on the SRP Batcher. On desktop, Unity 6's GPU Resident Drawer (Forward+) can batch scenery
  automatically.
- **Builds:** Windows/macOS first, then WebGL (see the gotchas), then mobile (needs touch driving
  controls and the theme review in `GAME_DESIGN.md` §12).

---

## 6. Input System mapping

Create `CookRun.inputactions` with three maps: **Driver**, **Van** (Doc in the 3D lab) and **Lab2D** (only
for the optional 2D fallback panel). Online, each player enables their own map. In solo, only one of
Driver and Van is enabled at a time: **Tab** (`SwitchSeat`, in both maps) swaps them, and the
`AutopilotDriver` drives while the Van map is active (§5.7).

| Action (map) | Type | Web key (`KeyboardEvent.code`) | Input System bindings | Gamepad (suggested) |
|---|---|---|---|---|
| Throttle (Driver) | Value / Axis, *1D Axis* composite | `KeyW` `ArrowUp` (+1), `KeyS` `ArrowDown` (−1) | `<Keyboard>/w`, `<Keyboard>/upArrow` / `<Keyboard>/s`, `<Keyboard>/downArrow` | `<Gamepad>/rightTrigger` (+), `<Gamepad>/leftTrigger` (−) |
| Steer (Driver) | Value / Axis, *1D Axis* composite | `KeyD` `ArrowRight` (+1 = right), `KeyA` `ArrowLeft` (−1) | `<Keyboard>/d`, `<Keyboard>/rightArrow` / `<Keyboard>/a`, `<Keyboard>/leftArrow` | `<Gamepad>/leftStick/x` |
| Handbrake (Driver) | Button (held) | `Space` | `<Keyboard>/space` | `<Gamepad>/buttonSouth` |
| Horn (Driver) | Button (held) | `KeyH` | `<Keyboard>/h` | `<Gamepad>/leftStickPress` |
| Smoke (Driver) | Button (**edge**) | `KeyQ` | `<Keyboard>/q` | `<Gamepad>/leftShoulder` |
| Oil (Driver) | Button (**edge**) | `KeyE` | `<Keyboard>/e` | `<Gamepad>/rightShoulder` |
| Nitro (Driver) | Button (**edge**) | `ShiftLeft` | `<Keyboard>/leftShift` | `<Gamepad>/buttonWest` |
| Reset (Driver) | Button (**edge**) | `KeyR` | `<Keyboard>/r` | `<Gamepad>/select` |
| Mute (Driver, Van) | Button | `KeyM` | `<Keyboard>/m` | – |
| SwitchSeat (Driver, Van; solo only) | Button | `Tab` | `<Keyboard>/tab` | `<Gamepad>/buttonNorth` |
| Pause (Driver, Van) | Button | `Escape`, `KeyP` | `<Keyboard>/escape`, `<Keyboard>/p` | `<Gamepad>/start` |
| Move (Van) | Value / Vector2, *2D Vector* composite | `KeyW` `KeyA` `KeyS` `KeyD`, arrows | `<Keyboard>/w` `/a` `/s` `/d`, `<Keyboard>/upArrow` … | `<Gamepad>/leftStick` |
| Use (Van) | Button | `KeyE`, `Space` | `<Keyboard>/e`, `<Keyboard>/space` | `<Gamepad>/buttonSouth` |
| StepAway (Van) | Button | `KeyQ`, `Escape` | `<Keyboard>/q`, `<Keyboard>/escape` | `<Gamepad>/buttonEast` |
| Point (Van) | Value / Vector2 | mouse / touch | `<Pointer>/position` | – |
| Press (Van) | Button | mouse button / touch (click-to-move, click a station, drag to play) | `<Pointer>/press` | – |
| Zoom (Van) | Value / Axis | mouse wheel | `<Mouse>/scroll/y` | `<Gamepad>/dpad/y` |
| Point / Press (Lab2D) | Vector2 / Button | mouse / touch | `<Pointer>/position`, `<Pointer>/press` | – |
| Vent / Curtains / Extinguisher (Lab2D) | Button | `KeyV` / `KeyC` / `KeyX` | `<Keyboard>/v`, `<Keyboard>/c`, `<Keyboard>/x` | – |
| Burner + / − (Lab2D) | Button | `Equal` / `Minus` | `<Keyboard>/equals`, `<Keyboard>/numpadPlus` / `<Keyboard>/minus`, `<Keyboard>/numpadMinus` | – |

"Edge" actions are read with `WasPressedThisFrame()` in `Update` and **latched** until the next
`FixedUpdate` consumes them (see `GameLoop`). The contract says gadget booleans are true for exactly
one sim step.

Van map notes:
- While Doc works a station he doesn't walk, so the presenter reads **Move.x** as its key input (the
  gas knob turns on A/D or ←/→, like `presenter.key()` in the JS). Forward `Use` held / released to the
  presenter too.
- `Escape` is bound to both `StepAway` and `Pause`. Resolve it in code: step away if Doc is working a
  station, otherwise open the pause menu (the web build's `van.onKey` returns "consumed" the same way).
- The Van *Point*/*Press* actions feed `LabPointer` (raycasts into the props) and click-to-move. UI
  Toolkit overlays (the recipe board) get pointer events themselves, so ignore Press while the pointer
  is over a panel (`panel.Pick(...) != null`).

---

## 7. Gotchas

**Determinism & maths**
- **Cross-platform float determinism isn't needed.** The host is authoritative: the cook only
  *displays* the host's snapshots. What must match is the **world generation** (the road and
  scenery from the seed), and the integer RNG is exact for that. Tiny `Math.Sin` differences
  (≤ 1e-15 m) are invisible.
- Use **`double`** in the sim (JS numbers are doubles) and `System.Math`, not `Mathf` (floats). Convert
  to `float` only in `SimSpace`. A float is still fine for rendering at 7 km: about 0.5 mm resolution,
  so no floating origin needed.
- **Rounding:** JS `Math.round(x)` rounds .5 *up*, but C# `Math.Round(x)` rounds to *even*. Port
  `r2(v) = Math.round(v*100)/100` as `Math.Floor(v * 100 + 0.5) / 100`.
- **Integer division:** `(n - 1) / 2` is 0.5 in JS and **0** in C# for an int `n`. Write `/ 2.0` (see
  `LaneU`).
- **Floor vs cast:** JS `Math.floor(-3.5)` is −4, but `(int)-3.5` is −3. Use `Math.Floor` wherever the
  JS does.
- **`||` vs `??`:** JS `params.turns || 6` also replaces 0. Port each one deliberately; most of our code
  uses `??`, so nullable fields + `??` match.
- `>>>` means work in `uint`; `Math.imul` means multiply in `unchecked` `uint`.
- Never use `UnityEngine.Random`, `System.Random` or `Time.time` inside the sim. Use the seeded `Rng`
  and the sim clock.

**Simulation & physics**
- **Keep the arcade vehicle model.** Port the JS RV handling (accel 7.5, brake 16, grip, steer rate,
  off-road and sand slow, nitro) as plain maths. Don't swap it for `WheelCollider`s or `Rigidbody`
  physics at first: they behave differently, aren't portable, and would break the "sim = pure C#"
  rule. Collisions in our sim are simple circle and box tests, so set
  `Physics.simulationMode = SimulationMode.Script` and Unity physics never runs.
- `FixedUpdate` runs 0–n times per frame. Read input in `Update` and latch the edge presses (see
  above). Pass the constant `1.0/60` to `Step`, not `Time.fixedDeltaTime` (a float).
- On displays above 60 Hz, a 60 Hz sim shown raw will stutter. The presenter can interpolate the
  driver's own view between the previous and current sim states with
  `alpha = (Time.time − Time.fixedTime) / Time.fixedDeltaTime`.
- Avoid allocating every frame (snapshots, lists, LINQ). Reuse buffers. GC spikes hurt, especially on
  WebGL.
- With *Enter Play Mode Options* (no domain reload), static fields survive between plays. Keep sim
  state in instances, not statics.

**3D van lab**
- **Don't tick *Batching Static* on the interior.** Static batching bakes meshes in world space, and the
  interior moves with the RV. Merge the shell and furniture into a few meshes offline (an editor script
  with `Mesh.CombineMeshes`) and let the SRP Batcher handle the rest. Budget: interior ≤ 120 batches,
  the cook's whole view ≤ 300.
- **Sync colliders before raycasting.** With `Physics.simulationMode = SimulationMode.Script` the
  physics scene never steps, so moved colliders aren't synced on their own: call
  `Physics.SyncTransforms()` once per frame before `LabPointer` raycasts, or every hit lands where the
  van *was*. Put a kinematic `Rigidbody` on `VanInterior` so all its colliders move as one compound body.
- **No CharacterController or NavMeshAgent on the moving van** (§5.7): they work in world space and
  jitter or fall through a floor doing 30 m/s. Keep Doc in van-local space (`DocMotor`).
- **Don't rigidly parent the dollhouse camera to the RV body.** It would roll and pitch with the van
  (motion sickness, a tilting horizon). Use `CinemachineFollow` with *Lock To Target With World Up*.
  Close-ups are fine as children of the anchor: they're short and framed on the bench.
- **Anchor space is mirrored too** (§5.7): JS anchor +X is Doc's right; in Unity it's −X. Port prop
  layouts and camera poses through `VanSpace`, and convert hits back with `VanSpace.ToVan`.
- **Update order:** `CookLab.Update` before `VanLab.Tick`, from one controller (script execution order
  between MonoBehaviours is otherwise undefined).
- **Close-up clipping:** close-ups sit about 1 m from the props; set the main camera's near clip plane
  to ~0.05 and check that the cut-away walls never come between the camera and the bench.
- **Lights:** the interior has a strip light, a point light and a fire light. That fits URP Forward's
  per-object additional-light limit; if you add more practical lights, use Forward+.

**Networking**
- **Events can't ride on an unreliable snapshot.** On the web, WebSockets (TCP) make
  `snapshot.events` reliable for free. With NGO, send the snapshot unreliable and the events through
  a reliable RPC (`EventsRpc`). Otherwise a lost packet can lose a `recipeOk`, and the cook's batch
  times out after 5 s.
- `LabState.cookHurt` is a **delta** (hp lost since the last send). Send `LabState` reliably, or
  change it to a running total.
- The NGO host must be the **driver** (see §5.8).
- NGO's `NetworkManager` tick rate (default 30) is unrelated to our 15 Hz snapshot timer. Send from
  your own timer.
- **WebGL networking is WebSocket-only.** For NGO in a WebGL build, enable *Use Web Sockets* on
  `UnityTransport` and use Relay's secure WebSocket protocol. NativeWebSocket uses the browser's
  WebSocket on WebGL.
- With NativeWebSocket, `await ws.Connect()` only returns when the socket **closes**. Use `OnOpen`. Call
  `DispatchMessageQueue()` every frame on non-WebGL platforms. The Node server offers permessage-deflate,
  and clients that don't negotiate it just get uncompressed frames, which is fine.
- A Render redeploy closes every socket with code **1012**. Show "Server restarting" and go back to the
  lobby.

**Rendering & assets**
- Procedural meshes in sim space: after `x → −x`, **reverse triangle winding** and negate `normal.x`.
  The glTF importers already do this for models.
- Vertex colours need a shader that reads them (§5.3). Use **Linear** colour space (the URP default).
  glTF stores `COLOR_0` in linear space, and the three.js side builds the colours in linear
  (`palette.js › linear()`). If imported models look washed out or too dark next to the showroom,
  check the importer's vertex-colour colour-space handling before touching the palette. Hex colours
  from JSON in UI code: `ColorUtility.TryParseHtmlString`.
- **VFX Graph** needs compute shaders, so it doesn't run on WebGL 2. Use Shuriken for anything the web
  build needs, unless you target WebGPU (check support in your Unity version).
- `OnAudioFilterRead` (procedural audio) doesn't work on WebGL. Use recorded clips.

**WebGL build size & hosting**
- The three.js build loads about **270 KB** gzipped (`three.module.js`: 1.3 MB raw / 266 KB gzip).
  Even an empty Unity 6 URP WebGL build is several MB compressed and takes noticeably longer to start.
  To shrink it: Managed Stripping Level *High*, IL2CPP *Optimize for size*, fewer packages, compressed
  textures and audio, no unused shader variants.
- **Brotli/Gzip on Render:** Express's static server won't add `Content-Encoding` for `.br`/`.gz`
  files. Either enable *Decompression Fallback* in Player Settings → Publishing Settings, or add
  middleware that sets `Content-Encoding: br` and the right `Content-Type` for `*.br`.
- Mobile browsers and WebGL builds are memory-hungry. Test on a mid-range phone before promising web
  play to anyone.

**Data & contract**
- `JsonUtility` can't read dictionaries or nulls, so use Newtonsoft (§3). Don't use C# `record`s or
  `init` setters (Unity lacks `IsExternalInit`).
- The order of `Kind` **is the wire format** (the `kindId` in entity tuples). Append only, in both JS
  and C#.
- When the web build gains a JSON key, the C# POCO needs the field too. Newtonsoft silently ignores
  unknown keys, so add a test that fails if a key is missing from the POCO.

---

**References:**
[Unity Multiplayer Services: sessions & Relay](https://docs.unity.com/ugs/en-us/manual/mps-sdk/manual/manage-session-network-connection) ·
[NGO RPCs](https://docs.unity3d.com/Packages/com.unity.netcode.gameobjects@2.4/manual/advanced-topics/message-system/rpc.html) ·
[glTFast](https://github.com/Unity-Technologies/com.unity.cloud.gltfast) ·
[UnityGLTF handedness discussion](https://github.com/KhronosGroup/UnityGLTF/issues/257) ·
[NativeWebSocket](https://github.com/endel/NativeWebSocket) ·
[Render free tier](https://render.com/docs/free)

---

## 8. The 40-minute expansion

The expansion (40 km route, garage tutorial, first-person cab, shop challenges, roof defence, 17 area
events) follows the same split: **logic in `sim/`** (plain C#), **presentation everywhere else**. Every
expansion file starts with a "Unity port" comment; this section collects them.

### 8.1 File-by-file

| Web (this repo) | Unity | Notes |
|---|---|---|
| `sim/setpieces/base.js`, `host.js`, `index.js` | `SetPiece` abstract class + `SetPieceHost` + a `Dictionary<string, Func<SetPieceHost, SetPieceDef, SetPiece>>` registry keyed by `route.json › setpieces[].type` | pure C#, ticked by `GameSim.Step` (see 8.2) |
| `sim/setpieces/*.js` (17 plugins + `common.js`) | one class per event: `FreightWagons`, `MidnightComet`, `Parade`, `Drawbridge`, `WideLoad`, `CarCarrier`, `TollPlaza`, `InflatableGorilla`, `CarWash`, `CattleDrive`, `Combine`, `LogSpill`, `Rattlers`, `Tornado`, `Stagecoach`, `PrattJump`, `Handover` | each owns a seeded `Rng` from `HashSeed(seed, id chars)`, so it stays bit-identical to the JS |
| `sim/garage.js` (`GarageTutorial`, `LAYOUT`) | `GarageTutorial` (pure C#) + a static `GarageLayout` | avatars are kinematic: same `moveAvatar` velocity model, AABB + circle colliders from `LAYOUT`. Phase `garage` → `countdown` when the engine is on |
| `sim/stops.js` | `StopSystem` | `parked → shopping → returning → loading → done`. `ShopDone(stopId, score)` / `ShopAbort(stopId)` come from the driver's shop scene |
| `sim/roof.js` | `RoofDefence` (sim side) | climb timer, hose cone test, ammo per stop, thrown devices with fuses, the solo AI |
| `sim/structures.js` | `StructureLayout` | garage, drawbridge, toll plaza, rail crossing, canyon bridge: shared by sim colliders and the world builder |
| `onfoot/GarageView.js` | a `Garage` additive scene: the interior prefab, two avatar prefabs, a Cinemachine third-person camera, a UI Toolkit checklist | the cook predicts its own avatar with the sim's `MoveAvatar` + `PushOut` and reconciles softly |
| `onfoot/shops/ShopChallenge.js` + `ShopBase.js` + `collect`/`haggle`/`forklift`/`pump`/`goat`/`crane`/`alarm` | one additive scene per shop type, loaded by `ShopChallenge` on `stop.state == "shopping"`. A `ShopBase : MonoBehaviour` holds the timer, prompts and the result card | local to the driver; only the final score crosses into the sim (`DCMD.shopDone`) |
| `onfoot/shops/world2d.js` | `Physics2D`-free grid + AABB pathing (or NavMesh) | the goat's flee AI and the clerks' loops use it |
| `render/fp/FirstPersonDriver.js`, `gearbox.js`, `mirrors.js`, `windscreen.js` | `CabRig` prefab under the RV + a `CinemachineCamera` (first person, `CinemachinePanTilt` for the head) at priority 20; mirrors = small cameras into `RenderTexture`s at 20 Hz; windscreen fog = a decal/shader on the glass driven by `snap.fx.fog` and the wiper angle | look-around: a `CinemachineOrbitalFollow` camera at priority 30 for 3 s, 30 s cooldown |
| `van/roof/*` (`RoofDefence.js`, `roofCamera.js`, devices) | `RoofView` + a shoulder `CinemachineCamera`; hose = a particle stream; throw arcs = `LineRenderer` previews of the same parabola as the sim | reads `snap.stop.roof` |
| `van/cutaway.js` + the near-plane trick in `van/vanCamera.js` | a "cut-away" shader keyword (or a `_ClipBox` global) on the world materials, or fade occluders with a sphere-cast from the dollhouse camera | keeps the garage roof and shop overhangs out of the cook's view |
| `render/world/*` (areas, terrain, structures, stop arrows, time of day) | chunk builders per area + `Light`/skybox keyframes from `route.json › timeOfDay` | the STOP AT arrow is a decal + billboard at `stop.z − 600` |
| `render/ents/*` (anims, controllers, cop FX, models) | per-kind animation scripts: cop states 6/7/8 (soaked, stalled, paint-blind), moto lean, the Rhino's hatch and canister throw, the tornado funnel (particles + a shader) and the cars it lifts | `freight_wagon` has its own prefab; `tornado` and `paint_splat` are effect-only |
| `assets/expansion/*` | export through `assets.html` like the base kit (`x_` categories) | 138 extra models |

### 8.2 The set-piece contract in C#

```csharp
public abstract class SetPiece {
    protected readonly SetPieceHost Host; protected GameSim Sim => Host.Sim;
    public readonly SetPieceDef Def; protected readonly Rng Rng;
    public string Phase = "idle"; public double T; public bool Done;
    public virtual (double from, double to) Zone => (Def.From ?? Def.Z ?? 0, Def.To ?? Def.Z ?? 0);
    public virtual void Start() {}
    public virtual void Update(double dt) { T += dt; }
    public virtual void Ents(List<EntTuple> outList) {}           // [id, kind, x, y, z, yaw, variant, state]
    public virtual void Colliders(List<Collider> outList) {}      // circles: x, z, r, solid, damage, onHit
    public virtual double? SurfaceY(double z) => double.NaN;      // NaN = no opinion, null = gap (drawbridge)
    public virtual bool LaneBlocked(double z, double u) => false; // AI traffic and the autopilot avoid it
    public virtual SetPieceState State() => new(Def.Id, Def.Type, Phase, Math.Round(T * 100) / 100);
}
```

A plugin may only touch the sim through the helper API listed in `EXPANSION_CONTRACT.md` (`DamageRv`,
`PushRv`, `AddHeat`, `DropStars`, `CopsList`, `ApplyCopEffect`, `RedirectCops`, `SpawnTrafficCar`,
`RespawnRv`, `TakeProduct`, `AddPoints`, `Emit`, `Msg`…). Port that API first, then the plugins one by
one; `sim/setpieces/test/run.js` has a scenario per plugin you can mirror as EditMode tests.

### 8.3 New messages and snapshot fields

- `KIND` gained 44 entries at the end (append-only, so the `enum Kind : byte` ids of the base game don't move).
- Cook → host `CMD`: `roofEnter`, `roofLeave`, `roofAim {yaw, pitch, spray}`, `roofThrow {device, x, z}` (world target point), `avatarMove {mx, mz, run}`, `avatarAct`.
- Driver-local `DCMD` (applied straight to the host sim, never sent): `shopDone {stopId, score}`, `shopAbort {stopId}`, `skipTutorial`.
- Events: `tutorial`, `stopParked`, `shopResult`, `roof`, `roofHit`, `canister`, `regen`, `setpiece`, `heatDrop`.
- Snapshot: `phase: "garage"`, `garage` (avatars, items, step), `stop` (state, timers, progress, `roof`), `nearStop` (within 800 m), `timeOfDay`, `area`, `rv.regen`, `rv.roofDoc`, `fx {fog, flash, shock}`, `setpieces[]`. Cop states 6/7/8 are soaked / stalled / paint-blind.

### 8.4 Port order for the expansion

1. Route data (40 km) + `StructureLayout`, then the regenerating hull and the new hazards (pure data + `ObstacleSystem`).
2. `SetPieceHost` and the 17 plugins (EditMode tests per plugin).
3. `StopSystem` + `RoofDefence` (sim), then the roof view on the cook's side.
4. `GarageTutorial` + the garage scene (both roles), with the `garage → countdown → drive` phase change.
5. The shop scenes, one at a time; until a shop exists, call `ShopDone(stopId, 0.6)` after a timer.
6. The first-person cab and look-around camera; keep the chase camera as a debug option.



## 9. Round 3

`ROUND3_CONTRACT.md` is the full spec. What changes for a Unity port:

- **Difficulty** is a pure transform of the data, `withDifficulty(data, level)` (`shared/difficulty.js`). In Unity, keep
  one `RulesConfig` asset and apply the level's op list (`set`/`mul`/`add`/`min` on dotted paths) to a runtime copy at
  session start. Never mutate the asset. The level travels in the lobby's `START` message (`difficulty`).
- **Doc's shop run is client-side.** It runs on the cook's machine like the garage avatars do, and reports with
  `CMD.shopEnter`, `shopDone {stopId, score}` and `shopAbort`. The host keeps the 90 s limit. Doc's progress rides in
  `LabState.shop` and is echoed in `snapshot.stop.docShop`. In Unity, the shop scenes are additive scenes loaded on
  the cook's client, with Doc's camera + `FpHands` prefab.
- **Rook's roof defence** (`sim/roof.js`) is host logic, driven by driver-local commands: `defend {on, ai}`,
  `roofAim`, `roofFire`, `roofReload`, `roofSelect`, `roofThrow`. The hit test is `rayCopHit` against per-kind
  oriented boxes (4 wheels, radiator, glass band, body). In Unity, the same boxes become child BoxColliders on a
  `CopDamageZones` layer, with a `Physics.Raycast` per pellet. Effects go through `ApplyCopEffect(id, {hole, crack,
  tyre, radiator, stall})`. Cop states 9 (tyre out) and 10 (radiator) join the enum. `snapshot.copFx` drives the
  damage decals.
- **Cops fire back** (`rules.defend.copFire`): a seeded timer per cop. Hits are rolled on the host. `EV.COP_SHOT` is
  for effects only.
- **Regen** keeps one last-damage timestamp per bar (hull, Rook, Doc).
- **New messages:**
  - `C2S.SETTINGS {difficulty}`;
  - `CMD.shopEnter/shopDone/shopAbort`;
  - `DCMD.defend/roofAim/roofFire/roofReload/roofSelect/roofThrow`;
  - events `defend`, `shot`, `reload`, `copHit`, `copDisabled`, `copShot`, `docOut`, `stopCops`.
- **New snapshot fields:** `difficulty`, `rv.roofRook`, `rv.stopped`, `crew.regen`, `bustInfo`, `roof` (Rook's: guns,
  ammo, reload, availability), `stop.doc`, `stop.docShop`, `copFx`. `EndResult` gains `difficulty` and `scoreMult`.
- **Port order:**
  1. `withDifficulty`.
  2. Bust grace + regen.
  3. Stop flow with `shopEnter`.
  4. Roof guns (EditMode tests: `sim/test/roof-defend.js`).
  5. Cop states 9/10 + return fire.
  6. The FP shop scenes.
  7. Doc's FP lab camera.
  8. The new HUD (UI Toolkit with the `tokens.css` values as USS variables).
