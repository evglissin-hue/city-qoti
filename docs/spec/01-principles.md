# 01. Principles

Accepted as v1 on 2026-10-25. The numbers are stable; other spec docs cite them as P1 to P54. When a detailed spec conflicts with a principle, the principle wins until both players agree to change it.

## Broad spec

**Pitch.** A cozy two-player town builder in the browser. Two players on two laptops grow a hamlet in a storybook river valley into a lively little city over many evenings, with real stakes along the way: lean winters, floods and the odd raid on the granary. Built for a pair where one leans toward logistics and efficiency and the other toward building and decorating, though either can do everything.

**Two lanes.** *Hearth*: residents, homes, decorating, gardens, festivals, nature. *Ledger*: zoning, streets, logistics, production, markets, budget. Each lane is a complete game with its own progression and achievements, and the town only thrives when both work.

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

**Not doing.** Unit micromanagement or tower-defense waves, PvP, monetization, mobile-first, metropolis-scale traffic simulation, losing the whole town.

## Principles

### Feel

1. **Two equal lanes.** Hearth and Ledger are equally deep, each with its own tools, progression and achievements. Neither is the support act.
2. **The lanes need each other.** Merchants won't settle on a street that's efficient but bleak; a festival needs the lanterns, pies and timber the workshops make; industry costs charm and parks cost land. That tension is the heart of the co-op.
3. **Cozy, with real stakes.** Raids steal goods and break things, bad winters drive residents away, debts bite. But there's no game over, nothing wipes out the town, and every loss can be rebuilt.
4. **Cute, never childish.** Warm, dry, witty writing, residents with real lives and opinions, art dense with detail. Closer to The Wind in the Willows or Mouse Guard than a toddler app.
5. **Respect your time.** No timers, energy, dailies, FOMO or premium currency. Stop at any moment without loss; 20 minutes is enough to do something meaningful.
6. **Deep, not grindy.** Every unlock adds a system, building or constraint, never "+5%". The first evening has a handful of tools, complexity arrives with the town (taught through residents, not popups), and busywork gets automated as you grow.

### Co-op

7. **One shared town, co-owned.** You build in the same world at the same time, each on your own laptop with your own camera, as equals (no host). Rejected alternative: two neighboring towns that trade, which gives more ownership but less time together.
8. **Your own lens.** Each screen defaults to its player's lane (tools, overlays, alerts); one key flips to the other.
9. **Either of you can play alone.** Whoever opens the town can play; the other comes back to a "while you were away" letter. Optional setting: the town only runs when you're both in.
10. **Time passes only while someone is in.** Leave for a month and nothing changes. Either player can pause; fast-forward needs both to opt in.
11. **Presence.** See each other's cursor and tool, ping a spot, pin notes to the map, emote. Voice stays outside the game.
12. **Plans layer.** Sketch ghost plans (roads, zones, buildings, decor) for the other to comment on, tweak and approve, live or asynchronously.
13. **Requests between lanes.** "I need 40 lanterns for the Autumn Walk." "Can Mill Lane get nicer so merchants move in?" Requests are tracked and count toward shared goals.
14. **Gentle guardrails.** Per-player undo, a "who built this" history, and removing the other player's handmade work asks first and leaves a note.

### Hearth

15. **Residents are individuals.** A few hundred to a couple of thousand, each simulated, with a name, personality, job, home, friends and a life story (apprenticeship, romance, opening a shop, retiring). Follow anyone.
16. **Residents are woodland folk.** Rabbits, badgers, otters, foxes, mice, hedgehogs, squirrels and more. Species flavor tastes (otters want water views, squirrels want trees); personalities are individual. Alternative: little storybook humans.
17. **Story characters.** Handwritten characters with arcs over several evenings (a retired sea captain who dreams of a lighthouse, a young inventor who builds the first water wheel), alongside generated townsfolk.
18. **Wishes, not quests.** Specific, often spatial wishes: "a bench under a tree where I can watch the river." Fulfilling them deepens bonds and unlocks things; ignored wishes fade.
19. **The Pattern Book.** The core of Hearth progression. Good places are made of patterns (Corner Café, Sitting Wall, Small Square with a Fountain, Promenade by the Water), inspired by Christopher Alexander's *A Pattern Language*. Build one and it's discovered, permanently boosts that spot and unlocks new pieces. Dozens to find, through hints rather than checklists.
20. **Charm is a real system.** Every spot scores Charm from spatial rules (nature, enclosure, light, views, variety, noise), which drives desirability, growth and who moves in. Repetition earns nothing: fifty identical benches add no charm.
21. **Hand-building and free decor.** Landmarks and special homes are built by stacking and shaping blocks, and the architecture adapts to neighbors and slopes (joined roofs, stairs, arches, in the spirit of Townscaper). Decor goes anywhere, off the grid, at any angle.
22. **District styles.** Districts are drawn in Ledger; Hearth gives each one a style (materials, palette, roofs, details) that every grown building follows, shaping whole neighborhoods without placing every house.
23. **Festivals.** Each season has a festival you plan: site, stalls, decorations, menu, music. Results depend on layout, supplies and timing, and themes rotate so no two feel alike.
24. **Nature you invite.** Gardens, hedgerows, ponds and orchards attract wildlife logged in a Field Guide, with real effects: bees raise orchard yields, songbirds keep pests off the crops.
25. **The Chronicle.** Your town's history, written as it happens (the first wedding, the spring flood, the night the gate held), with snapshots and a time-lapse from day one. Optional later: Claude writes residents' letters from your town's real events (needs an API key).

### Ledger

26. **Zoning with organic growth.** Paint zones (homes, shops, workshops, farms) at a chosen density; buildings grow from demand, desirability and access. Mixed use is normal: shop downstairs, flat upstairs.
27. **Streets matter, on a square grid.** Footpaths, lanes, streets and canals differ in capacity, noise, cost and charm; a tram and a little railway come later. Terrain and rivers shape the layout.
28. **Goods physically move.** Carts, porters and barges carry goods along real routes; distance and congestion cost time; markets and warehouses are hubs. Flows are visible, with no gridlock simulation.
29. **Production chains of 2 to 4 steps.** Wheat → flour → bread; wool → yarn → cloth → coats; clay → bricks; timber → planks → furniture. Workshops switch production methods (by hand, water-powered, guild), trading output against workers, inputs, noise and smell.
30. **A Victoria-lite market.** Prices come from supply and demand. Needs baskets shift with wealth and season, and residents substitute: pricey bread means more porridge.
31. **Trade, contracts, commissions.** Neighboring towns trade at regional prices that drift with seasons and events. Seasonal contracts (fixed volume, fixed price) reward planning and carry risk; optional commissions add challenges with rewards.
32. **Levers and ledgers, not micromanagement.** Taxes per tier, market fees, service budgets, standing orders and policies, plus overlays and reports for flows, coverage, land value, price history and profit per building.
33. **Soft-fail budget.** Taxes, upkeep, trade, tourism and loans. A deficit brings lean times (deferred repairs, grumpier residents, pricier loans), never bankruptcy.
34. **Population tiers.** Settlers, Craftsfolk, Merchants, Patrons. Each tier needs goods, services and charm; homes visibly upgrade when needs are met and slide back when not. Higher tiers pay more and unlock new jobs and buildings.

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

44. **Storybook valley.** A timeless, European-flavored country town: cobbles, timber frames, canals, windmills, lanterns, slowly modernizing (gas lamps, trams, a little railway).
45. **Soft-lit miniature 3D.** Low-poly but dense with detail (chimney smoke, washing lines, ducks on the canal, lit windows at night), warm palette, tilt-shift. Day, night, seasons and weather transform the whole town.
46. **Art made in code.** Buildings, residents and props are generated from one style kit of shapes and palettes: coherent, and content scales without an art team.
47. **Dollhouse camera.** Tilted top-down view, free rotation, zoom from valley to street. Later: a stroll mode to walk the streets you built.
48. **Sound.** Gentle acoustic and jazz-tinged music that shifts with the hour and season; ambient sound from what's nearby (market chatter, the mill, birdsong, the watch bell).
49. **Laptop-first controls.** Mouse or trackpad plus keyboard: pinch to zoom, two-finger pan, no middle click needed. Gamepads and a one-screen couch mode can come later.

### Tech

50. **Runs on the weaker laptop.** 60 fps at 1080p on integrated graphics, with quality presets; the simulation runs in a background worker and never stutters the frame rate.
51. **One deterministic simulation, in lockstep.** The same simulation runs in both browsers and the server only orders commands and stores the town: no host to wait for, tiny bandwidth, easy to test.
52. **Cheap, private hosting.** Cloudflare for the game plus one Durable Object per town; the free tier should cover two players. A private link, no public accounts. You'd create a free Cloudflare account for the live link.
53. **Your town survives every update.** Versioned saves with migrations, automatic backups, export and import, since we'll keep building while you play.
54. **Playable iterations.** Every iteration ends with something you can both play on the live link, plus a short changelog.

## Most expensive to change later

7 (shared town), 10 (time model), 15 (scale), 16 (woodland folk), 27 (grid), 35 (prepare-and-watch defense), 45 and 46 (code-made 3D), 51 (lockstep). Everything else can shift as we go.
