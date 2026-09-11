// ---------------------------------------------------------------------------
// Coronation Day Elsa
//
// The activation does not clear anything. It opens a freeze window -- 5s at
// skill level 1 up to 10s at level 6, `durationMs` -- and while it is open every
// chain linked freezes a line of tsums across the board, drawn between the
// chain's first and last tsum. Frozen tsums pile up, and one tap on any of them
// sets the whole pile off at once.
//
// So this is the only skill here whose choreography is *playing*, not aiming.
// The goal inside the window is coverage: freeze as much of the board as the
// chains on it allow, then set the lot off with one tap.
//
// ## One tap sets the pile off, so nothing may touch ice until the end
//
// That single-tap trigger is the hazard the whole window is played around: any
// contact with a frozen tsum spends the entire pile on however little has been
// drawn so far. This skill has popped prematurely three ways, all eliminated
// here and worth keeping on the record:
//
//   - **it burst after every pass.** A pass ends the moment the model stops
//     offering chains, so a starved scan made "one chain, then a 25-tap grid
//     sweep, pop" -- a tiny burst that looked like a stray bubble sweep. Now a
//     burst is a decision, never a reflex, and the decision is "no more chains
//     can be made": it fires when fresh captures keep agreeing the board is
//     played out with a real pile standing (`earlyBurst` in the config) --
//     refreezing the refill when there is window left to do it in, closing out
//     when there is not -- and the clock forces it only when just
//     `burstTailMs` of window remains, enough for the burst's own taps.
//     Passes keep capturing and chaining right up to that line. Between
//     bursts the only taps sent are the chain drags.
//   - **a drag could land on real ice the model called free.** Two ways in: the
//     band measurement bounds its half-width between 16 and 27px, and the model
//     claims only the lower bound, so a tsum in the ring between them can be
//     real ice while still in the plan; and a board mid-freeze carries ice at
//     more than one shade, so reading only the biggest ice cluster left the
//     other shades planned over. Now the ring is *quarantined* -- dropped from
//     planning without being counted frozen, until a later capture reads back
//     what it really was -- and every cluster inside the frozen colour box is
//     treated as ice, not just the biggest.
//   - **the next drag went out before the ice was there, and beside where it
//     landed.** Seen on device, not in the model: `coronation_elsa_debug1.mp4`
//     at 13.68s pops a 16-tsum pile for 94,680, 33ms after a 15-chain froze,
//     where the clean window at 1.9s took 106 tsums for 1,626,542. Two causes,
//     one on each axis. In time, `chainSettleMs` was 0 for the skill's whole
//     history, so the margin listed below was never actually taken. In space,
//     that chain snaked down the left of the board and froze *along its path*,
//     nowhere near the line through its ends -- which was all the quarantine
//     modelled. Now the wait is real, `elsaPathBandCover` quarantines the path
//     too, and `maxChain` bounds how far a chain can snake off its own ends.
//   - **a live tsum colour read as ice, and the phantom pile pulled the
//     trigger.** `coronation_elsa_debug2.mp4`: an event board whose palest
//     tsum sits inside the frozen colour box, so every scan read a standing
//     dozen-tsum "pile". That one misread fired everything at once: the
//     played-out confirmation was permanently satisfied, so each dry spell
//     burst early -- and the burst's blind grid popped whatever real ice the
//     last chain had just frozen (16.9s: one 10-chain, popped ~half a second
//     later). See "Reading the board through the ice" for the whitelist that
//     answers it, and note the blind grid now backs the *closing* burst only.
//
// Three margins on top of that, for a live device rather than the model:
//
//   - every chain is followed by `chainSettleMs`, so it registers and its band
//     starts forming before the next drag goes out;
//   - a candidate whose *drag* would pass within `dragClearance` of known ice
//     or a read bubble is not drawn -- `elsaPathIsClear` -- because a linkable
//     hop (47.5px) is wider than a narrow band, so a chain can straddle one
//     that a rescan has read back by colour with the line geometry forgotten,
//     and a bubble touched mid-drag pops and ends the chain there;
//   - after the burst the choreography keeps the board for `postBurstSettleMs`
//     (sweeping the bubbles a clear that size earns), then waits out the
//     window's tail, so the play loop's first chain cannot freeze a stray band
//     in the dying moments.
//
// ## The board does not move, which is what makes this cheap
//
// Measured off the four captures in `corpus/_unlabeled/Coronation_Day_Elsa`, by
// differencing consecutive frames over the cells that are unfrozen in both: the
// board reads 6.1 and 11.7 mean absolute difference per channel across frames
// two seconds and a new freeze band apart. The control is the same frame against
// itself displaced by a third of a tsum, which reads 64. So a chain drawn during
// the window freezes a band and clears nothing -- no erase, no collapse, no
// refill -- and the combo counter standing still at 11 across all four frames
// says the same thing from the HUD.
//
// Two consequences, and they are the shape of everything below:
//
//   - **one capture per pass, not one per chain.** Positions taken at the start
//     of a pass stay true for the whole of it, so re-scanning between chains buys
//     nothing and costs 200-300ms of a 5-10 second window.
//   - **what froze is modelled, not read.** The script drew the lines, so it
//     knows where the ice is. The model is a union: everything within
//     `bandHalfWidth` of the line through a chain's two ends (`elsaBandCover`),
//     everything that close to the path actually drawn (`elsaPathBandCover`),
//     and the chain's own tsums. The end line alone was not enough -- see the
//     third premature pop above.
//
// "Does not move" has three exceptions, and all of them are falls: the window
// opens on the refill from the batch the play loop linked just before
// activating, a pop leaves a gap for tsums to slide into, and a burst empties
// a pile's worth of board for the refill to drop through. A capture taken
// mid-fall reads tsums where they are passing through, and a chain drawn from
// it drags at air and freezes a gap into the pile. All three moments are
// ice-free by construction, which is where the settle gate in `elsaFreezePass`
// sits: an ice-free look that reads clearly fewer tsums than the board is
// known to hold (`settledFraction` of the best count seen) is a board
// mid-fall, waited out (`settleRetryMs`) and retaken rather than chained.
// Ice-free only, so the known under-read of an iced board -- frozen clusters
// eat colour slots, see the last section -- can never stall a pass.
//
// A pass that runs the model dry with window left does take a fresh capture --
// not because the board moved, but because the model errs on purpose: the
// quarantine ring above writes off more than is really frozen, and the capture
// reads it back. Real ice lands in the frozen cluster; a free tsum comes back
// free, and the next pass gets to chain it.
//
// ## Choosing the chain
//
// The chain cannot be aimed. It has to be same-coloured and connected, so the
// line through its ends is whatever the board offers rather than a direction that
// can be asked for -- there is no way to say "now do a horizontal one". What can
// be chosen is which of the chains that exist to draw next, and `elsaNextChain`
// is that choice: the one whose band takes the **least** off the board.
//
// That is the opposite of the obvious rule and it is what measured best, because
// freezing and consuming are the same act -- see the numbers on `elsaNextChain`.
// What comes out of it is close to the sweep the obvious rule was reaching for:
// narrow bands, drawn one after another, each over ground the last one left.
//
// So a pass is: capture once, then loop -- plan over the tsums the model still
// believes are free, take that chain, draw it, mark its band and its quarantine
// ring, and go again. `calculatePaths` is pure and takes no capture, so the loop
// costs drags and arithmetic only.
//
// Both chain settings are ignored in here: there is no per-scan chain limit to
// apply because there is no per-chain scan, and the length cap is the window's
// own `maxChain` rather than the setting's. It sits at 10, where a sweep from 4
// to 10 moved coverage by a single point -- so the bound costs about a point,
// and it buys a limit on how far a chain can snake off the end line.
//
// The window works the board **bottom-up** (`bottomFirst`), and that took two
// halves to make free. Ordering the candidates by height on its own costs about
// a point -- 66.6% against 67.4% -- and picking the lowest is worth the same as
// picking the highest, so it was choice thrown away rather than a direction
// earned. What pays for it is asking `calculatePaths` for low *starts*: the DFS
// tries its starts in degree order, ties are the common case, and breaking them
// by board position anchors each candidate at the bottom of its own component
// without costing a single tsum of length. Ordering those anchors is then free
// -- 67.1% against 67.0% at 1000 boards -- because the bottom chain is now also
// a chain worth drawing.
//
// Free, note, and not better: these are boards on a centred lattice, so the
// harness scores the discipline and not the bottom. Nor is there an argument
// from the board's physics -- a chain clears nothing, so nothing falls while
// the window is open, which is why `elsaBurstFrozen`'s taps go top-down and the
// chains have no reason to follow them. What it buys, if anything, is on a real
// board: a pile is dense at the bottom and ragged at the top, and a window that
// runs out of clock has then spent it on the half with the tsums in it.
//
// The limit worth knowing about: `calculatePaths` returns the *longest* chain per
// colour component, so the pick is the best of a handful of candidates rather
// than the best chain that exists. Generating candidates by endpoint separation,
// or by band offset, is the next lever if coverage turns out short on a device.
//
// ## Bubbles hole the bands, and break the chains drawn over them
//
// A bubble on the board hurts the window twice. It is a tsum-sized hole in
// every freeze line drawn through it; and a drag whose travel crosses it pops
// it *mid-drag*, which ends the chain right there -- a short chain, a short
// band, and from the outside "the chains are disrupted whenever a bubble is
// around". A big burst *earns* bubbles, so left alone each burst seeds the
// next one's disruption. Four answers, cheapest first: `beforeActivate` spends
// whatever the cycle's own scan still holds, aimed, before the window opens; a
// pass that reads an ice-free board with bubbles on it pops them aimed off its
// own capture and looks again after the fall, up to twice, so no chain is ever
// planned off pre-pop positions (see `elsaFreezePass`); a bubble that survives
// to the chaining -- unpoppable under standing ice, or missed -- becomes a
// *drag obstacle*, kept clear of by the same `elsaPathIsClear` check that
// keeps drags off the ice; and the post-burst blind sweep stays behind all of
// it, for bubbles `findGameBubbles` misses -- its radius range is reasoned,
// not yet calibrated. Aimed pops only ever happen with no ice read, because a
// tap is what sets a pile off.
//
// ## Reading the board through the ice
//
// A frozen tsum still detects as a circle and still gets a colour, so it becomes
// an ordinary colour cluster. Every cluster inside the frozen colour box is
// treated as ice -- its tsums are never planned over (a drag onto one is the
// premature pop above) and never counted as coverable. `orderPaths` runs the
// same read for the play loop's own scans, and any ice it sees there is
// leftover by definition -- the choreography waits out its own window -- so it
// bursts it on sight rather than only filtering around it.
//
// The box has a converse hazard, and it is the fourth premature pop above: a
// live tsum can sit inside it. The event board in coronation_elsa_debug2.mp4
// carries a pale ice-blue fluffy tsum whose cluster reads (h~99, s~95-100,
// v~214) through the scan path -- in the box -- so every scan flagged a dozen
// live tsums as a standing pile. One false colour poisons everything at once:
// the board's biggest colour is never chained, the phantom satisfies
// `earlyBurst.minIced` for ever, the settle gate and the aimed bubble pops
// never run (both need an ice-free read), and between windows every scan
// "bursts" the phantom -- ~28 taps at nothing, every scan.
//
// The answer is a whitelist read when ice is impossible. Until the round's
// first window opens no ice can exist, so any cluster the box matches on
// those scans is a live colour: remembered for the round (`elsaIceAlikes`),
// never flagged frozen after that. Real ice measured clear of that board's
// ice-alike -- less saturated and brighter, ~24 away in cluster HSV against
// the `iceAlikeMatchDist` bound of 15 -- so the whitelist cannot eat a true
// pile whose shade stays where it was measured.
//
// Where the colour box came from, and what it is not, is `CoronationElsaConfig`
// under "Tuning data" above.
//
// ## The ice used to eat the board's colours, and that was most of the loss
//
// The board scan keeps its biggest `uniqueTsumCount - 1` colour clusters --
// four in an ordinary game -- and a frozen tsum is an ordinary cluster to it.
// So every shade the ice reads at took one of those four slots, and with ice
// measured at three shades that left *one* live colour of five. A colour
// without a slot is not merely left unchained: it is not in the board array,
// so no pass can plan over it and no capture hands it back.
//
// That is what "there were obvious chains it never drew" was. Costed on the
// harness at `--slots=4 --iceShades=3`: coverage 48.5% against 57.8% with every
// colour visible -- nine points, more than any selection rule in this file is
// worth -- and the leftovers concentrate where the ice is not, which under the
// bottom-up sweep means the top and the sides.
//
// The answer is `extraClusterSlots` on the skill declaration, four of them:
// three for the measured ice shades and one for the colour the ordinary cut
// drops. Declared rather than set while the window is open, because the scans
// *between* windows are what `elsaIceAlikes` learns from -- a pale live colour
// that only appears once the window widens the cut is a colour the whitelist
// never saw, which is the phantom pile again. Recovery is monotonic in the
// harness: 5 slots 54.7%, 6 56.2%, 7 57.2%, 8 57.8%.
//
// ## Known, and left for a second iteration
//
// Ice at more than three shades still costs a live colour, and a board whose
// ice reads at one shade spends three slots to find that out. Sizing the
// allowance off what the last scan actually read as frozen would fit both, and
// needs the scan to hand back what it dropped.
// ---------------------------------------------------------------------------

// --- Tuning data ---------------------------------------------------------
//
// ## Reading a frozen tsum
//
// A frozen tsum is drawn as pale blue ice over whatever it was, which puts it
// somewhere no ordinary tsum on these boards sits: bright, and barely
// saturated. `frozen` below is that box, in the HSV `findTsums` samples and
// `classifyTsums` averages into a cluster centre (hue 0..179, OpenCV's range).
//
// Measured off corpus/_unlabeled/Coronation_Day_Elsa (four captures, one board
// with no freeze on it and three with progressively more) against every
// corpus/GamePlaying frame, through the real capture path with the scan's own
// HSV conversion and 22px blur reproduced over it. Frozen clusters came out at
// (h 103, s 74, v 222), (h 107, s 79, v 222) and (h 116, s 62, v 229); the
// nearest thing to them anywhere else was an ordinary blue Sadness tsum at
// (h 108, s 131, v 174) on the same boards, and a pale end-of-round flash at
// (h 142, s 73, v 216). Saturation is what separates the first pair and hue the
// second, and both margins are wide.
//
// NOT MEASURED ON A DEVICE. The sampling above is a grid over the play square
// rather than the circle centres `findTsums` reads, because the offline host
// shim has no houghCircles -- so treat these as the box the *colours* sit in,
// which is what they are, rather than as a device calibration.
var CoronationElsaConfig = {
  // How long the freeze window stays open, by skill level 1-6, in ms.
  durationMs: [5000, 6000, 7000, 8000, 9000, 10000],
  // The activation animation, waited out before the first scan.
  //
  // NOT MEASURED. It is also unknown whether the game starts the window at the
  // activation tap or when the animation ends; this assumes the tap, which is
  // the pessimistic reading and costs a scan rather than a missed burst.
  leadInMs: 600,
  // The slice of the window the closing burst's taps actually need -- the
  // aimed taps plus the blind grid, ~28 taps of round time. This is the only
  // time reserved off the clock now: passes keep capturing and chaining until
  // just this much window is left, and the burst fires earlier only when
  // fresh captures confirm no more chains can be made (see `earlyBurst`).
  // Replaces `burstLeadMs`, which parked the board for the last 900ms.
  burstTailMs: 600,
  // The least room before the burst deadline worth starting a fresh pass in:
  // a capture plus one chain. With less than this left, the capture alone
  // would push the burst's own taps out past the window's close, for a look
  // nothing could act on -- so the burst fires instead.
  passMinMs: 400,
  // Longest chain the search may return while the window is open, as
  // calculatePaths' own cap -- where 0 means no cap at all.
  //
  // The "Maximum Chain Number" setting is deliberately ignored in here. It caps
  // chains at 3 by default, which is the right answer when a chain is worth what
  // it clears; a freeze line is drawn between a chain's two *ends*, so in this
  // window a chain that crosses the board is worth far more than three short
  // ones.
  //
  // Capped rather than off, because the model's error grows with length. The
  // ice forms along the chain's *drawn path*, and the end line is only a good
  // stand-in for that path while the chain is short -- a long one snakes far
  // off its own ends (see `elsaPathBandCover`). The cap is set where the
  // measured cost is: sweeping it from 4 to 10 moved coverage by a single
  // point, so 10 buys the bound for about a point. `npm run elsa:coverage`
  // now says it is free -- capped at 10 reads the same 66.0% as uncapped over
  // 100 boards, and only a cap of 4 gives up a point.
  maxChain: 10,
  // EXPERIMENTAL -- work the board bottom-up. Two halves, both on this flag:
  // `calculatePaths` grows each candidate from the lowest tsum it can start on
  // and tags it with that `startY`, and `elsaNextChain` takes the lowest anchor
  // first. Every other rule is untouched -- the narrowest-band rule still
  // decides between candidates on the same level, and the clearance filter and
  // the quarantine are where they were.
  //
  // Costed at `npm run elsa:coverage -- --bottomFirst=0/1`, and it is free --
  // 67.1% against 67.0%, 1000 boards on each of three seeds. Flip this to
  // false for the plain narrowest rule, which also stops the pathfinder being
  // asked for low starts.
  bottomFirst: true,
  // How close two anchors sit and still count as the same level, in the 200px
  // play square. At 0 the lowest anchor simply wins and the narrowest rule
  // only breaks exact ties; wider, a level is a band of the board and the
  // narrowest rule chooses inside it.
  //
  // Swept at 1000 boards: 0 reads 67.1%, 13 reads 67.0, 27 reads 66.8, and a
  // band wide enough to admit everything (which is the low starts alone, with
  // the pick left as it was) reads 67.0. So the hybrid is the worst of the
  // three and strict depth costs nothing -- the sweep is worth more than the
  // half-measure, and the ordering is worth having only if the bottom of a
  // real board is worth something the lattice cannot show.
  bottomBandPx: 0,
  // Half the thickness of one freeze band, in the 200px play square the board
  // scan works in -- so `Config.tsumWidth` (25) is one tsum. What the coverage
  // model asks of every remaining tsum is whether it lies within this of the
  // line through the chosen chain's two ends.
  //
  // Measured off the same four captures, by differencing the frozen mask between
  // consecutive frames: the band that appears down the left side between elsa2
  // and elsa3 reads 31-54px wide. That reading is inflated by the scan's own 22px
  // blur, which spreads the mask by up to 11px each way, so the band itself is
  // roughly 1 to 1.5 tsums thick and its half-width is under one tsum radius.
  //
  // Deliberately at the *narrow* end of that. Over-claiming makes the model
  // believe the board is finished when it is not, and stops the window early.
  // The other direction -- a tsum that is really ice but modelled free -- is not
  // this number's problem any more: `avoidHalfWidth` below is what keeps the
  // next chain's drag off it.
  bandHalfWidth: 16,
  // How close to a drawn line the next chain may reach, same units. Everything
  // within this is *quarantined*: dropped from chain planning, but not counted
  // frozen unless it is also inside `bandHalfWidth`.
  //
  // This is the upper bound of the same band reading, where `bandHalfWidth` is
  // the lower -- the gap between them is the ring the measurement could not
  // pin down. A tsum in that ring may really be ice, and a drag that touches
  // real ice sets the whole pile off, which spends the window's entire freeze
  // on however little has been drawn so far. So the ring is kept out of chains,
  // and the next capture settles what it actually was: real ice joins the
  // frozen cluster, and a free tsum comes back as itself.
  avoidHalfWidth: 27,
  // How close a drag may pass to a tsum known to be frozen, same units --
  // about one tsum radius. The quarantine keeps a chain's *tsums* off the ice,
  // but not the finger's travel between them: a linkable hop is
  // `tsumWidth * linkReach` = 47.5px, wider than a narrow band, and a rescan
  // reads ice back by colour with the line geometry forgotten -- so two free
  // tsums hugging opposite edges of a band can sit one hop apart, and that hop
  // crosses the ice. A path with a segment this close to known ice is not
  // drawn.
  dragClearance: 13,
  // What a frozen tsum's cluster centre looks like. See the note above.
  //
  // A live tsum colour can sit inside this box too (a pale ice-blue tsum on
  // the coronation_elsa_debug2.mp4 board reads h~99 s~95-100 v~214), which is
  // why the box alone is not the test any more -- see `elsaIceAlikes`.
  frozen: {hueMin: 95, hueMax: 135, satMax: 100, valMin: 195},
  // How close (plain Euclidean in cluster HSV) a centre must be to a
  // remembered ice-alike to be exonerated. A colour re-reads within ~5 of
  // itself scan to scan; the nearest measured real ice sits ~24 from the
  // debug2 board's ice-alike. 15 splits the gap.
  iceAlikeMatchDist: 15,
  // Taps spent on the pile. One is enough to set it off; the rest insure
  // against a position that a moving board has moved out from under.
  burstTaps: 3,
  burstTapDuring: 10,
  // Waited out after every chain drawn inside the window, before the next drag
  // goes out, so the chain registers and its band forms first.
  //
  // This was 0 for the whole of the skill's history, which made the margin the
  // header claims a no-op. Read off coronation_elsa_debug1.mp4 at 60fps: a
  // 15-chain registered at 13.61s and its ice was still visibly spreading at
  // 13.68s, when the next drag went out 33ms later and set the pile off at 16
  // tsums (94,680, against 106 and 1,626,542 for the clean window at 1.9s).
  // 150 clears the spread with margin; at ~7 chains a pass it costs about a
  // fifth of a level-1 window, which is the trade -- a pile lost to an early
  // pop costs all of it.
  chainSettleMs: 10,
  // Waited out after a pass pops bubbles at its start, before the board is
  // re-captured: tsums slide into the space a popped bubble leaves, so the
  // pre-pop positions are stale for about a bubble's width around each one.
  bubbleSettleMs: 200,
  // An ice-free look that reads fewer than this fraction of the tsums the
  // board is known to hold is a board mid-fall -- the window opening on the
  // previous batch's refill, a pop's slide, a burst's refill -- and is waited
  // out and retaken rather than chained: a chain drawn from a mid-fall
  // capture drags at air where a tsum was passing through, and freezes a gap
  // into the pile. Ice-free looks only, so the known under-read of an iced
  // board (frozen clusters eat colour slots) can never stall a pass.
  settledFraction: 0.75,
  // How long an unsettled look waits before the board is looked at again.
  settleRetryMs: 250,
  // How many times one pass may retake an unsettled look before chaining it
  // anyway. Two (500ms) was not enough to outlast a burst-sized refill: the
  // 106-tsum burst at 1.9s in coronation_elsa_debug1.mp4 left the board still
  // filling at 2.72s, when the gate ran out of retries and chained a half-empty
  // board. Every wait is still guarded against the window's close, so a high
  // count cannot overrun the burst -- it just lets the gate hold out.
  settleMaxWaits: 5,
  // Waited out after a burst before anything else works the board: the pile
  // going off is a large clear, and the refill scales with it. The closing
  // bubble sweep runs inside this pause -- a clear that size earns bubbles.
  //
  // Flat 250 was sized for a small pile and far too short for a big one, which
  // is what put a chain on a still-falling board at 2.72s. Now base plus
  // per-tsum, capped: 106 tsums asks for the cap, a 16-tsum pop for ~350ms.
  postBurstSettleMs: 250,
  postBurstSettlePerTsumMs: 6,
  postBurstSettleMaxMs: 900,
  // Waited out when a pass draws no chain at all, before the board is captured
  // again. The board has not moved -- nothing in the window moves it -- so an
  // immediate retake would mostly re-read the same frame; this gives the freeze
  // animation a moment to settle so the ice cluster reads cleaner.
  rescanIdleMs: 300,
  // When a board mid-window is read as played out, the pile is spent early and
  // the window refreezes what the burst lets fall in, instead of idling on a
  // finished board. "Played out" is deliberately hard to satisfy -- bursting on
  // one starved scan is the bug this skill's history is about:
  //   dryPasses        -- consecutive fresh captures that yielded no chain
  //   minIced          -- the capture must read a pile at least this big, which
  //                       a scan starved by an animation never does
  //   minWindowLeftMs  -- enough window left to refreeze, or the early burst
  //                       buys nothing over the closing one
  earlyBurst: {dryPasses: 2, minIced: 8, minWindowLeftMs: 1500},
  // The fallback when no cluster read as frozen: a blind grid over the play
  // area, in logical px. Coarse on purpose -- a frozen tsum is only ever missed
  // by this if there is none there, and a tap that lands on an ordinary tsum is
  // not a drag, so the game ignores it.
  blindStep: 220
};

// Live colours seen inside the frozen box on scans where ice was impossible,
// in cluster HSV (`b`/`g`/`r` = hue/saturation/value). Per round: the colour
// lineup changes between rounds. `elsaWindowRound` is the last round a freeze
// window ran in -- while it differs from the current round, no ice can exist,
// which is what makes a scan safe to learn from.
var elsaIceAlikes: Color[] = [];
var elsaIceAlikeRound = 0;
var elsaWindowRound = 0;

/**
 * Whether a cluster centre matches a colour known to be alive, not ice.
 *
 * Plain Euclidean, not `distance3D`: its near-match discounts are tuned for
 * merging clusters, and they collapse exactly the margin this check lives on
 * -- the corpus-measured ice at (107, 79, 222) sits 24 from the debug2 board's
 * ice-alike in plain distance but 14 through the discounts, which would have
 * exonerated real ice.
 */
function elsaIsIceAlike(c: Color): boolean {
  for (let i = 0; i < elsaIceAlikes.length; i++) {
    const a = elsaIceAlikes[i];
    const d = Math.sqrt((a.b - c.b) * (a.b - c.b) + (a.g - c.g) * (a.g - c.g)
      + (a.r - c.r) * (a.r - c.r));
    if (d < CoronationElsaConfig.iceAlikeMatchDist) { return true; }
  }
  return false;
}

/**
 * Learn this round's ice-alikes off a scan that cannot be looking at ice:
 * called from `orderPaths`, and a no-op once the round's first window has
 * opened. Any cluster the frozen box matches before then is a live colour --
 * the header's fourth premature pop is what one costs when believed.
 */
function elsaNoteIceAlikes(ts: Tsum): void {
  if (elsaIceAlikeRound !== gLogRoundId) {
    elsaIceAlikes = [];
    elsaIceAlikeRound = gLogRoundId;
  }
  if (elsaWindowRound === gLogRoundId) { return; }
  const box = CoronationElsaConfig.frozen;
  const clusters = ts.boardClusters;
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    if (c.b >= box.hueMin && c.b <= box.hueMax
        && c.g <= box.satMax && c.r >= box.valMin && !elsaIsIceAlike(c)) {
      elsaIceAlikes.push({b: c.b, g: c.g, r: c.r});
      logDebug(Log.Skill.ElsaIceAlike, {hue: c.b, sat: c.g, val: c.r});
    }
  }
}

/**
 * Which of the last scan's colour clusters read as ice, flagged by cluster
 * index.
 *
 * Read off `ts.boardClusters`, whose `b`/`g`/`r` are hue/saturation/value -- so
 * this costs nothing beyond the scan that has already happened.
 *
 * All matches, not the best one: a board part-way through freezing carries ice
 * at more than one shade, and a shade left unflagged is a cluster the planner
 * would chain over -- which is a drag onto real ice, and the pile gone. The
 * one exception is a cluster matching a remembered ice-alike: a live colour,
 * however icy it reads -- see the header.
 */
function elsaFrozenClusters(ts: Tsum): boolean[] {
  const box = CoronationElsaConfig.frozen;
  const clusters = ts.boardClusters;
  const frozen: boolean[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    frozen.push(c.b >= box.hueMin && c.b <= box.hueMax
      && c.g <= box.satMax && c.r >= box.valMin && !elsaIsIceAlike(c));
  }
  return frozen;
}

/** The paths that are not over ice. */
function elsaLiveChains(paths: TsumPath[], frozen: boolean[]): TsumPath[] {
  const out: TsumPath[] = [];
  for (let i = 0; i < paths.length; i++) {
    const idx = paths[i].tsumIdx;
    if (idx === undefined || !frozen[idx]) { out.push(paths[i]); }
  }
  return out;
}

/**
 * Which of `points` lie within `half` of the line through `a` and `b`.
 *
 * The band is the strip either side of the infinite line through the chain's
 * two ends, so this is a point-to-line distance and nothing more. Board points
 * are tsum top-left corners rather than centres, but the offset is the same for
 * every one of them and cancels out of the distance.
 *
 * Two widths are asked of it: `bandHalfWidth` is what the model claims frozen,
 * and `avoidHalfWidth` is what the next chain must keep away from. A chain
 * whose ends land on the same tsum has no line; it covers nothing here, and the
 * caller's own tsums still count, so no candidate is ever scored blind.
 */
function elsaBandCover(a: BoardPoint, b: BoardPoint, points: BoardPoint[],
    half: number): boolean[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const hit: boolean[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    hit.push(len > 0 && Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / len <= half);
  }
  return hit;
}

/**
 * Which of `points` lie within `half` of any segment of the drawn `path`.
 *
 * `elsaBandCover` models the ice as a strip about the line through the chain's
 * two *ends*, which is where the game draws the band. But the freeze also grows
 * out of the tsums actually linked, and a long chain snakes well off its own end
 * line -- so padding the end line alone leaves that ice unmodelled, and the next
 * drag walks into it and sets the pile off. Measured at 60fps on
 * coronation_elsa_debug1.mp4 (13.56-13.68s): a 15-chain linked down the left of
 * the board froze a column along its own path, nowhere near the diagonal through
 * its ends. The quarantine is the union of the two.
 */
function elsaPathBandCover(path: TsumPath, points: BoardPoint[],
    half: number): boolean[] {
  const hit: boolean[] = [];
  for (let i = 0; i < points.length; i++) { hit.push(false); }
  for (let s = 1; s < path.length; s++) {
    const a = path[s - 1], b = path[s];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    for (let i = 0; i < points.length; i++) {
      if (hit[i]) { continue; }
      const p = points[i];
      // Nearest point of the segment to p, by clamped projection.
      let t = lenSq > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const ex = a.x + t * dx - p.x, ey = a.y + t * dy - p.y;
      if (ex * ex + ey * ey <= half * half) { hit[i] = true; }
    }
  }
  return hit;
}

/**
 * What a drag has to keep away from: a tsum known frozen or written off, or a
 * bubble still on the board. `pad` is the obstacle's own size beyond a tsum's
 * -- a bubble's read radius over a tsum radius -- so the drag keeps the same
 * finger margin from its edge as it does from a tsum's. Board points carry no
 * pad and cost nothing extra.
 */
interface ElsaObstacle {
  x: number;
  y: number;
  pad?: number;
}

/**
 * Whether every drag segment of `path` keeps `clearance` (plus each obstacle's
 * own `pad`) away from all of `obstacles`.
 *
 * The quarantine keeps a chain's *tsums* off the ice, but says nothing about
 * the finger's travel between them: a linkable hop is `tsumWidth * linkReach`
 * = 47.5px, wider than a narrow band, and a rescan reads ice back by colour
 * with the line geometry forgotten -- so two free tsums hugging opposite edges
 * of a band can be one hop apart, and that hop crosses the ice, which sets the
 * pile off. The same check keeps the travel off bubbles, which pop at a touch
 * and end the chain where they do. A blocked path is simply not drawn this
 * pass; the next capture, or a pop, may free its surroundings.
 */
function elsaPathIsClear(path: TsumPath, obstacles: ElsaObstacle[], clearance: number): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    for (let j = 0; j < obstacles.length; j++) {
      const p = obstacles[j];
      const keep = clearance + (p.pad || 0);
      // Nearest point of the segment to p, by clamped projection.
      let t = lenSq > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const ex = a.x + t * dx - p.x, ey = a.y + t * dy - p.y;
      if (ex * ex + ey * ey <= keep * keep) { return false; }
    }
  }
  return true;
}

/**
 * How low a candidate is anchored: the `startY` `calculatePaths` tagged it with
 * under `lowFirst`, or its own first tsum when it was not asked for one.
 */
function elsaChainAnchor(path: TsumPath): number {
  return path.startY === undefined ? path[0].y : path.startY;
}

/**
 * The candidates anchored at the bottom of what is on offer: the lowest anchor
 * there is, and everything within `bottomBandPx` of it.
 *
 * A filter and not a sort, so what it hands on still goes through the
 * narrowest-band rule -- depth decides which level of the board is worked, and
 * the rule that buys chain count decides what is drawn there.
 */
function elsaLowestAnchored(paths: TsumPath[]): TsumPath[] {
  let lowest = -Infinity;
  for (let i = 0; i < paths.length; i++) {
    const y = elsaChainAnchor(paths[i]);
    if (y > lowest) { lowest = y; }
  }
  const floor = lowest - CoronationElsaConfig.bottomBandPx;
  const out: TsumPath[] = [];
  for (let i = 0; i < paths.length; i++) {
    if (elsaChainAnchor(paths[i]) >= floor) { out.push(paths[i]); }
  }
  return out;
}

/**
 * The chain to draw next: the one whose band takes the **least** off `points`.
 *
 * That is the opposite of the obvious rule, and it is what measured best. The
 * obvious one -- take the chain that freezes the most board -- loses because
 * coverage and consumption are the same act here: a frozen tsum is ice, so it
 * cannot be chained again, and the widest band spends the most of the material
 * the next chain would have been made from. Total coverage is the union of the
 * bands, so what matters is how many bands get drawn before the board runs out
 * of chains, not how much each one takes.
 *
 * Measured over ten synthetic 49-tsum boards at five colours, scoring the union
 * of the bands each rule drew:
 *
 *     every chain the scan found, longest first    67%   3.6 chains
 *     one at a time, widest band first             65%   3.3 chains
 *     one at a time, narrowest band first          73%   5.0 chains
 *     every chain, widest-spanning ends first      70%   4.2 chains
 *
 * At four colours the four rules land within a point of each other (74-76%), so
 * this is a five-colour board's problem -- which is the ordinary one.
 *
 * `points` is what the model still believes is free, which is also what the
 * candidates were planned over -- so a candidate's own tsums are always among
 * them, and the winner always takes at least its own length. That is what makes
 * the loop below shrink its own input and terminate.
 */
function elsaNextChain(paths: TsumPath[], points: BoardPoint[]):
    { path: TsumPath, cover: boolean[], covered: number } | null {
  // Bottom-first, when it is on: narrow to the lowest level on offer, and let
  // the rule below choose within it.
  const level = CoronationElsaConfig.bottomFirst ? elsaLowestAnchored(paths) : paths;
  let best: { path: TsumPath, cover: boolean[], covered: number } | null = null;
  for (let i = 0; i < level.length; i++) {
    const path = level[i];
    const cover = elsaBandCover(path[0], path[path.length - 1], points,
      CoronationElsaConfig.bandHalfWidth);
    // Plus the ice along the drawn path, and the chain's own tsums: a chain that
    // snakes off its own end line still freezes what it links, and the band
    // grows out from there. Counting it here also stops the rule below
    // preferring snaking chains, whose end-line band alone reads deceptively
    // narrow.
    const along = elsaPathBandCover(path, points,
      CoronationElsaConfig.bandHalfWidth);
    for (let j = 0; j < cover.length; j++) { if (along[j]) { cover[j] = true; } }
    for (let j = 0; j < path.length; j++) {
      const at = points.indexOf(path[j]);
      if (at >= 0) { cover[at] = true; }
    }
    let n = 0;
    for (let j = 0; j < cover.length; j++) { if (cover[j]) { n++; } }
    if (best === null || n < best.covered) { best = {path: path, cover: cover, covered: n}; }
  }
  return best;
}

/**
 * How long to keep the board after a burst of `pile` tsums.
 *
 * The refill scales with the clear, so a flat wait cannot serve both a 16-tsum
 * pop and a 106-tsum one -- the flat 250 let a chain go out on a board still
 * falling from a 106 burst. Capped, because the wait comes out of the window.
 */
function elsaPostBurstSettleMs(pile: number): number {
  const cfg = CoronationElsaConfig;
  return Math.min(cfg.postBurstSettleMaxMs,
    cfg.postBurstSettleMs + pile * cfg.postBurstSettlePerTsumMs);
}

/**
 * Set off the pile, and say how many tsums it was aimed at.
 *
 * Aimed taps first, top of the board down and spread evenly down the pile
 * rather than taken from three neighbours, so a pile the model has slightly
 * wrong is still covered. Then, only when `grid` says so, the blind sweep: the
 * closing burst gets it, because after the window a missed pile is lost for
 * good and the ~25 taps cost round time only. A mid-window burst does not --
 * its pile positions come off a fresh capture, a group the aimed taps miss is
 * read back and burst by the next pass, and a blind grid inside the window
 * taps ice the model never claimed (the header's fourth premature pop: a
 * phantom pile triggers the burst, the grid pops the real one).
 *
 * A tap is not a drag, so one that lands on an ordinary tsum links nothing and
 * the game ignores it -- the same reason `clearAllBubbles` is allowed to be
 * blind.
 */
Tsum.prototype.elsaBurstFrozen = function(frozen, grid) {
  // Raw taps below bypass `ts.tap`, so the stopped-run rule is applied here.
  if (!this.isRunning) { return 0; }
  const cfg = CoronationElsaConfig;
  // Highest ice first, working down. A tap spends the group of ice it lands in,
  // and the pile is not always one group -- bands drawn in different corners of
  // the board never touched. Clearing a group drops everything above it into the
  // hole, so a tap taken low moves whatever ice is still standing and every
  // aimed position left in this list is stale: those taps miss, and the ice they
  // were for survives as a gap no chain can cross until the next scan spots it.
  // Nothing below a tap moves, so top-down keeps each position true as it lands.
  // A copy -- the caller's list is its own.
  const pile = frozen.slice().sort(function(a, b) { return a.y - b.y; });
  const taps = Math.min(cfg.burstTaps, pile.length);
  const step = taps > 0 ? Math.max(1, Math.floor(pile.length / taps)) : 1;
  for (let i = 0; i < taps; i++) {
    const p = pile[i * step];
    // Board points are the tsum's top-left corner in the 200px play square, the
    // shape `linkTsums` converts from -- so the half-width goes back on here too.
    const x = Math.floor(this.playOffsetX
      + (p.x + Config.tsumWidth / 2) * this.playWidth / this.playResizeWidth);
    const y = Math.floor(this.playOffsetY
      + (p.y + Config.tsumWidth / 2) * this.playHeight / this.playResizeHeight);
    tap(x, y, cfg.burstTapDuring);
  }
  // Rows top-down as well, and for the same reason -- this grid is what catches
  // the ice the aimed taps had wrong, so it must not undo their order.
  if (grid) {
    for (let y = Button.gameBubblesFrom.y; y <= Button.gameBubblesTo.y; y += cfg.blindStep) {
      for (let x = Button.gameBubblesFrom.x; x <= Button.gameBubblesTo.x; x += cfg.blindStep) {
        this.tap({x: x, y: y}, cfg.burstTapDuring);
      }
    }
  }
  logDebug(Log.Skill.ElsaBurst, { aimedAt: taps, modelled: frozen.length, grid: grid });
  return taps;
};

/**
 * One pass: capture the board once, then freeze as much of it as its chains
 * allow, and hand back what the model believes is now ice.
 *
 * Every chain is planned over `free` -- the tsums neither frozen nor
 * quarantined -- so the plan narrows as the board ices over without another
 * look at the screen. See the header for why one look is enough, and for what
 * the quarantine ring is protecting.
 */
Tsum.prototype.elsaFreezePass = function(closesAt, expected) {
  const cfg = CoronationElsaConfig;
  const expect = expected || 0;
  let free: BoardPoint[] = [];
  let iced: BoardPoint[] = [];
  // The look loop: capture, and settle what the capture says before any chain
  // is planned off it. Two things send it back for another look, each twice
  // at most, and only ever on an ice-free read:
  //
  //   - **a board mid-fall.** The board moves at exactly three moments -- the
  //     window opening on the previous batch's refill, a pop's slide, a
  //     burst's refill -- and every one of them leaves the board ice-free, so
  //     an ice-free look that reads clearly fewer tsums than the board is
  //     known to hold is a fall in flight. Chaining it drags at air and
  //     freezes a gap into the pile; waiting `settleRetryMs` and looking
  //     again costs less than one wasted chain.
  //   - **bubbles.** A bubble holes every band drawn through it and pops
  //     mid-drag under any chain dragged across it, and a big burst *earns*
  //     bubbles. The capture already knows where they are (`findGameBubbles`
  //     runs inside every scan), so they are popped aimed and the board is
  //     looked at again after the fall. The settle check comes first, so the
  //     pop aims off positions that have landed.
  //
  // Ice-free only, both of them: a tap is what sets a pile off, so while ice
  // stands the bubbles stay (they become drag obstacles below) -- and the
  // under-read of an iced board (frozen clusters eat colour slots) must never
  // read as a fall, or a thickly iced pass would stall on retakes. Ice itself
  // is never planned over and never counted as coverable.
  let waits = 0;
  let pops = 0;
  for (;;) {
    const board = this.scanBoardQuick();
    const frozenCluster = elsaFrozenClusters(this);
    free = [];
    iced = [];
    for (let i = 0; i < board.length; i++) {
      if (frozenCluster[+board[i].tsumIdx]) { iced.push(board[i]); } else { free.push(board[i]); }
    }
    if (iced.length === 0) {
      if (waits < cfg.settleMaxWaits && free.length < cfg.settledFraction * expect
          && Date.now() + cfg.settleRetryMs < closesAt) {
        waits++;
        this.sleep(cfg.settleRetryMs);
        continue;
      }
      if (pops < 2 && this.gameBubbles.length > 0
          && Date.now() + cfg.bubbleSettleMs < closesAt) {
        pops++;
        this.popGameBubbles(this.gameBubbles.length);
        this.sleep(cfg.bubbleSettleMs);
        continue;
      }
    }
    break;
  }

  const tsums = free.length;
  // The whole population this pass read, free plus ice -- taken here, before
  // the chain loop below starts moving tsums from `free` into `iced`, or the
  // count would double-count everything chained and poison the caller's
  // board-size estimate.
  const read = tsums + iced.length;
  // Everything a drag must keep away from: pre-existing ice first, then
  // whatever each chain takes out of `free` -- and any bubble that survived
  // the looks above, unpoppable under standing ice or simply missed. A drag
  // over a bubble pops it mid-travel and ends the chain there, so it is
  // avoided exactly like ice: centre shifted to the corner space board points
  // live in, padded by its size beyond a tsum's.
  const obstacles: ElsaObstacle[] = iced.slice();
  for (let i = 0; i < this.gameBubbles.length; i++) {
    const b = this.gameBubbles[i];
    obstacles.push({
      x: b.x - Config.tsumWidth / 2,
      y: b.y - Config.tsumWidth / 2,
      pad: Math.max(0, b.r - Config.tsumWidth / 2),
    });
  }
  let avoided = 0;
  let blocked = 0;
  const coveredPerChain: number[] = [];
  while (this.isRunning && Date.now() < closesAt && free.length >= 3) {
    let paths = calculatePaths(free, this.myTsumIdx, skillMyTsumPriority(this), cfg.maxChain,
      cfg.bottomFirst);
    const found = paths.length;
    paths = paths.filter(function(p) {
      return elsaPathIsClear(p, obstacles, cfg.dragClearance);
    });
    blocked += found - paths.length;
    if (paths.length === 0) { break; }
    const pick = elsaNextChain(paths, free);
    if (pick === null) { break; }
    // `linkTsums` and not `link`: the two things `link` adds between chains are
    // both wrong in here. Its bubble pop has nothing to spend -- beforeActivate
    // swept the board -- and its `maybeAutoTapSkill` would re-enter this very
    // choreography the moment a long chain refilled the gauge, nesting a second
    // window inside this one. A gauge that fills mid-window is picked up by the
    // play loop one scan after this hands back.
    this.linkTsums(pick.path);
    // Let the chain register and its band start forming before the next drag.
    this.sleep(cfg.chainSettleMs);
    coveredPerChain.push(pick.covered);
    // What this chain put out of reach. The claimed band goes to `iced`; the
    // wider quarantine ring around it just leaves the plan, uncounted -- the
    // next capture reads back what it really was.
    const avoid = elsaBandCover(pick.path[0], pick.path[pick.path.length - 1],
      free, cfg.avoidHalfWidth);
    const alongAvoid = elsaPathBandCover(pick.path, free, cfg.avoidHalfWidth);
    for (let i = 0; i < avoid.length; i++) {
      if (alongAvoid[i]) { avoid[i] = true; }
    }
    for (let i = 0; i < pick.path.length; i++) {
      const at = free.indexOf(pick.path[i]);
      if (at >= 0) { avoid[at] = true; }
    }
    const rest: BoardPoint[] = [];
    for (let i = 0; i < free.length; i++) {
      if (!avoid[i]) { rest.push(free[i]); continue; }
      obstacles.push(free[i]);
      if (pick.cover[i]) { iced.push(free[i]); } else { avoided++; }
    }
    free = rest;
  }

  logDebug(Log.Skill.ElsaPass, {
    tsums: tsums,
    chains: coveredPerChain.length,
    coveredPerChain: coveredPerChain,
    iced: iced.length,
    avoided: avoided,
    blocked: blocked,
    waits: waits,
    stillFree: free.length,
    leftMs: closesAt - Date.now(),
  });
  return { iced: iced, chains: coveredPerChain.length, read: read };
};

/**
 * Play the freeze window: spend it freezing, and set the pile off the moment
 * fresh captures confirm no more chains can be made -- the clock forces the
 * burst only when just `burstTailMs` of window remains.
 *
 * Anchored to `activatedAt` rather than to when this was entered, so the window
 * is the game's and not the script's -- everything spent getting here, the
 * activation tap's own hold included, comes out of it.
 *
 * Passes repeat until the burst, each starting with a fresh capture. The
 * repeat is not tracking change: it is the model handing back its deliberate
 * over-write-offs (the quarantine ring) for the next pass to chain. A dry
 * pass waits `rescanIdleMs` before the next look, so a starved board does not
 * spin captures; dry passes that keep coming with a real pile standing are
 * the played-out confirmation (`earlyBurst`) -- spent-and-refrozen with
 * window left, the closing burst itself with the window nearly out.
 *
 * `expectTsums` is the population of the board the play loop scanned before
 * activating, for the settle gate in `elsaFreezePass`.
 */
Tsum.prototype.useCoronationElsaSkill = function(activatedAt, expectTsums) {
  const cfg = CoronationElsaConfig;
  const t0 = activatedAt || Date.now();
  const level = Math.min(Math.max(this.skillLevel, 1), cfg.durationMs.length);
  const closesAt = t0 + cfg.durationMs[level - 1];
  // The last moment the closing burst may start with its taps still landing
  // inside the window. Chains keep coming right up to this line.
  const burstBy = closesAt - cfg.burstTailMs;

  this.sleepUntil(t0 + cfg.leadInMs);

  // How many tsums the board is believed to hold: seeded from the play loop's
  // scan -- taken before its last batch cleared anything, so a full board's
  // count -- and raised to the best count any pass reads.
  let expected = expectTsums || 0;
  let passes = 0;
  let chains = 0;
  let bursts = 0;
  let aimedTaps = 0;
  let dryPasses = 0;
  let playedOut = false;
  let iced: BoardPoint[] = [];
  // A pass only starts with room for its capture and at least one chain
  // before the deadline (`passMinMs`) -- any closer, and the capture alone
  // would drag the burst's taps out past the window's close.
  while (this.isRunning && burstBy - Date.now() > cfg.passMinMs) {
    const pass = this.elsaFreezePass(burstBy, expected);
    passes++;
    chains += pass.chains;
    if (pass.read > expected) { expected = pass.read; }
    // Keep the last read that saw any ice: if the final pass is a dud scan, the
    // burst still has the previous pass's pile to aim at.
    if (pass.iced.length > 0) { iced = pass.iced; }
    if (pass.chains > 0) { dryPasses = 0; continue; }
    dryPasses++;
    const eb = cfg.earlyBurst;
    if (dryPasses >= eb.dryPasses && pass.iced.length >= eb.minIced) {
      // No more chains can be made: fresh captures keep agreeing, and a real
      // pile is standing -- a scan starved by an animation reads few tsums,
      // not a big pile, so it cannot get in here. With window left to
      // refreeze the refill, spend the pile now and keep playing; with the
      // window nearly out, this IS the closing burst, just not waited for.
      if (burstBy - Date.now() > eb.minWindowLeftMs) {
        // No blind grid mid-window: the pile came off a fresh capture, so the
        // aimed taps are enough, and a grid here taps ice the model never
        // claimed -- what a group they miss costs is one more pass.
        aimedTaps += this.elsaBurstFrozen(pass.iced, false);
        bursts++;
        dryPasses = 0;
        // Taken before `iced` is cleared: the wait is sized on what just went off.
        const settle = elsaPostBurstSettleMs(pass.iced.length);
        iced = [];
        this.sleep(settle);
        this.clearAllBubbles(0, 0, (Button.gameBubblesFrom.y + Button.gameBubblesTo.y) / 2);
      } else {
        playedOut = true;
        break;
      }
    } else {
      this.sleepUntil(Math.min(Date.now() + cfg.rescanIdleMs, burstBy));
    }
  }
  if (this.isRunning) {
    aimedTaps += this.elsaBurstFrozen(iced, true);
    bursts++;
    // The pile going off is a large clear; give it a moment before anything
    // else works the board, scaled to how large. The sweep runs inside the
    // pause: a clear that size earns bubbles, and they are spent here rather
    // than left to the hoard -- the bottom half, on the play loop's own trade.
    this.sleep(elsaPostBurstSettleMs(iced.length));
    this.clearAllBubbles(0, 0, (Button.gameBubblesFrom.y + Button.gameBubblesTo.y) / 2);
    // Whatever is left of the window is waited out too, so the play loop's
    // first chain cannot freeze a stray band in its dying moments -- leftover
    // ice the next scan would have to fence off.
    this.sleepUntil(closesAt);
  }

  logInfo(Log.Skill.ElsaDone, {
    skillLevel: level,
    windowMs: cfg.durationMs[level - 1],
    passes: passes,
    chains: chains,
    bursts: bursts,
    // Whether the closing burst fired on the confirmation -- no more chains,
    // pile standing -- rather than forced by the clock.
    playedOut: playedOut,
    // What the model believed it had frozen going into the burst. The number to
    // read first when this skill looks like it is doing nothing: near-zero with
    // several chains drawn means the pile went off early -- something touched
    // ice mid-window -- while `aimedTaps` at 0 means every burst leant on the
    // blind grid.
    icedLast: iced.length,
    aimedTaps: aimedTaps,
    totalMs: Date.now() - t0,
  });
};

registerSkill({
  types: [SkillType.CoronationElsa],
  // She sweeps, and the declaration is what says so -- the choreography spends
  // bubbles on the way in (`beforeActivate`, aimed) and calls `clearAllBubbles`
  // on the way out (after each burst, the bottom half), which is the deliberate
  // override of the Bubble Strategy setting. The consequence is the one the
  // flag exists for: an activation that emptied the board must not count
  // towards the play loop's own sweep -- and the play loop goes further for a
  // skill that declares this, resetting its pending sweep when one fires.
  // Uncapped chains in ordinary play, whatever "Maximum Chain Number" says.
  // Between windows the only job is refilling the gauge, which counts tsums
  // cleared and not chains linked -- so a scan that links three ten-chains
  // fills it far faster than one that links three three-chains for the same
  // three drags and the same scan gap, which is time straight off the wait for
  // the next window. The setting's usual answer (many short chains, for the
  // combo) is the right one for a tsum whose payout *is* its chains; hers is
  // the freeze window.
  chainLimits: { maxChain: 5 },
  // Room for her own ice on top of the board's colours. Every shade the ice
  // reads at is an ordinary cluster to the scan and takes one of the
  // `uniqueTsumCount - 1` slots it keeps -- ice has been measured at three
  // shades on one part-frozen board, which leaves one live colour of five, and
  // a colour without a slot is not in the board array for any pass to plan
  // over. Four: three for the measured shades, and one for the colour the
  // ordinary cut drops. See "Reading the board through the ice" in the header.
  extraClusterSlots: 4,
  sweepsBubbles: true,
  orderPaths: function(ts, paths, board) {
    // Before the round's first window, a cluster the frozen box matches is a
    // live colour -- learn it now, or it plays as the phantom pile the header
    // describes for the rest of the round.
    elsaNoteIceAlikes(ts);
    const frozen = elsaFrozenClusters(ts);
    // Ice read here is *leftover*: orderPaths only runs from the play loop, and
    // the choreography waits out its own window before handing back. A burst
    // that missed, or a band frozen in the window's dying moments, would
    // otherwise stand forever -- no chain can be made over ice, and nothing
    // else in the play loop ever taps it -- so it is spent on sight, grid and
    // all: out here there is no fresh pile for a stray tap to cost.
    const leftover: BoardPoint[] = [];
    for (let i = 0; i < board.length; i++) {
      if (frozen[+board[i].tsumIdx]) { leftover.push(board[i]); }
    }
    if (leftover.length > 0) {
      ts.elsaBurstFrozen(leftover, true);
    }
    // Beyond that, only ever a filter: the ordering `calculatePaths` produced
    // is already longest-first, which is what this skill wants too.
    return elsaLiveChains(paths, frozen);
  },
  beforeActivate: function(ts) {
    // Spend whatever bubbles the cycle's own scan still holds, aimed, before
    // the window opens. A bubble on the board holes every freeze line drawn
    // through it and breaks any chain dragged over it, and there is no chain
    // later in the window worth saving one for -- the window pays out the
    // pile, not the chains. Under All Bubbles ASAP the list is already spent
    // and this is zero taps; under the hoarding strategies it is the hoard,
    // spent on the best possible cause.
    //
    // This used to be a blind sweep of the bottom third, which -- stacked on
    // the play loop's own periodic sweep -- held a full gauge behind two
    // sweeps of the same ground. The blind taps bought nothing the aimed path
    // does not: the first pass pops aimed off a fresh capture anyway, and the
    // post-burst sweeps still catch what the detector misses.
    ts.popGameBubbles(ts.gameBubbles.length);
  },
  afterActivate: function(ts, board, activatedAt) {
    // Ice exists in this round from here on, so the ice-alike learning stops.
    elsaWindowRound = gLogRoundId;
    // The board is the play loop's scan from before its last batch linked, so
    // its length is a full board's population -- the settle gate's seed.
    ts.useCoronationElsaSkill(activatedAt, board ? board.length : 0);
    // Always "did not fire". The gauge reads Active through the freeze window's
    // own animation, so a `true` here buys the whole choreography again --
    // lead-in, scans and all -- on a skill that is not actually ready. The next
    // board-scan cycle picks up a gauge that really has refilled.
    return false;
  }
});
