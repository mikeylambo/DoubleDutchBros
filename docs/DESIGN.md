# Double Dutch Bros — Design

Living design doc. Sources: the original Gemini/GPT design sessions (summarized in §1), what is
built today (marked ✅), and new design (marked 🆕). Art and audio rules live in `ART_SPEC.md`;
project rules for agents in `AGENTS.md`.

---

## 1. What the original design scoped

- **Endless runs**, "The Dutch Mastery Loop": elite wave every 4, boss every 5, a modifier choice
  every 3–5 waves, perk drafts on milestones, occasional rest/shop forks.
- **Ascension Mutators** every 10 waves (after a boss): pick one of three curse-blessings.
  Named: *Glass Wire* (2× damage, a trip is an instant KO), *Lead Shoes* (lower, faster jumps).
- **Pacing:** waves 1–15 assemble the build · 16–35 build comes online, elites appear · 36+
  survival is about escalating rules.
- **"Scale the behavior, not the digits."** No HP inflation endgame.
- **Enemies:** only Slime, Bat, Stone Shell, Giga Slime. Unbuilt attack ideas: delayed wave,
  shallow dive, cross-screen air slash, armored stomp.
- **Escalation categories:** elite affixes, shields/armor, aerial-heavy waves, anti-rhythm
  enemies, greed-punishers, boss phases.
- **Bosses:** Giga Slime gets 2 phases + a panic pattern under 30%; returns at waves 10/20/50
  remixed (shortened, fake, split telegraphs, delayed second hits; never invisible ones).
  "Giga Glitch" late tier: steals Sync, swaps Hop and Skip, inverted waves.
- **Endgame systems:** Dutch Legacy prestige, Tandem Master Techniques, Armory Meta (checkpoint
  swaps, soft counters), Dual-Rope waves (late, introduced gently).

Never designed: the world, a story, more enemies, more bosses, a second skill per rabbit.

---

## 2. The game in one breath

Hop and Skip, two rabbits out swaggin' through a neon city at night, turn every street fight into
a double dutch session. **The song is the clock.** You charge skills by jumping the rope on the
beat, tag your partner in for combos, and jump enemy attacks that land on the music. Endless runs,
daily seeds, ranked results.

### Pillars
1. **Everything on the beat.** If it moves, it moves to the music.
2. **Two rabbits, two playstyles.** Hop and Skip differ in rules, not just numbers.
3. **Scale behavior, not digits.** Difficulty is new reads, not bigger HP bars.
4. **Readable danger.** Every attack is telegraphed by shape, sound and timing, not only color.
5. **Swagger.** Style is rewarded. Clean play looks and sounds better, and ranks higher.

### Setting
An eclectic but coherent **neon city at night**: alleys, rooftops, laundromats, subway platforms,
arcades. Enemies are city critters and odd city "things" (a slime is a sewer slime, the Shell is
a manhole turtle). No story required; the vibe is "two friends who own the block." A light
through-line can come later (e.g. a city-wide double dutch crown).

---

## 3. Core loop ✅

Turn-based waves on a live beat:

1. **Your turn:** Attack, Skill, Items, or Ult.
   - Skills charge on the rope: jump on rope peaks (perfect = gold floor glow). Misses trip.
   - On a hit, the partner's button flashes: tap in rhythm to **tag in** and extend the combo.
2. **Enemy turn:** each enemy plays an attack written in beats. A hit reaches Hop on the "and"
   and Skip half a beat later, on the next beat. Jump on the beat to clear it.
3. Wave clear → XP, RP, level-ups → shop → next wave. Game over → results (rank, score, best runs).

Modes: **Endless** ✅, **Daily** (same seed for everyone) ✅, **Tutorial** ✅.

---

## 4. Hop & Skip: identity 🆕

Today they differ in base stats and one exclusive skill each. The design asks for **different
rules**:

| | **Hop** (A, red) | **Skip** (B, blue) |
|---|---|---|
| Fantasy | Power, all-in, loud | Precision, flow, cool |
| Rope rule | **Heat:** each perfect in a row adds +10% damage to the launch (max +50%). A trip resets it **and** costs extra HP. | **Steady:** perfect window is wider. Perfects build +3 Sync each. |
| Tag-in | Hop's tag hits are heavy (+25% damage) | Skip's tag window is wider (easier combos) |
| Skill 1 | Rhythm Vault (shared) | Rhythm Vault (shared) |
| Skill 2 ✅ | Power Slam: 5 jumps, huge ground damage | Sky Clip: 2 jumps, 3.5× vs flyers |
| Skill 3 ✅ | **Haymaker**: 3 jumps on a half-time rope, breaks shields | **Hopscotch**: 4 jumps, staggers the target (it loses its next attack) |
| Weakness | Trips hurt more | Lower raw damage cap |

Rule of thumb: **Hop wins fights, Skip keeps you alive.** The best runs use both.

---

## 5. Rhythm vocabulary

Each enemy teaches one of these; elites and bosses combine them.

| Concept | Read | Taught by |
|---|---|---|
| On-beat | Jump on the beat | Slime |
| Don't jump | High lane: stay down | Bat |
| Double | Two hits a beat apart | Slime |
| Feint | Dashed fake, then the real one | Bat |
| Half-time | Slow rope, big wall | Stone Shell |
| Reaction | Fast hit, short warning | Stone Shell (burst) |
| Off-beat 🆕 | Hits land between beats | Neon Moth |
| Direction 🆕 | Attack comes from behind (Skip first) | Turbo Bat (air slash) |
| Stay grounded 🆕 | Shockwave hits anyone in the air | Stone Shell (stomp) |
| Split 🆕 | Hop and Skip need different answers at once | Pigeon Pair |
| Silent time 🆕 | Keep the beat when the music drops out | Boombox Crab |
| Tempo change 🆕 | The rope or song shifts mid-fight | Bouncer, Rope-Biter |
| Greed check 🆕 | Stop your combo in time | Bouncer |

---

## 6. Enemy roster

Notation: attacks start on beat 0 (one beat after the enemy's turn begins); `low@4` = low-lane hit
reaching Hop on the "and" after beat 4. Lanes: **low** (jump), **high** (stay down), **wall** (full
jump), **burst** (fast, short warning). 🆕 mechanics marked. Every lane must also differ in **shape
and sound**, not just color (constitution #9).

### Launch roster

| # | Enemy | Look | Attacks (beats) | Rope on its turn | Notes |
|---|---|---|---|---|---|
| 1 | **Slime** ✅ | Sewer slime, wobbles on the beat | WAVE `low@4` · DOUBLE `low@4 low@5` · 🆕 DELAYED `low@4.25` (off-beat) | 1× | First enemy. Teaches on-beat. |
| 2 | **Turbo Bat** ✅ | Flaps twice a beat, fangs | DIVE `high@4` · FEINT `fake-high@3 low@5` · 🆕 AIR SLASH `high@4 from right` | 1×, tight window | Flyer: Sky Clip deals 3.5×. |
| 3 | **Stone Shell** ✅ | Manhole turtle | CHARGE `wall@5` · BURST `burst@3 ×2 speed` · 🆕 STOMP: shockwave on beat 4 hits anyone **airborne** | ½× | Tanky; patience. |
| 4 | 🆕 **Neon Moth** | Glowing moth, flickers like a sign | FLUTTER `low@4.25` · SPIRAL `low@3.25 high@4.75` | 1× | Off-beat specialist. Its light pulses on the off-beat as the tell. |
| 5 | 🆕 **Pigeon Pair** | Two street pigeons, one cap each | SPLIT `low@4 (at Hop) + high@4 (at Skip)` — Hop jumps, Skip stays | 1× | The "dual-rope lite" the original design asked for. |
| 6 | 🆕 **Rope-Biter** | Subway rat with a frayed rope in its teeth | GNAW: until defeated, your skill charges **skip one rope peak** · NIBBLE `low@4` | erratic | Anti-rhythm. Priority target. |
| 7 | 🆕 **Boombox Crab** | Sidewalk crab hauling a boombox, scuttles sideways on the beat | DROP: kills the music for one bar, then `low@2` and `low@3` land inside the silence (keep counting) · BASS `wall@4` | 1× | Can you hold the beat without hearing it? The court line keeps pulsing as the only visual metronome. |
| 8 | 🆕 **Hype Crow** | Crow with a gold chain | CAW: buffs all enemies this wave (+1 hit per attack) · PECK `burst@3` | — | Support enemy. Kill first or suffer. |
| 9 | 🆕 **Vending Mimic** (rare) | A vending machine with teeth | Never attacks. Flees after 3 turns. Drops RP and an item. | — | Treasure goblin; greed tempter. |

### Elite affixes 🆕
Elite waves (every 4th) give one enemy an affix. Each has a **shape** tell on the enemy.

| Affix | Effect | Tell |
|---|---|---|
| Shielded | Only skills, crits or Haymaker break the shield | Hex bubble |
| Armored | −50% basic damage | Riveted plates |
| Hasty | Telegraphs one beat shorter | Speed lines |
| Mirrored | Attacks from the right | Flipped silhouette |
| Echo | Each attack repeats one bar later | Ghost afterimage |
| Sync-Thief | Hits steal 15 Sync | Purple drip |

### Mini-boss 🆕
**Bouncer** (wave 8+, rare): club bouncer gorilla. Greed check: on your turn, tag combos past 3 hits
trigger a counter-punch on the next beat (jump to dodge, then you may continue). On its turn: `wall@4`
then `low@5`.

---

## 7. Bosses

| Wave | Boss | Phases |
|---|---|---|
| 5 | **Giga Slime** ✅ (needs phases 🆕) | P1: WAVE/DIVE/CHARGE. P2 (<60%): splits into two lanes (split low/high). Panic (<30%): DOUBLE with a 4-beat rapid finish. |
| 10 | 🆕 **Bouncer King** | P1: greed counters. P2: **tempo change**: the song is double-time for 8 bars (rope peaks every half beat, airtime shrinks). |
| 15 | 🆕 **Glitch Pigeon** | P1: split attacks. P2: fake telegraphs (dashed lanes that flip solid on the last beat). P3: **swaps Hop and Skip** (buttons stay, positions flip). |
| 20 | Giga Slime **Remix** 🆕 | Old patterns with split telegraphs and delayed second hits. |
| 25 / 30 / 35… | Rotation, each with one mutator applied | — |
| 50 | 🆕 **Giga Glitch** | Everything: Sync theft, inverted waves (stay grounded), swaps, remixed patterns. |

Boss rule: every phase change is announced by the **music** (a drop, a filter sweep), not just text.

---

## 8. Endless structure

| Waves | Feel | Systems |
|---|---|---|
| 1–4 | Learn | Slime, Bat, Shell; one attacker per turn |
| 5 | First boss | Giga Slime |
| 6–15 | Assemble | New enemies introduced one per wave band; first elite at 8; mutator choice at 10 |
| 16–35 | Online | Two attackers per turn; elites every 4; Boombox Crab/Rope-Biter combos; bosses every 5 |
| 36+ | Mastery | All attackers; two affixes on elites; Ascension mutators after each boss; Dual-Rope waves |

**Composition over proliferation:** most new difficulty comes from combining known enemies
(e.g. Hype Crow + Neon Moth = buffed off-beat double hits), not from new mechanics.

### Ascension Mutators (pick 1 of 3 after bosses from wave 10)
| Mutator | Blessing | Curse |
|---|---|---|
| Glass Wire | 2× damage | A trip knocks that rabbit out |
| Heavy Rope | +40% skill damage | Skills need one more jump |
| Rush Hour | +50% score | Every attack starts a beat early |
| Spotlight | +100% RP | Hits taken cost 2× |
| Echo Chamber | Tag windows +50% | Every enemy has Echo |
| Mixtape | Random perk each wave | Random enemy affix each wave |

Mutators stack. Each one multiplies **score**, so leaderboards reward bravery.

---

## 9. Progression

### In a run ✅
RP → shop (items, gear); XP → level-ups (stat or perk every 5th level).

### Between runs: Dutch Legacy 🆕
Legacy Points (earned per wave, saved ✅) spend in a **Legacy tree** on the title screen. Built on
the shell's `UnlockManager` / `RewardManager`. Unlocks over power, per the original design:

| Branch | Examples |
|---|---|
| **Moves** | Haymaker, Hopscotch, Tandem Master Techniques (capstone) |
| **Gear** | Tier 3 gear (Diamond Core Rope, Titanium Core Rope: Power Slam in 3 jumps for 50 Sync) |
| **Encounters** | Start runs at wave 10/20; enable mutators from wave 1 |
| **Style** | Rope colors, outfits, trail effects, title themes |
| **Nudges** | Small, capped global boosts: +5% start RP, +1 starting coffee |

### Tandem Master Techniques (capstone) 🆕
The signature move. Hop and Skip **trade the rope mid-windup**: you alternate A/B on successive
peaks. Each clean trade raises a multiplier; the finisher is a short two-rabbit cinematic. Unlocked
late (Legacy capstone or a boss reward). Must be prototyped on a phone before art budget.

### Armory Meta 🆕
Special waves show a **Rig Alert** one wave ahead ("Heavy Gravity next: light shoes help"). Gear
favors, never hard-counters. Swaps only in the shop.

---

## 9b. World & meta: DRAFT 🆕 (tentative, expected to change as the OST comes together)

**Tone:** playful surreal, with graffiti. **Structure:** fixed district order.

### The overlord: Tripp
An evil jump-rope bunny who took the city's Crown and drained the rhythm from the streets. A
*trip* is the player's fail state, so every stumble is a small win for him. Name undecided:
**Hare Tripp** (the dark mirror of Hop and Skip), **Heir Tripp** (spoiled heir to an old rope
dynasty), **Air Tripp** (rules the rooftops, punishes jumps). Possible: all three are the same
character, spelled differently in graffiti across districts; the real name is revealed at the Crown.
Final fight: a rabbit who plays the rope against you (timing tampering, beat theft). Some bosses
(Glitch Pigeon, Giga Glitch) may be his experiments. No cutscenes needed.

### The city map is the meta
The title screen is a map of the city at night. Districts start dark and light up block by block
as you play. Legacy Points may be reframed as **Rep**; tree unlocks are placed on the map.
Graffiti tells the story: Tripp's propaganda gets tagged over by locals as your Rep grows.

### Districts (draft; mood, tempo and rope twist follow the OST)
| Waves | District | Bosses |
|---|---|---|
| 1–10 | The Block (home alley, laundromat) | Giga Slime (5) |
| 11–20 | Arcade Row | Bouncer King (10), Giga Slime Remix (20) |
| 21–35 | The Subway | Glitch Pigeon |
| 36–50 | The Rooftops | Giga Glitch (50) |
| 50+ | The Crown | Tripp; rotating rematches |

Each district is meant to get its own track.

### Meta goals
- **District mastery:** per-district challenges; finishing them makes that district's lights steady.
- **Crown ladder:** reaching the Crown unlocks Ascension levels, each a permanent mutator.
- **Rabbit mastery:** separate Rep tracks for Hop and Skip.

### Parked
- Daily: revisit once the music is done.
- Rival crews: cut.

Implementation notes: new map/mastery save fields need a `SAVE_VERSION` bump and migration
(existing Legacy carries over); district enemy pools use the seeded streams.

---

## 10. Refinements to the original concept 🆕

1. **Swagger is the theme.** With no story, *style* is the motivation. Results rank ✅ becomes a
   live **Swag meter** during runs: perfects, tags and dodges fill it, hits drain it, its tier
   (D→SS) multiplies score and changes the music mix (stems).
2. **On-beat menu taps.** Choosing Attack/Skill exactly on the beat gives a small damage bonus.
   Makes the music matter on your turn too.
3. **Hazards differ by shape and sound,** not just red. Low = rolling wave, high = slashing line,
   wall = brick, burst = spark. Fakes are dashed *and* silent.
4. **Accessory slot** gets 3+ items or merges into Hat. A one-item slot is shopping friction.
5. **Downed rabbits revive at 30% between waves** ✅ (keeps runs alive); revive insurance can be
   an RP purchase later, as the original design suggested.
6. **Co-op (later):** the shell's companion session lets Player 1 play Hop and Player 2 play Skip
   on their own phones. A natural fit for a two-rabbit game.

---

## 11. Build status & next steps

| Area | Status |
|---|---|
| Core loop, tutorial, shop, levels | ✅ |
| Beat-locked rope, attacks, world | ✅ |
| Saves, settings, accessibility, gamepad, PWA, achievements, bestiary, results, daily | ✅ |
| Sprite animation system (art pending) | ✅ |
| Hop/Skip rule identity (Heat, Steady, tag differences) | ✅ |
| Third skills (Haymaker, Hopscotch) | ✅ |
| New attacks for existing enemies (delayed, air slash, stomp) | ✅ |
| New enemies 4–9, elite affixes, Bouncer | ✅ |
| Giga Slime phases (Crossfire below 60%, Panic below 30%) | ✅ |
| Bosses 10/15/20/50 | ✅ |
| Mutators, Legacy tree, Tandem Master, Rig Alert | ✅ |
| Swag meter | ✅ |
| Music stems reacting to Swag | ⬜ (needs stems from the composer) |

**Suggested order:** Hop/Skip identity → existing-enemy attacks → Giga Slime phases → Neon Moth,
Pigeon Pair, Boombox Crab → elites → Legacy tree → mutators → remaining enemies/bosses → Tandem.

### Open questions
- A light story or crown? (Hop & Skip "just out there swaggin" works for now.)
- Final names for 🆕 enemies and moves (expected to evolve through playtesting).
- Which song(s) play where: one track per city zone, or one per boss?
