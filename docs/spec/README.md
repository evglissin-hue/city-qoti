# City Qoti spec

Status: v1, accepted 2026-10-25. Built in iterations I0 to I5, with visual overhaul iterations V0 to V6 between them (see `30-roadmap.md`), by parallel development cycles (see `31-parallel-development.md` and `docs/build/`).

**The redesign (2026-11-10)**: after I3 and P1 the owner asked for a step back. The result is in `13-ledger.md` (rewritten: zones first), `19-evenings.md` (new: how the lanes meet), `17-presentation.md` (a second pass on the look, and the interface) and `30-roadmap.md` (R1 to R3 and V2 to V4, on fresh valleys), with amendments tagged [R1] to [R3] and [V2] to [V4] in the other docs and in the principles. Start with the paragraph at the top of `02-game-overview.md`.

| Doc | Contents |
|---|---|
| `01-principles.md` | The 54 numbered principles (P1 to P54). Source of truth for intent. |
| `02-game-overview.md` | Lanes, loops, time and calendar, scale targets, starting state, glossary. |
| `10-world-and-building.md` | Units, map layers, valley generation, terrain, roads, placement, decor, trees, parcels, customization. |
| `11-residents.md` | Residents, species, traits, households, arrival, life events, schedules, movement, needs, mood, friendships, bonds, story characters. |
| `12-hearth.md` | Charm, Pattern Book, wishes, festivals, nature and Field Guide, Chronicle, district styles. |
| `13-ledger.md` | The zones-first Ledger [R1]: families and flavors, specialized buildings, zones, businesses and trades, households, the carrier, the season plan, tiers, levers, reports. |
| `archive/13-ledger-chains.md` | The chain economy of I1 to I3 as built. It describes the code until R1X merges, and holds the fine print of the sections `13-ledger.md` marks as kept. |
| `14-challenge.md` | Threats, defenses, the Watch, raid resolution, seasons, weather and events, difficulty dials. |
| `15-progression.md` | Ranks, Charters, trials, renown, innovations, achievements, expansion, new valleys. |
| `16-coop.md` | Seats, links, presence, notes, plans, requests, guardrails, undo, time and speed, lenses. |
| `17-presentation.md` | Art direction, visual direction (V0 concepts), palette, style kit, lighting, seasons, camera, post, quality presets, UI, audio, accessibility. |
| `18-eras.md` | Old Age, Age of Steam, Bright Age: what each brings to both lanes, layering, the era moment, Old Town, data. |
| `19-evenings.md` | How the lanes meet [R2, R3]: places, the evening round, evening trade, good evenings, evening streets, gaps, supplies, masters, the Town Book. |
| `20-architecture.md` | Monorepo, boundaries, simulation design, determinism, I0 contracts, client, rendering, content pipeline. |
| `21-networking-and-saves.md` | Lockstep protocol, rooms, join and catch-up, desync, persistence, migrations, hosting, security. |
| `22-quality.md` | Tests, performance budgets, CI, definition of done, playtests. |
| `30-roadmap.md` | Iterations with scope and acceptance criteria: I0 to I3 and V1 as built, the redesign (R1 to R3, V2 to V4), then I4 and I5 with V5 and V6. |
| `31-parallel-development.md` | Waves, tracks, ownership, contracts policy, branching, integration, how to run a cycle. |

Conventions in these docs:

- **[I1]** marks the iteration a feature lands in. Untagged means it applies from I0. **[R1]** to **[R3]** and **[V2]** to **[V6]** are the redesign's and the look's iterations.
- *(tune)* marks a starting value for balancing. Change freely, record the new value here.
- "Must" is an acceptance criterion. "Should" is the default unless there is a good reason.
- Agents read only the docs their cycle brief lists.
