# DUSTLINE — a tactical FPS in a freight yard at dusk

## The game

DUSTLINE is a round-based tactical shooter in the Counter-Strike style,
built on three.js with no network, no textures and no audio files: every
wall, container and tank is a primitive in a dusk palette, and every
sound is synthesised live with WebAudio.

Two teams fight over two bomb sites in a freight yard. VANGUARD (the
player plus three bots) attacks; EMBER (four bots) defends. The first
team to five rounds takes the match, at most nine rounds.

## The map

A fenced yard, 80 by 60 metres. Site A sits inside a corrugated
warehouse on the west side, entered through one wide door; site B is a
fuel depot of three white tanks on the east. Between them, rusted
shipping containers stack into three lanes — a wide middle lane with a
double stack at its heart, and a west and east flank lane — with crates
and barrels as micro-cover, two yard lamps throwing warm pools of light,
and sand patches breaking up the ground. The sun hangs low in the west,
so attackers push out of warm light into cool blue shadow.

## How a round plays

Each round opens with a 15-second buy phase, then 100 seconds of live
play. Attackers win by planting the bomb (hold E on a site for 3.2
seconds) and holding until it detonates 35 seconds later, or by
eliminating every defender. Defenders win by eliminating every attacker,
defusing a planted bomb (5 seconds), or running the clock out with no
plant. The bomb drops where its carrier dies and is picked up by walking
over it.

Money drives the tactics. Everyone starts with $800. A kill pays $300,
a plant pays $300, a round win pays $3250 and a loss pays $1900 plus
$500 per consecutive loss, up to $3400. Death costs the bought primary,
the armor and the grenades; the issued pistol and rifle stay. The buy
menu (B, or keys 1–5) sells a fast SMG, a one-shot sniper with a
right-click zoom, HE grenades and kevlar that halves damage taken.

## Gunplay

Shooting is hitscan with real raycasts: bullets and sight are both
blocked by walls, and headshots deal the listed head damage. Spread
grows with movement, firing and range, and shrinks when still or aiming,
so stopping to aim pays. Movement has acceleration, crouching, and
circle-vs-box collision with the map. The HUD shows health and armor,
ammo, money, the round timer, the score, the kill feed, the bomb status,
weapon slots, a crosshair whose gap tracks spread, a red hitmarker for
headshots and a red wedge showing where damage came from.

## The bots

Bots path along a waypoint graph with breadth-first shortest paths.
Attackers advance on a site, plant when they carry the bomb, fetch it
when it drops, and guard it after the plant. Defenders hold a site
angle, rotate toward gunshots they hear, push a planted bomb and defuse
it. Vision is a raycast, so a wall really does hide you. Reaction time
scales with distance and skill, and bots fire in three-round bursts
whose accuracy falls with range and target speed.

## Controls

Mouse to look (pointer lock), WASD to move, Ctrl or C to crouch, R to
reload, hold E to plant or defuse, G to throw a grenade, B for the buy
menu, 1–5 to buy or select weapons, Q to swap weapons, right-click to
aim or zoom.

## Structure

One module per job, a fixed 60 Hz simulation kept apart from rendering:

- `src/main.js` — boot, the fixed-step loop, shooting, grenades, round flow, screenshot staging
- `src/world.js` — the freight yard, lighting, colliders, waypoint graph
- `src/bots.js` — bot AI: routing, vision, reaction, bursts, plant/defuse
- `src/player.js` — movement, health, armor, collision
- `src/weapons.js` — the arsenal, spread, view models, muzzle flash
- `src/bomb.js` — bomb state and plant/defuse timers
- `src/rounds.js` — the round and match state machine
- `src/economy.js` — money, payouts, death costs
- `src/hud.js` — every HUD element
- `src/input.js` — keyboard, mouse, pointer lock
- `src/audio.js` — synthesised WebAudio effects
- `src/palette.js` — the dusk palette
- `src/util.js` — clamping, seeded random, angle helpers

## Screenshots

The game stages deterministic scenes from a query string:
`?shot=play`, `?shot=buy`, `?shot=end` and `?shot=start`, each with a
`?seed=` for repeatability. The four screenshots in `screenshots/` were
rendered from the game's own code in a headless browser.
