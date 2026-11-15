# 01. Principles

Accepted as v1 on 2026-10-25. The numbers are stable; other spec docs cite them as P1 to P54. When a detailed spec conflicts with a principle, the principle wins until both players agree to change it.

Amended 2026-11-01 by the owner and agreed by Kat on 2026-11-02: P44 (eras), P45 (richly detailed rather than low-poly) and P50 (measured by GPU frame time, richer presets for the stronger laptop). See `18-eras.md`, `17-presentation.md` (Visual direction) and `22-quality.md`.

Amended 2026-11-10 by the owner (the redesign: zones first, the evening round, a second pass on the look): P2, P13, P20, P26, P28 to P32, P34, P49 and P53, and the broad spec's lanes, iterations and not-doing list. See `13-ledger.md`, `19-evenings.md` and `17-presentation.md`. Each amended principle keeps its number and says what it read before where the meaning changed. Kat's agreement is still to be recorded here.

## Broad spec

**Pitch.** A cozy two-player town builder in the browser. Two players on two laptops grow a hamlet in a storybook river valley into a lively little city over many evenings, with real stakes along the way: lean winters, floods and the odd raid on the granary. Built for a pair where one leans toward logistics and efficiency and the other toward building and decorating, though either can do everything.

**Two lanes.** *Hearth*: residents, homes, decorating, gardens, festivals, nature, and the places where the town spends its evenings. *Ledger*: zoning, streets, a few specialized buildings, trade, budget. The Ledger decides how much there is; the Hearth decides what kinds, and whether anyone enjoys them. Each lane is a complete game with its own progression and achievements, and the town only thrives when both work.

**An evening.** A 30 to 90 minute session is roughly one in-game season: a few goals up front (a Charter step, a festival to plan, a threat on the horizon), work in your lanes while trading requests, then a festival and a short season report.

**The arc.** Hamlet → Village → Town → Market Town → City, each step unlocked by a Charter that needs both lanes and ends with a trial. Roughly 30 to 50 hours to the first City, with every evening satisfying on its own. Then the valley opens up, and new valleys follow.

**How it's built.** TypeScript and Three.js in the browser. One deterministic simulation runs in both browsers in lockstep, and a tiny server relays commands and stores the town. Shipped as playable iterations on a private link.

**Iterations.**

- **I0 Valley sandbox:** generated valley, camera, paths and cottages, day and night, saves, both laptops building live together.
- **I1 Hamlet:** first named residents and wishes, first goods and budget, first patterns and achievements.
- **I2 Village:** zoning, market prices, production chains, second tier, Charters.
- **I3 Seasons and the Watch:** winter prep, festivals, Field Guide, Chronicle, first threats and defenses, music and sound, a guide for the first days.
- **I4 Town:** districts and styles, trade and contracts, weather, innovations, raids and trials.
- **I5 onward:** Market Town and City, new land and valleys, stroll mode, polish.
- **Between I3 and I4 (2026-11-10):** R1 Zones first, R2 The evening round, R3 Masters and the Town Book, on fresh valleys; the look runs beside them as V2 to V4 (`30-roadmap.md`).

**Not doing.** Unit micromanagement or tower-defense waves, PvP, monetization, mobile-first, metropolis-scale traffic simulation, losing the whole town, long production chains wired by hand.

## Principles

### Feel

1. **Two equal lanes.** Hearth and Ledger are equally deep, each with its own tools, progression and achievements. Neither is the support act.
2. **The lanes need each other.** By day goods move and of an evening folk move: the Ledger brings goods to where people are, the Hearth brings people to where goods are, and coins, friendships and finer homes are made where the two meet. Volume is the Ledger's, variety is the Hearth's. Merchants won't settle on a street nobody walks; a lantern walk needs the chandler's candles; industry costs charm and parks cost land. That tension is the heart of the co-op.
3. **Cozy, with real stakes.** Raids steal goods and break things, bad winters drive residents away, debts bite. But there's no game over, nothing wipes out the town, and every loss can be rebuilt.
4. **Cute, never childish.** Warm, dry, witty writing, residents with real lives and opinions, art dense with detail. Closer to The Wind in the Willows or Mouse Guard than a toddler app.
5. **Respect your time.** No timers, energy, dailies, FOMO or premium currency. Stop at any moment without loss; 20 minutes is enough to do something meaningful.
6. **Deep, not grindy.** Every unlock adds a system, building or constraint, never "+5%". The first evening has a handful of tools, complexity arrives with the town (taught through residents, not popups), and busywork gets automated as you grow.

### Co-op

7. **One shared town, co-owned.** You build in the same world at the same time, each on your own laptop with your own camera, as equals (no host). Rejected alternative: two neighboring towns that trade, which gives more ownership but less time together.
8. **Your own lens.** Each screen defaults to its player's lane (tools, overlays, alerts); one key flips to the other.
9. **Either of you can play alone.** Whoever opens the town can play; the other comes back to a "while you were away" letter. Optional setting: the town only runs when you're both in.
10. **Time passes only while someone is in.** Leave for a month and nothing changes. Either player can pause or change the speed, and the speed is shared: whoever changed it last decides (playtest round three: waiting on a partner who never touched the clock read as a bug).
11. **Presence.** See each other's cursor and tool, ping a spot, pin notes to the map, emote. Voice stays outside the game.
12. **Plans layer.** Sketch ghost plans (roads, zones, buildings, decor) for the other to comment on, tweak and approve, live or asynchronously.
13. **Requests between lanes.** "I need 40 lanterns for the Autumn Walk." "Can Mill Lane get nicer so merchants move in?" The town writes most of them itself: a gap opens when one lane's work is waiting on the other's, says what would close it, and thanks whoever does. Requests are tracked and count toward shared goals.
14. **Gentle guardrails.** Per-player undo, a "who built this" history, and removing the other player's handmade work asks first and leaves a note.

### Hearth

15. **Residents are individuals.** A few hundred to a couple of thousand, each simulated, with a name, personality, job, home, friends and a life story (apprenticeship, romance, opening a shop, retiring). Follow anyone.
16. **Residents are woodland folk.** Rabbits, badgers, otters, foxes, mice, hedgehogs, squirrels and more. Species flavor tastes (otters want water views, squirrels want trees); personalities are individual. Alternative: little storybook humans.
17. **Story characters.** Handwritten characters with arcs over several evenings (a retired sea captain who dreams of a lighthouse, a young inventor who builds the first water wheel), alongside generated townsfolk.
18. **Wishes, not quests.** Specific, often spatial wishes: "a bench under a tree where I can watch the river." Fulfilling them deepens bonds and unlocks things; ignored wishes fade.
19. **The Pattern Book.** The core of Hearth progression. Good places are made of patterns (Corner Café, Sitting Wall, Small Square with a Fountain, Promenade by the Water), inspired by Christopher Alexander's *A Pattern Language*. Build one and it's discovered, permanently boosts that spot and unlocks new pieces. Dozens to find, through hints rather than checklists.
20. **Charm is a real system.** Every spot scores Charm from spatial rules (nature, enclosure, light, views, variety, noise), which drives desirability, growth and who moves in. Repetition earns nothing: fifty identical benches add no charm. What charm earns the town runs through its evenings: it is the draw of the places where residents choose to spend their free time.
21. **Hand-building and free decor.** Landmarks and special homes are built by stacking and shaping blocks, and the architecture adapts to neighbors and slopes (joined roofs, stairs, arches, in the spirit of Townscaper). Decor goes anywhere, off the grid, at any angle.
22. **District styles.** Districts are drawn in Ledger; Hearth gives each one a style (materials, palette, roofs, details) that every grown building follows, shaping whole neighborhoods without placing every house.
23. **Festivals.** Each season has a festival you plan: site, stalls, decorations, menu, music. Results depend on layout, supplies and timing, and themes rotate so no two feel alike.
24. **Nature you invite.** Gardens, hedgerows, ponds and orchards attract wildlife logged in a Field Guide, with real effects: bees raise orchard yields, songbirds keep pests off the crops.
25. **The Chronicle.** Your town's history, written as it happens (the first wedding, the spring flood, the night the gate held), with snapshots and a time-lapse from day one. Optional later: Claude writes residents' letters from your town's real events (needs an API key).

### Ledger

26. **Zoning is the economy.** Paint zones (homes, shops, workshops, farmland) from the first street; the town builds, staffs and runs what grows there from demand, desirability and access, and four demand bars say what it wants more of. Hand placement is for a dozen specialized buildings (mills, the quarry, the granary, the market), services and special homes. Mixed use is normal: shop downstairs, flat upstairs.
27. **Streets matter, on a square grid.** Footpaths, lanes, streets and canals differ in capacity, noise, cost and charm; a tram and a little railway come later. Terrain and rivers shape the layout.
28. **Goods physically move.** Carts, porters and barges carry goods along real routes; distance and congestion cost time; markets and warehouses are hubs. Flows are visible, with no gridlock simulation. The Ledger's levers are the streets and where things stand, never routes or orders.
29. **Two steps at most.** Land gives raw goods (grain, fish, timber, stone, wool) and a workshop turns raw goods into a made one (bread, cloth, furniture). No workshop ever needs another workshop, and a carrier brings whatever is short, so nothing stalls and nothing has to be wired. A new rank or era adds decisions, never chains. (Until 2026-11-10 this read: production chains of 2 to 4 steps with switchable methods.)
30. **A Victoria-lite market.** Prices come from supply and demand. Needs baskets shift with wealth and season, and residents substitute: pricey bread means more porridge. Goods come in five families (Food, Fuel, Materials, Wares, Treats); households want enough of each and a variety of flavors, and the Ledger reads five balances, never a list of every good.
31. **Trade, contracts, commissions.** Neighboring towns trade at regional prices that drift with seasons and events. A carrier does the daily buying and selling by rules the Ledger sets. Seasonal contracts (fixed volume, fixed price) reward planning and carry risk; optional commissions add challenges with rewards.
32. **Levers and ledgers, not micromanagement.** Taxes per tier, market fees, service budgets, a season plan and policies, plus overlays and reports for flows, coverage, land value, price history and profit per building. Nothing the Ledger does is a chore to repeat: no pausing workplaces to move hands, no orders to retune.
33. **Soft-fail budget.** Taxes, upkeep, trade, tourism and loans. A deficit brings lean times (deferred repairs, grumpier residents, pricier loans), never bankruptcy.
34. **Population tiers.** Settlers, Craftsfolk, Merchants, Patrons. Each tier needs enough goods, a variety of them, services and good evenings; homes visibly upgrade when needs are met and slide back when not. Higher tiers pay more and unlock new jobs and buildings.

### Challenge and defense

35. **Light defense, not tower defense.** Bandit gangs and wild things from beyond the valley (a winter wolf pack, a great owl) test the town a few times a year. You prepare: walls, gates, watchtowers, lantern lines, hedgerows, traps, a volunteer Watch. The clash then plays out on its own, in view, with no unit micromanagement (roughly the weight of raids in Kingdoms and Castles). Repelled raids bring renown and loot; captured bandits can be offered a home, and some become your best workers.
36. **Fair threats.** Always telegraphed (tracks in the snow, crows gathering, a scout's report) with time to prepare. They scale with your wealth, not the clock, so a slow pace is never punished, and they go for what's valuable (full granaries, rich markets, outlying farms), so where you store things matters.
37. **Defense touches both lanes.** Ledger: materials, upkeep, guards versus workers, safe roads for caravans. Hearth: walls and gatehouses can be beautiful and count for Charm, lanterns deter night raids, hedgerows slow raiders and shelter wildlife, and festivals and friendships raise the morale that keeps the Watch brave.
38. **Seasons and weather with teeth.** One season is roughly one evening: spring planting, summer visitors, autumn stockpiling, winter heating and a frozen river, plus floods, storms, droughts and early frosts. Winter is the gentle exam: prepared, it's the coziest season; unprepared, residents are cold and some leave.
39. **Two difficulty dials.** Economy (Gentle, Standard, Thoughtful) and threat (Peaceful, Standard, Fierce), set together per valley and changeable any time.

### Progression

40. **Charters and trials.** Hamlet → Village → Town → Market Town → City. Each Charter mixes both lanes (a weekly market with six goods, three discovered patterns, a joyful festival) and ends with a trial worthy of the new rank (a bandit chief testing the new Town's walls, a great flood): an evening to prepare, one tense dusk to see it through. Each rank unlocks new systems.
41. **Innovations, not a tech tree.** Technology arrives through conditions in your town: a fast river plus a carpenter's guild brings the water wheel; a library plus a printer brings the newspaper.
42. **Achievements that mean something.** No "build 100 roads". Feats and stories: Everyone Has a Friend, A Winter Without Imports, The River Runs Clean, The Gate Held, The 15-Minute Town, Built Together. Rewards are cosmetics and options, never raw power. Shared plaques in the town hall, plus a personal journal each.
43. **The world grows with you.** Each game starts from a generated valley that opens in parcels (a bridge, a forest clearing, a hill pass), some held by a bandit camp or wolf den the Watch must clear first. Later, new valleys (coast, highlands, lakes) with your first town as a trading partner.

### Look, sound, controls

44. **Storybook valley, through three eras.** A European-flavored country town that grows up with its rank: the Old Age (thatch, timber frames, oil lanterns), the Age of Steam (brick, slate, canals, gas lamps) and the Bright Age (stucco, electric light, trams, a little railway, about the 1950s). Eras layer rather than replace, so an old core sits inside newer rings. It stops around the 1950s and never becomes a modern metropolis.
45. **Soft-lit, richly detailed miniature 3D.** Cozy first, and dense with detail: surface detail drawn in the shader (brick courses, roof tiles, thatch, plaster grain), streets whose buildings join into rows, rich rooflines, and small life everywhere (chimney smoke, washing lines, ducks on the canal, lit windows at night). Warm palette, tilt-shift. Day, night, seasons and weather transform the whole town.
46. **Art made in code.** Buildings, residents and props are generated from one style kit of shapes and palettes: coherent, and content scales without an art team.
47. **Dollhouse camera.** Tilted top-down view, free rotation, zoom from valley to street. Later: a stroll mode to walk the streets you built.
48. **Sound.** Gentle acoustic and jazz-tinged music that shifts with the hour and season; ambient sound from what's nearby (market chatter, the mill, birdsong, the watch bell).
49. **Laptop-first controls.** Mouse or trackpad plus keyboard: pinch to zoom, two-finger pan, no middle click needed. The two players each play on their own laptop, online, in a browser (the owner, 2026-11-10), and the interface is designed for that alone; gamepads and a one-screen couch mode are no longer planned.

### Tech

50. **Runs on the weaker laptop.** 60 fps at 1080p on Medium on the weaker of the two laptops (integrated graphics), measured by GPU frame time; richer presets (High, Ultra) let the stronger laptop show more. The simulation runs in a background worker and never stutters the frame rate.
51. **One deterministic simulation, in lockstep.** The same simulation runs in both browsers and the server only orders commands and stores the town: no host to wait for, tiny bandwidth, easy to test.
52. **Cheap, private hosting.** Cloudflare for the game plus one Durable Object per town; the free tier should cover two players. A private link, no public accounts. You'd create a free Cloudflare account for the live link.
53. **Your town survives every update.** Versioned saves with migrations, automatic backups, export and import, since we'll keep building while you play. One exception, by the owner's call on 2026-11-10: the zones-first rebuild (R1) starts every valley fresh.
54. **Playable iterations.** Every iteration ends with something you can both play on the live link, plus a short changelog.

## Most expensive to change later

7 (shared town), 10 (time model), 15 (scale), 16 (woodland folk), 27 (grid), 35 (prepare-and-watch defense), 45 and 46 (code-made 3D), 51 (lockstep). Everything else can shift as we go.
