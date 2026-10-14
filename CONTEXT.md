# CONTEXT — Timepiece (working name)

Premium, extremely detailed clock website. Settled via `/grill-with-docs`, started 2026-09-28.

## Glossary
- **Showpiece** — the site IS the clock. A standalone portfolio / freelance demo piece; not tied to any brand or client. Its job is to make a visitor say "who built this?".
- **Grand Complication** — what the showpiece is: one timepiece carrying every kind of detail Kai picked. Real horological term (a watch with many complications).
- **Movement** — the core: the mechanical engine (gear train at true ratios, escapement, balance wheel). Everything else is driven by or mounted on it.
- **Complication** — any readout beyond hours/minutes/seconds. Two families here:
  - *Astronomical* — sun & moon position, moon phase, zodiac, sidereal time, sunrise/sunset for the visitor's location.
  - *Precision* — milliseconds, UTC + local offset, drift vs atomic time, multiple time scales.
- **Photoreal** — a rendering quality (materials, light, depth), not a detail type. Applies to the whole piece.
- **Scroll story** — the page. Hero = the live watch; scrolling takes it apart and puts it back together. The camera travels so the small detail can actually be seen.
- **Chapter** — one scroll stop in the story. Each chapter shows one part or one complication up close and says what it does.
- **Exploded view** — the watch pulled apart along its axis into layers (crystal → hands → dial → movement → caseback), still ticking in the right time while apart.
- **Living Sky** — the visual direction. The page background follows the real sky at the visitor's location (dawn → day → dusk → night); the watch's reflections take the same light. Opening it at 21:00 and at 13:00 gives two different pages.
- **Sun position** — the one calculation (sun altitude for the visitor's time + place) that drives the day/night disc, the page sky and the scene lighting. One source of truth.
- **Aventurine dial** — the watch's dial: dark blue glass with metallic flecks, reads as a starry night sky. Carries the moon-phase window.

## Decisions (lightweight)
- Standalone, not Canopus / سهيل — `D:\Coding\by-zeus-watches` brand DNA does **not** apply. Direction is proposed fresh.
- Kai picked all four detail types (mechanical, astronomical, precision, photoreal) → framed as a Grand Complication: movement = core, astronomical + precision = complications, photoreal = rendering.
- Full 3D in three.js, procedural geometry, drag to flip to the caseback → [ADR 0001](docs/adr/0001-full-3d-webgl-rendering.md).
- Page = scroll story (not a free inspector, not a lone viewport) — the detail is invisible at full-dial scale, so the story drives the camera to it.
- **v1 = movement + moon phase + day/night.** Nothing else ships in v1.
- **Later (not v1, not deleted):** zodiac ring + sidereal time · foudroyante + GMT hand · timegrapher chapter (your clock's drift vs atomic time).
- *Default (Claude's, object to change):* location for sunrise/sunset is guessed from the visitor's timezone, with a "Use my exact location" button — no permission prompt on load. Moon phase needs no location.
- **English only.** Roman numerals on the dial. No Arabic/RTL in v1.
- **Direction = Living Sky.** Tokens: night `#0B1020` · dusk `#3A2B4A → #C9785A` · day `#C9D6E3` · moon `#E8E4D8` (text/accent). Type: **Bodoni Moda** (display, used sparingly) + **Inter** (body + tabular readouts) — two families, per workspace conventions. Watch: steel case, aventurine dial, gold moon.
- **Dial signed "K. SHAHEEN"** under XII, like an independent watchmaker signs a piece. Page title: *K. Shaheen · Grand Complication*.
- **Taste pass (Kai, mid-build: "use taste skill and all of the good stuff")** — `design-taste-frontend` + `high-end-visual-design` loaded. Design read: *premium consumer showpiece for portfolio viewers and prospective clients, cinematic 3D language, leaning toward native CSS + three.js + scroll-driven camera.* Dials: VARIANCE 7 · MOTION 7 · DENSITY 3. Consequences:
  - **Inter → Geist** (taste bans Inter as default; workspace conventions list Geist). Type = Bodoni Moda + Geist.
  - Bodoni Moda justified: dial printing has used Didone type for two centuries — genre-true, not "serif = premium".
  - Zero em-dashes in visible copy · no numbered chapter eyebrows · no scroll cue · hero ≤ 4 text elements, not centred · chapters vary layout (no 3 same splits in a row).
  - Icons = Phosphor Light only. Fonts self-hosted (Fontsource), not a Google Fonts `<link>`.
  - Custom cubic-bezier easing only; no `scroll` event listener (the render loop reads scroll position).
  - Living Sky replaces a light/dark toggle. So a daytime visitor can still see the night dial, the day/night chapter gets a **"try another hour" slider** that previews the sky (it never changes the watch's time).
- **Claude builds all the code.** Kai owns taste, review and sign-off. This is a shipped showpiece, not a `.Kai` rep — reps stay on LeetCode / the Node course.
- Text must pass contrast at *every* sky state, not just night — check each keyframe, not one screenshot.
- *Default (Claude's, object to change):* tick sound exists but is **off** until the visitor turns it on.
- *Default (Claude's, object to change):* stack = **Vite + plain TypeScript + three.js**. No React / Framer Motion — one scene plus scroll text doesn't need them. Deliberate departure from `_template-website`.
- **Ship date: v1 lands this session (2026-09-28)**, verified in the browser, then Kai reviews. After review, changes are a written punch list only — no open-ended polish.

## v1 is done when
1. **Hero** — the live 3D watch shows the correct local time; dial signed K. SHAHEEN; aventurine dial; moon window; day/night disc.
2. **Movement** — gear train turns at true ratios for a real reference movement; escape wheel steps once per beat; balance swings at the beat rate; visible through the caseback.
3. **Moon phase** — shows tonight's real phase (checked against a published source for 2026-09-28).
4. **Day/night** — sunrise/sunset for the timezone-guessed location; "Use my exact location" button works.
5. **Living Sky** — page background follows sun altitude; body text ≥ 4.5:1 contrast at night, twilight and day.
6. **Scroll story** — chapters: hero → crystal lifts → dial lifts → movement explodes → moon phase → day/night → reassembles. Watch keeps correct time throughout.
7. **Drag** — drag rotates the watch; turning it over shows the caseback.
8. **Tick sound** — toggle, off by default.
9. **Quality floor** — works at 375 px; visible keyboard focus; `prefers-reduced-motion` respected; a plain notice if WebGL is missing; lower quality tier on weak devices.
10. **Clean build** — `npm run build` passes; no console errors.

## v1 status — 2026-09-28 (built + browser-verified this session)
| # | Criterion | Status |
|---|---|---|
| 1 | Hero: live time, signed dial, aventurine, moon window, day/night disc | ✅ verified (desktop 1440×900, 800×600, mobile 375×812) |
| 2 | Movement at true ratios, escape steps per beat, balance at beat rate, visible through caseback | ✅ ratios asserted in `npm run check`; caseback view verified |
| 3 | Moon = real phase | ✅ anchored to three 2026 eclipses (3 Mar, 12 Aug, 28 Aug) in the check; showed 98 % waning gibbous on 28 Sep, consistent with the 26 Sep full moon. Not cross-checked against a Sep-28 lookup site. |
| 4 | Sunrise/sunset from timezone; "Use my location" | ✅ timezone path (Cairo 06:46 / 18:44). ⚠️ "Use my location" untested in-browser — it raises a permission prompt only Kai can answer. |
| 5 | Living Sky + contrast ≥ 4.5:1 | ✅ worst 5.03:1 across −30°…90°, including over pure white and black (check) |
| 6 | Scroll story, 8 chapters, time kept throughout | ✅ every chapter screenshotted |
| 7 | Drag turns it; caseback reachable | ✅ pointer drag + arrow keys verified |
| 8 | Tick sound toggle, off by default | ✅ state/label/icon verified (audio itself not audible to Claude) |
| 9 | 375 px, focus, reduced motion, no-WebGL notice, low tier | ✅ 375 px (no horizontal scroll), focus ring, reduced-motion path (`?still` uses it), notice renders. ⚠️ adaptive low tier: code path only, never triggered on this machine. |
| 10 | Clean build, no console errors | ✅ `tsc` 0, build passes (Vite's generic >500 kB chunk note = three.js), no runtime errors |

### Decisions made during the build
- **Reference movement = Unitas 6497-2** (21,600 vph / 3 Hz) — the only 6497 variant with published tooth counts. Barrel 75 / centre pinion 10 is a labelled stand-in. See `docs/research-2026-09-28.md`.
- **Sky drawn in WebGL, not CSS** (`src/skyMesh.ts`) — the sapphire's transmission can only refract what WebGL drew; a CSS sky made the lifted crystal a grey disc.
- **Crystal is anti-reflective coated** (specular 0.35, blue-violet) — physically right for luxury sapphire and it stopped the crystal reading as a mirror.
- **Main plate ruthenium (dark), bridges rhodium** — the gold train reads against it.
- **24-hour times** everywhere, matching the 24-hour disc.
- **`?still`** URL flag = reduced-motion behaviour (poses snap). For screenshots; harmless in production.

## Punch list after Kai's review (finite — nothing else goes into v1)
Review 1 (2026-09-28): *"the parts are super low quality"*. Diagnosed from close-ups:
1. **Lighting** — RoomEnvironment is soft and even, so metal reads as plastic. → custom studio env: dark room, softboxes + strip lights.
2. **Bridges** — uniform "sausage" capsules; Côtes invisible. → tapered hull-of-circles arms, polished 45° anglage on the sides, stripes painted into colour + roughness.
3. **Screws** — flat blue discs. → domed heads with real slots, slots aligned (a haute-horlogerie habit).
4. **Jewels** — ruby hidden, only a gold ring shows. → domed ruby proud of a polished countersunk chaton.
5. **Wheels** — flat gold cut-outs. → circular-grained faces + polished chamfered edges.
6. **Main plate** — perlage too small → moiré. → ~1.2 mm circles overlapping ⅓ (the real spec).
7. **Hairspring** — too many coils, glows as a blob. → fewer, darker blued coils.
8. **Case / lugs / crown** — one flat band; lugs are strips; crown is a gear. → polished chamfers vs brushed flank, tapered lugs, crown with a domed cap.
9. **Caseback artefacts** — jagged fragments on the inner edge. → find and fix.

**Status (same day):** 1–7 and 9 ✅ done and verified in full-resolution renders (headless Edge via puppeteer-core — the Browser pane can't paint while hidden). 8 ✅ case (polished chamfers vs brushed flank), crown (knurled grip, collar, domed cap), tapered lugs — ⚠️ lugs still show some banding from the strip lights on their rounded edge; acceptable, not perfect. Causes worth knowing:
- Lighting was tuned twice: black walls → steel read black chrome and gold read bronze; a flat diffuser behind the camera → everything washed out and Côtes vanished. What works: dim grey walls + a diffuser whose lower edge sits just above the straight-back reflection line.
- Mirror-flat gold facing the camera reflects the wall and reads black → hands and moon need a little roughness.
- 9 was the back crystal (r 15.4) cutting into the ring's 15.3 mm bore.
- Rubies: at ~10 px, clearcoat highlight covered the dome (cream); transmission showed the bridge through it (pink). Opaque, lower specular → red.

## Pivot — v2: a real watch (2026-09-28, Kai)
Kai: *"it looks great but can we use a real watch now?"* → the **Piaget Polo Skeleton, 18k rose gold, blue skeleton** (reference image from Swisswatches Magazine's Polo article). *"I want the highest quality possible and the most detail."*
- **Exact replica** (Kai's pick): hours + minutes only, like the real watch. **Supersedes** v1's moon phase, day/night disc, small seconds, aventurine dial and the 6497 train. Those chapters are removed; the **Living Sky page stays**.
- **Replica** — the glossary term now means: every visible part matches the real Polo Skeleton (case, cushion bezel, indices, hands, skeleton calibre 1200S1 front and back, micro-rotor). Where the real part is unpublished (e.g. 1200S1 tooth counts), the part is modelled and **labelled as modelled** — never claimed as Piaget's.
- **Branding = full fan study** (Kai's pick, risk explained): PIAGET at 10 and SWISS MADE at 6 as on the real dial, plus a plain page note: *"A study of the Piaget Polo Skeleton. Not affiliated with Piaget."* The wordmark is set in a close serif, not copied from Piaget's logo file. The dial is no longer signed K. SHAHEEN; Kai's credit moves to the page. ⚠️ If it's ever published, the non-affiliation note must stay visible (it's what keeps a fan study from reading as Piaget's own page).
- **Geometry stays procedural** (ADR 0001 holds): no ready-made or licensed model of the Polo Skeleton was found (TurboSquid / CGTrader / Free3D search, 2026-09-28). A procedural rebuild is also the only way every wheel moves at its true rate.
- *Default (Claude's, object to change):* the **blue alligator strap with rose-gold buckle is modelled** — it's part of the real watch, and the reference photo shows it.
- *Default:* chapters become **hero → the case, 6.5 mm thin → a cushion inside a circle → the skeleton, from the front → the 1200S1 exploded → the micro-rotor, from the back → back together**.
- *Default:* page title **"K. Shaheen · Polo Skeleton, a study"**. "Grand Complication" no longer fits: the real watch is time-only.
- Known so far (Swisswatches): 42 mm, 6.5 mm thick, 18k rose gold, round case with a cushion-shaped dial opening, polished + brushed surfaces, in-house calibre **1200S1**, skeletonised, **2.4 mm**, blue or grey PVD treatment. Full spec pending research → `docs/research-polo.md`.

### v2 build + reviews (2026-09-28/29)
- Built from `docs/research-polo.md` + the reference photo: `polo.ts` (case, cushion bezel, flange, indices, hands, crown, caseback, strap) and `calibre.ts` (1200S1 layout — barrel 12–1, keyless 3, escapement ~5, balance 6, micro-rotor 8–10 swinging with gravity, automatic train on the back following it).
- Research corrected my photo reading: the silver disc at 12–1 is the **openworked barrel** (mainspring), not the balance; the balance is at 6.
- **Review 2 — "quality is super low"**. Root causes were rendering, not models: (1) the pane runs at DPR 1 → now supersampled at 2× on desktop; (2) the canvas buffer was sized from `innerWidth` (includes the scrollbar) → a 2% resample blur → now sized from the canvas's client box; (3) the watch's lights followed the real sun, so at night the product went dark and muddy → studio light is now constant, only the backdrop follows the sky; (4) flat blue → Piaget's **sunburst satin** via an anisotropy *direction* map (tangential per pixel), + wider polished bevels as bright bridge outlines. Tried bloom, removed it: even subtle, it hazed the polished bezel into the background.
- Also: denser plate (lobes + wider arms), keyless wire springs, click spring, irregular alligator scales, satin rose gold for hands/indices, PIAGET moved into the flange band, rotor engraving un-mirrored (rotateY, not rotateX).
- ⚠️ Not yet verified: frame rate on Kai's Radeon 660M at 2× (the pane was hidden when measured). The quality tier steps down automatically (2× → 1.5× → no shadows/glass) if frames run long.
- Known remaining gaps: lugs still read a little boxy; the micro-rotor is a large grey mass at 9 in the hero; upper strap catches a broad highlight.
- **Review 3 — "continue" (2026-09-29)**, all 7 chapters re-shot at 1440 × 900 and one at 375 × 812:
  - **Rotor** now sits under a blue cover plate with an **arched window** (as on the real 1200S1). The grey slab is gone; the rotor and its engraving show only through the window.
  - **Caseback engraving was rendering as dots.** Canvas font shorthand had size before weight (`40px 500 Geist`), which is invalid, so the canvas silently fell back to 10 px. Fixed; SWISS / MADE / PIAGET / Au750 are now legible.
  - **Exploded view re-staged** like a watchmaker's drawing: the movement lifts out of the case, the case drops below it, the straps slide off the lugs along y (`EXPLODE_AXIS`), and the camera is higher. The crystal edge got an un-coated glint so the lifted crystal isn't a black disc.
  - Closing pose lifted clear of its copy; the statement heading clears the nav; `?still` also freezes the CSS fade-in, so screenshots aren't caught mid-blur.
  - Strap sheen tempered (higher roughness, lower specular).
- Remaining: lugs a touch boxy; the exploded crystal sits partly off-frame at 1440 × 900; FPS on the 660M at 2× still unmeasured.

## v3: realism rebuild, no personal brand, 60 fps (2026-10-14, Kai)
Kai: *"remove my name from it, I am only the dev — give me credit but I am not the brand"*, then *"redo the model, super realistic, super high quality"*, then *"audit the website, it has unneeded stuff, and make it 60fps"*.
- **Branding**: the nav wordmark is **TIMEPIECE**, the page title *Polo Skeleton, a study*. Kai's name appears only as credit (footer + README: "Designed and built by Khairy Shaheen"). Supersedes the "K. Shaheen" title defaults above.
- **Case rebuilt** (`polo.ts`) from Monochrome's press photos: one revolved section for the case middle (polished rounded lower edge, horizontally brushed flank, polished lip); bezel round outside / cushion inside with a brushed east–west top, rounded polished outer edge and a crisp polished chamfer; **lugs lofted out of the flank** (flared root inside the band, drooping 1 mm toward the wrist, squircle tips) — the old lugs never rendered at all (see bug below); fluted crown with a medallion face; strap that butts against the case flank; caseback ring as a revolved section with mirrored-uv engraving.
- **Alligator strap**: domed rectangular centre scales with leaning shared edges, half-height scales either side, small round scales toward the stitching, fine wrinkles, painted edges; height-driven normal, roughness **and AO map** (rough creases alone caught the overhead softbox and read lighter than the scales).
- **Studio env**: softboxes with feathered falloff and hot centres + two small hard kickers, PMREM 512² on the high tier.
- **Movement**: pierced rubies with oil sinks and steel pivots, ribbon hairspring (was a 1-px line), sunburst satin toned down.
- **Bug that hid parts since v2**: `mergeGeometries` drops material groups, and a mesh with a material **array** but no groups draws nothing — the lugs and the barrel's drum/cover were invisible. `mergeGroups` in `calibre.ts` keeps them.
- **Bug**: LatheGeometry faces a profile's left — a profile running outward from the axis faces down (jewels were culled). Run profiles rim → axis.
- **Tried and removed** (don't retry without a reason): GTAO ambient occlusion (barely visible beside the shadow map; 20–45 ms/frame on the 660M close-up even at half res) · bloom (third time: lugs glowed like lamps) · PVD iridescence (went purple) · **crystal transmission** (re-rendered the whole watch every frame for an invisible refraction offset; 75 → 8 ms in close-up when removed). The sapphire is now a reflection-only additive material.
- **60 fps** (measured on Kai's Radeon 660M, headless Edge D3D11): shadow map redrawn every other frame; only parts whose shadows show cast them (not straps/lugs/crown/case middle); movement arcs 64 → 32 segments. Dynamic resolution: each second whose 75th-percentile frame misses 60 Hz drops the pixel ratio 0.25 (2 → 1), then shadows; never steps back up. Settles ≈ 1.5× on the hero, 1× in close-ups; p90 ≤ 17 ms in every chapter but the skeleton close-up.
- **Audit cuts**: tick sound + hour-preview slider (Kai's pick); dead sunrise/sunset readouts and `sunTimes`; v1 6497 leftovers in `train.ts`; unused anchors and `meshDistance`; `scripts/zones.mjs` + `moment-timezone` (zones.json stays, regenerate by hand if ever needed); `docs/research-2026-09-28.md` (v1 research). Kept: Use my location, drag hint.

## Open questions
- Where it's hosted (Vercel / GitHub Pages / portfolio link) — decided at ship, not now. Publishing asks Kai first.
- Project Board: this project isn't listed yet. It belongs to the Freelance lane as a portfolio showpiece — Kai's call whether to add it.
