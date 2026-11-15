# Dustline Yard — a three.js tactical FPS

[![make.fun](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounty/threejs-fps-02)
[![owner](https://img.shields.io/badge/owner-Krwanz-green)](https://github.com/Krwanz)

A round-based tactical shooter in the Counter-Strike style, built on three.js 0.187.0: two teams of four, short rounds won by elimination or by the bomb, money between rounds to buy weapons, and gunfire where stopping to aim pays.

## The game

- **Map:** Dustline Yard — an original desert-town yard with two bomb sites (A, teal; B, amber), a mid lane, a long sightline, corners and crate cover, warm dusk light and procedural canvas textures. No external assets, no network.
- **Gunplay:** rifle (Vandal-9) and pistol (Sidewinder) with different damage, rate and spread, plus a throwable Spark grenade. Recoil and spread grow while moving or spraying and shrink when still or crouched; headshots deal 4× damage. Reload, magazines and reserve ammo.
- **Bots:** 4v4 — three teammates and four opponents who patrol waypoint routes, hold positions, react to line of sight, shoot back with distance-scaled accuracy, take cover when hurt, carry and plant the bomb, or defuse it.
- **Rounds:** 100-second rounds, 15-second buy phase, first to 5 round wins (max 9). Plant with hold-E at a site, defuse with hold-E; the bomb detonates 35 seconds after planting. Teams swap sides each round.
- **Economy:** win $3,250, loss $1,900, kill $300, plant/defuse $300. Buy menu (B) sells the rifle, pistol, grenades, kevlar and ammo.
- **HUD:** health and armour, ammo, money, round timer, score, crosshair with live spread feedback, hitmarker, kill feed and round banners.

## Play

Serve `game/` with any static server (`node serve.ts`, then http://localhost:8080) and click to play. WASD move, mouse look, click fire, R reload, 1/2 weapons, G grenade, E plant/defuse (hold), B buy menu, Ctrl crouch, Space jump.

## Status

- **Owner:** [@mszwanz27](https://make.fun) (GitHub: Krwanz)
- **Referral:** `a15ed58m`
- **Bounty:** [threejs-fps-02](https://make.fun/bounty/threejs-fps-02) — $1,000 total

## License

MIT — see [LICENSE](LICENSE).
