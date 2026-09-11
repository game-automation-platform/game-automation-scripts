// The Quick Bar's page script: wiring only.
//
// Everything about how the strip *looks* is in quickbar.html and quickbar.css,
// and this file never builds a control -- it finds the ones the markup already
// wrote, by their `data-key`, and keeps them in step with the running script.
// That is what makes the layout safe to iterate on: move a cell, add one, drop
// one, and nothing here changes.
//
// ## The two halves of a change
//
// A value edited here is written twice, and both are needed:
//
//   * `quickBarApply()` in the engine puts it on the *running* world, which is
//     the whole point -- the round, the stats and the coin averages survive;
//   * localStorage carries it to the settings page, so the next `start()` does
//     not hand back the value the user just changed. Both pages are file://
//     documents in the same WebView origin, so `StorageKey.Settings` is
//     literally the same entry the settings page reads.
//
// A third write follows once the engine has answered: `broadcast` tells the
// settings page to read the running world again, so the form on screen moves at
// the change rather than on its own poll. The store above is what the *next*
// run starts from; this is what the form is showing now.
//
// ## Why it polls
//
// The coin averages move a round at a time and nothing pushes them, so the page
// asks. It only asks while it is on screen and the run is live -- `onGapState`
// is the host telling it which -- so a hidden strip costs nothing.
//
// A settings change made on the other page arrives sooner than that: it nudges
// this one the same way (`onGapMessage`), and the poll is what covers what no
// nudge does -- the averages, and anything the engine moved by itself.
//
// ## Why a change waits
//
// Both halves of a write are expensive and neither is wanted per tap: the apply
// crosses the bridge and is answered, and the answer pulls a fresh state back
// over it. So a change is drawn immediately, held for `QB_APPLY_DEBOUNCE_MS`,
// and sent once the taps stop -- one round trip for a stepper held down, not
// one per press. The strip never shows the wait, because it draws from the tap
// rather than from the reply.

/** How often the coin averages are re-read while the strip is up. */
var QB_POLL_MS = 3000;

/** How long a control has to stop moving before its value is sent. */
var QB_APPLY_DEBOUNCE_MS = 350;

/**
 * The height quickbar.css was drawn at, and the fallback for a host too old to
 * push one. Everything vertical in the stylesheet is a ratio against it.
 */
var QB_DESIGN_HEIGHT = 62;

/**
 * Below this the chips go to one line per readout -- see *a short band* in
 * quickbar.css. It is where a row (25px of the design height) stops being taller
 * than a name stacked over its number, which no amount of scaling fixes.
 */
var QB_DENSE_BELOW = 48;

/**
 * The shortest window worth measuring a band from. The host parks the strip's
 * window at 1px rather than removing it, and that is not a band to draw into.
 */
var QB_MIN_MEASURED = 20;

/** Set by the host through `onGapState`; the sheet and the timer both read it. */
var qbPaused = false;
var qbVisible = false;
/** A run is up, paused or not: the one state the Report chip is live in. */
var qbActive = false;
var qbTimer: number | undefined;

/** The last state the engine reported, so a redraw needs no round trip. */
var qbState: { [key: string]: string | number | boolean } = {};

/**
 * The two stages of an unconfirmed change: waiting for the taps to stop, and
 * sent but not yet answered.
 *
 * A state read that was asked for before either happened is older than they
 * are, so both are laid back over it when it lands -- otherwise the strip drops
 * back to the value the tap has already moved past, and the next tap steps off
 * that.
 */
var qbPending: { [key: string]: string | number | boolean } = {};
var qbSent: { [key: string]: string | number | boolean } = {};
var qbApplyTimer: number | undefined;

/** How many applies are still unanswered; `qbSent` is cleared when it hits 0. */
var qbInFlight = 0;

function qbBridge(): typeof JavaScriptInterface | undefined {
    return typeof JavaScriptInterface === 'undefined' ? undefined : JavaScriptInterface;
}

/**
 * One structured record, written by the engine's logger rather than by a logger
 * of this page's own.
 *
 * The settings page carries its own copy because it has a lot to say and runs
 * before any script is loaded. This one has three lines to write and always has
 * an engine to write them with, so it borrows that one instead of being a third
 * implementation of the same record shape.
 */
function qbWrite(writer: string, event: string, message: string, fields?: object): void {
    var bridge = qbBridge();
    if (bridge === undefined) {
        return;
    }
    bridge.runScript(writer + '(' + JSON.stringify(event) + ',' + JSON.stringify(message)
        + (fields === undefined ? '' : ',' + JSON.stringify(fields)) + ');');
}

function qbLog(event: string, message: string, fields?: object): void {
    qbWrite('logWarn', event, message, fields);
}

function qbLogInfo(event: string, message: string, fields?: object): void {
    qbWrite('logInfo', event, message, fields);
}

// --- reading the engine ----------------------------------------------------

/**
 * Asks for a fresh state; `onQuickBarState` below is where the answer lands.
 *
 * Not while a change is on its way there or back: what came back would describe
 * a world the strip has already asked to move on from. The apply's own reply
 * asks again once the last one is answered, so nothing is skipped, only
 * deferred.
 */
function qbRequestState(): void {
    var bridge = qbBridge();
    if (bridge === undefined || qbInFlight > 0 || Object.keys(qbPending).length > 0) {
        return;
    }
    bridge.runScriptCallback('quickBarState()', 'onQuickBarState');
}

/** The engine's answer to `quickBarState()`. Named by the call above. */
function onQuickBarState(json: string): void {
    var parsed: { [key: string]: string | number | boolean } | null = null;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        qbLog(Log.QuickBar.ApplyFailed, 'The Quick Bar could not read the engine state',
            {reply: String(json).slice(0, 120)});
        return;
    }
    if (parsed === null) {
        return;
    }
    // Newest last: sent beats the answer, and pending beats what was sent.
    qbOverlay(parsed, qbSent);
    qbOverlay(parsed, qbPending);
    qbState = parsed;
    qbRender();
}

/** Copies every value of `from` over `onto`, leaving its other keys alone. */
function qbOverlay(onto: { [key: string]: string | number | boolean },
                   from: { [key: string]: string | number | boolean }): void {
    var keys = Object.keys(from);
    for (var i = 0; i < keys.length; i++) {
        onto[keys[i]] = from[keys[i]];
    }
}

/**
 * The engine's answer to `quickBarApply()`: `{ok, value}` or `{ok:false, why}`.
 *
 * Nothing is drawn from it -- a refused change is worth a line, and a taken one
 * is redrawn from a fresh `quickBarState()`, which is the world rather than the
 * reply and so is right even when two changes crossed. The reply says nothing
 * about which setting it answers for, so the sent values are only let go once
 * the last of them is in.
 */
function onQuickBarApplied(json: string): void {
    var reply: { ok?: boolean; why?: string } = {};
    try {
        reply = JSON.parse(json) || {};
    } catch (e) {
        reply = {};
    }
    if (reply.ok !== true) {
        qbLog(Log.QuickBar.ApplyFailed, 'The engine refused a Quick Bar change',
            {why: reply.why || 'unreadable reply'});
    }
    qbInFlight = qbInFlight > 0 ? qbInFlight - 1 : 0;
    if (qbInFlight === 0) {
        qbSent = {};
        // Every apply in the batch has been through the engine, so a page told
        // to read now reads a world holding all of them. Here rather than at the
        // send, where the read it provokes could overtake the writes.
        qbNudgePages();
    }
    qbRequestState();
}

// --- the host's push -------------------------------------------------------

/**
 * Draws the strip into the band the host gave it.
 *
 * `--qb-h` is the bare number quickbar.css builds every vertical size from, and
 * `data-dense` is the one step a ratio cannot express -- see *a short band*
 * there. An absent or nonsense height leaves the design size in place rather
 * than collapsing the strip, which is what a host that does not push this gets.
 */
function qbSetStripHeight(height: number | undefined): void {
    var px = typeof height === 'number' && isFinite(height) && height > 0
        ? Math.round(height)
        : QB_DESIGN_HEIGHT;
    document.documentElement.style.setProperty('--qb-h', String(px));
    document.body.setAttribute('data-dense', px < QB_DENSE_BELOW ? 'true' : 'false');
}

/**
 * The same height from the other side: what the window actually is.
 *
 * The host pushes the band it settled on, but that push can be missed -- a page
 * older than the host, a state that arrived before this handler existed -- and
 * the failure is silent and total: the strip lays itself out at 62 inside a
 * window of 39 and the whole top row is clipped away with nothing to say so.
 * The viewport is the host's own arithmetic arriving by a route that cannot be
 * missed, so it is measured here too and neither side is trusted alone.
 *
 * Not while the sheet is open: the window is deliberately taller than the strip
 * then, and the push is the only thing that still knows the band.
 */
function qbMeasureStrip(): void {
    if (qbSheet !== undefined) {
        return;
    }
    var height = window.innerHeight;
    if (!isFinite(height) || height < QB_MIN_MEASURED) {
        return;
    }
    qbSetStripHeight(height);
}

/**
 * The host, whenever the run state changes or the strip is shown or hidden.
 *
 * `{"active":bool,"paused":bool,"visible":bool,"stripHeight":px}`. The first
 * three are the only thing that decides whether the controls are live -- the
 * window's own touchability is set from the same fact on the host side, so what
 * the strip will accept and what it looks like cannot disagree. The Report chip
 * is the one exception, live for the whole run: see `qbNameHotspot`.
 *
 * `stripHeight` is the band the host settled on, which is not the window's own
 * height while a sheet is open and is not 62 whenever the status line is sharing
 * the edge. Applied before anything else here: the rest of this function can
 * open or close a sheet, and both read the height the strip is drawn at.
 */
function onGapState(json: string): void {
    var state: {
        active?: boolean;
        paused?: boolean;
        visible?: boolean;
        stripHeight?: number;
    };
    try {
        state = JSON.parse(json);
    } catch (e) {
        return;
    }
    qbSetStripHeight(state.stripHeight);
    qbPaused = !!state.paused;
    qbVisible = state.visible !== false;
    qbActive = !!state.active || qbPaused;
    // The strip going away or going live is the end of the editing the debounce
    // was waiting out, so nothing sits in the queue across it.
    if (!qbPaused || !qbVisible) {
        qbFlushApplies();
    }
    document.body.setAttribute('data-state',
        state.paused ? 'paused' : (state.active ? 'running' : 'idle'));
    qbSetEnabled(qbPaused);
    qbSetReportEnabled(qbActive);
    // After `qbSetEnabled`, which knows nothing about an empty preset list.
    qbRenderPreset();
    if (!qbPaused) {
        qbCloseSheet();
    }
    // The band may just have changed under the chip.
    qbNameHotspot();
    qbSchedule();
    if (qbVisible) {
        qbRequestState();
    }
}

/**
 * The settings page, through the host: something both pages hold has moved.
 *
 * Reading the world again is the whole handler, because the message carries no
 * values. Only worth it while the strip is on screen -- a hidden WebView goes on
 * running, and `onGapState` is what knows the difference -- and `qbRequestState`
 * refuses on its own while a change of this page's is unanswered, which is what
 * stops an answer about the older world landing over a tap.
 */
// noinspection JSUnusedGlobalSymbols
function onGapMessage(topic: string): void {
    if (topic !== PageMessage.LiveSettings && topic !== PageMessage.Presets) {
        return;
    }
    if (topic === PageMessage.Presets) {
        // The list this chip draws its names from has changed -- one saved,
        // deleted, or applied on the other page. It is read from localStorage on
        // every render, so redrawing is the whole of it, and it is worth doing
        // whether or not the strip is showing: one read, and the strip can come
        // back without another word being sent.
        qbRenderPreset();
    }
    if (qbVisible) {
        qbRequestState();
    }
}

/**
 * Every control the markup declared, live or not.
 *
 * The strip used to draw a veil over itself instead, which cost the readings the
 * strip is left up to be read. `disabled` says the same thing without hiding
 * anything, and unlike the veil it refuses the tap itself -- the window is
 * untouchable unless paused anyway, so this is that one fact on the control.
 *
 * All but the Report chip, which lives by the run rather than by the pause:
 * `qbSetReportEnabled`.
 */
function qbSetEnabled(enabled: boolean): void {
    var buttons = document.querySelectorAll('.qb-controls button');
    for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i] as HTMLButtonElement;
        if (button.classList.contains('qb-report')) {
            continue;
        }
        button.disabled = !enabled;
    }
}

/** The Report chip is live whenever there is a run to report on, paused or not. */
function qbSetReportEnabled(enabled: boolean): void {
    var report = document.querySelector('.qb-report') as HTMLButtonElement | null;
    if (report !== null) {
        report.disabled = !enabled;
    }
}

/** The rect last named to the host, so a relayout only sends a change. */
var qbHotspotSent = '';

/**
 * Tells the host where the Report chip is, so it stays pressable mid-run.
 *
 * The strip's window is untouchable while the script runs -- a touchable
 * overlay would eat the taps the script injects -- so a press on Report used
 * to need the run paused first, and pausing presses the game's own Pause
 * button: the report then showed the pause menu rather than the screen that
 * went wrong. The host covers just this rect with a touchable window of its
 * own while the run is going and forwards the presses, so the chip catches
 * the live screen. Geometry only: when the window is up is the host's call.
 *
 * Measured after anything that can move the chip -- the band, a resize, the
 * labels, a redraw that changes a name's length -- and sent on a change alone.
 */
function qbNameHotspot(): void {
    var bridge = qbBridge();
    if (bridge === undefined || !bridge.setQuickBarHotspot) {
        return;
    }
    var report = document.querySelector('.qb-report');
    if (report === null) {
        return;
    }
    var box = report.getBoundingClientRect();
    var left = Math.floor(box.left);
    var top = Math.floor(box.top);
    var width = Math.ceil(box.right) - left;
    var height = Math.ceil(box.bottom) - top;
    var key = left + ',' + top + ',' + width + ',' + height;
    if (key === qbHotspotSent) {
        return;
    }
    qbHotspotSent = key;
    bridge.setQuickBarHotspot(left, top, width, height);
}

/** The poll runs only while the strip is up; nothing to watch means no cost. */
function qbSchedule(): void {
    if (qbTimer !== undefined) {
        clearInterval(qbTimer);
        qbTimer = undefined;
    }
    if (qbVisible) {
        qbTimer = setInterval(qbRequestState, QB_POLL_MS);
    }
}

// --- drawing ---------------------------------------------------------------

/** Every cell the markup declared, in document order. */
function qbCells(): HTMLElement[] {
    var found = document.querySelectorAll('.qb-cell[data-key]');
    var cells: HTMLElement[] = [];
    for (var i = 0; i < found.length; i++) {
        cells.push(found[i] as HTMLElement);
    }
    return cells;
}

/**
 * The options a dropdown cell offers, by the key its markup declares.
 *
 * Both lists are shared files compiled into this page as well as the settings
 * one (`src/skillOptions.ts`, `src/bubbleOptions.ts`), so neither is a copy of
 * the panel's. A `.qb-select` cell whose key is not here draws a dash and opens
 * nothing -- see the contract at the top of quickbar.html.
 */
function qbOptionsFor(key: string): QbOption[] | undefined {
    if (key === SettingKey.SkillType) {
        return SkillOptions;
    }
    if (key === SettingKey.BubbleStrategy) {
        return BubbleOptions;
    }
    return undefined;
}

/**
 * What the two option lists have in common, which is all this page needs of
 * either. `short` is the Quick Bar's own name for an entry where the full one is
 * too long for a chip -- the bubble strategies have one, the skills do not.
 */
interface QbOption {
    key: string;
    title: UiText;
    short?: UiText;
    group?: UiText;
    enables?: SettingKey[];
    /** Only the skills carry one -- see `ReleaseStatus` in `src/skillOptions.ts`. */
    status?: ReleaseStatus;
}

/**
 * Colours an element for an unfinished option, and answers which badge it wants.
 *
 * The colour is all the chip has room for; the sheet takes the badge too. Both
 * are redrawn from scratch on every pass, so the attribute is removed rather
 * than left behind when the pick becomes a finished skill.
 */
function qbSetStatusOnly(element: HTMLElement, status: ReleaseStatus | undefined): StatusFlag | undefined {
    var flag = statusFlag(status);
    if (flag === undefined) {
        element.removeAttribute('data-status');
        return undefined;
    }
    element.setAttribute('data-status', flag.name);
    return flag;
}

/**
 * The colour, plus the pill after the name.
 *
 * Called after whatever set the element's `textContent`, so a redraw replaces
 * the badge rather than adding a second.
 */
function qbDrawFlag(element: HTMLElement, status: ReleaseStatus | undefined): void {
    var flag = qbSetStatusOnly(element, status);
    var template = document.getElementById('tpl-flag') as HTMLTemplateElement | null;
    if (flag === undefined || template === null) {
        return;
    }
    var pill = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    pill.textContent = i18nText(flag.title);
    element.appendChild(pill);
}

/** The status of the option a dropdown cell is showing, if it has one. */
function qbOptionStatus(items: QbOption[] | undefined, id: string): ReleaseStatus | undefined {
    for (var i = 0; items !== undefined && i < items.length; i++) {
        if (items[i].key === id) {
            return items[i].status;
        }
    }
    return undefined;
}

/** The chip's label for a picked option: its short name where it has one. */
function qbOptionTitle(items: QbOption[] | undefined, id: string): string {
    for (var i = 0; items !== undefined && i < items.length; i++) {
        if (items[i].key === id) {
            return i18nText(items[i].short || items[i].title);
        }
    }
    return id === '' ? '—' : id;
}

/** A whole redraw from `qbState`. Cheap enough that nothing does it partially. */
function qbRender(): void {
    var cells = qbCells();
    // Split once rather than per cell: this runs on every tap and every reply.
    var held = String(qbState.nextRound || '').split(' ');
    var inRound = qbState.inRound === true;
    for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        var key = cell.getAttribute('data-key')!;
        // A cell for a setting this channel does not offer is not on the strip
        // either -- the settings panel does not draw its row, so the strip must
        // not be the way round it. `data-status` is how the markup says so.
        var offered = offeredHere(statusNamed(cell.getAttribute('data-status')));
        cell.hidden = !offered;
        if (!offered) {
            continue;
        }
        var value = qbState[key];
        var toggle = cell.querySelector('.qb-toggle');
        var number = cell.querySelector('.qb-value');
        var select = cell.querySelector('.qb-select-value');
        if (toggle !== null) {
            toggle.setAttribute('aria-checked', value === true ? 'true' : 'false');
        } else if (number !== null) {
            number.textContent = typeof value === 'number' ? String(value) : '—';
        } else if (select !== null) {
            var options = qbOptionsFor(key);
            var picked = typeof value === 'string' ? value : '';
            select.textContent = qbOptionTitle(options, picked);
            // The chip is a few characters wide, so it takes the colour and not
            // the pill -- the sheet behind it draws both.
            qbSetStatusOnly(select as HTMLElement, qbOptionStatus(options, picked));
        }
        // When a change to this cell would take effect, which is a question only
        // a round in progress raises -- see *now, or at the next round* in
        // quickbar.css, and `LiveSettings` in src/quickbar.ts for the answer.
        if (inRound) {
            cell.setAttribute('data-when', held.indexOf(key) >= 0 ? 'nextRound' : 'now');
        } else {
            cell.removeAttribute('data-when');
        }
    }
    qbSetStat('baseCoinAvg', qbState.baseCoinAvg);
    qbSetStat('finalCoinAvg', qbState.finalCoinAvg);
    qbSetStat('roundCount', qbState.rounds);
    qbRenderPreset();
}

/**
 * The preset chip: which saved configuration the settings currently are.
 *
 * Matched against the *store* rather than against `qbState`, because a preset is
 * a whole form and `quickBarState()` reports only the rows a run can take live.
 * The store is the copy both pages keep current -- this page patches it at every
 * flush (`qbRemember`), the settings page rewrites it at every save -- so it is
 * the only place the whole configuration exists on this side of the bridge.
 */
function qbRenderPreset(): void {
    var value = document.querySelector('.qb-preset-value');
    var chip = document.querySelector('.qb-preset') as HTMLButtonElement | null;
    if (value === null) {
        return;
    }
    var list = presetsLoad();
    var name = presetMatchName(list, qbStoredSettings());
    value.textContent = name !== '' ? name : '—';
    value.setAttribute('data-empty', name === '' ? 'true' : 'false');
    if (chip !== null) {
        // Drawn dead rather than taken away: the strip is read at a glance, and
        // a control that comes and goes is one you stop looking for.
        chip.disabled = !qbPaused || list.length === 0;
        // `both`, because a preset is not one setting: it moves the rows a round
        // can take now *and* the ones the whistle has to apply. The cell rather
        // than the chip, so the CSS reads it the same way it reads every other
        // cell -- this one just has no `data-key` to be found through.
        var cell = chip.parentElement;
        if (cell !== null) {
            if (qbState.inRound === true) {
                cell.setAttribute('data-when', 'both');
            } else {
                cell.removeAttribute('data-when');
            }
        }
    }
    // The block is centred at its content's width, so a name of a different
    // length here -- or a value `qbRender` just drew -- moves the Report chip.
    qbNameHotspot();
}

/**
 * The settings page's own stored object -- the whole form, not the live subset.
 *
 * Empty when it holds nothing usable, which is what a device that has never
 * opened the settings page looks like.
 */
function qbStoredSettings(): SettingValues {
    if (typeof localStorage === 'undefined' || localStorage === null) {
        return {};
    }
    try {
        return JSON.parse(localStorage.getItem(StorageKey.Settings) || '{}') || {};
    } catch (e) {
        return {};
    }
}

/** `-1` is the engine saying no round has reported one; a dash, not a zero. */
function qbSetStat(id: string, value: string | number | boolean | undefined): void {
    var element = document.getElementById(id);
    if (element === null) {
        return;
    }
    element.textContent = typeof value === 'number' && value >= 0
        ? qbGrouped(value) : '—';
}

/** Thousands separated by hand: `toLocaleString` is not reliable in this WebView. */
function qbGrouped(value: number): string {
    var text = String(Math.round(value));
    var out = '';
    for (var i = 0; i < text.length; i++) {
        if (i > 0 && (text.length - i) % 3 === 0) {
            out += ',';
        }
        out += text.charAt(i);
    }
    return out;
}

// --- writing ---------------------------------------------------------------

/**
 * Takes one change: draws it, and queues it for the engine.
 *
 * Drawn from here rather than from the engine's reply, which is the swap the
 * debounce needs -- the strip has to show the tap at once, and the next tap has
 * to step off the value this one produced rather than off the last one the
 * engine confirmed. The reply is still what settles it: `quickBarState()` after
 * the flush is the running world, clamp included, and overwrites this.
 */
function qbApply(key: string, value: string | number | boolean): void {
    if (!qbPaused || qbBridge() === undefined) {
        return;
    }
    qbState[key] = value;
    qbPending[key] = value;
    qbRender();
    if (qbApplyTimer !== undefined) {
        clearTimeout(qbApplyTimer);
    }
    qbApplyTimer = setTimeout(qbFlushApplies, QB_APPLY_DEBOUNCE_MS);
}

/**
 * Sends everything queued: one apply per setting, whatever it was tapped to
 * last, and one localStorage write for the lot.
 *
 * Called by the timer, and directly wherever the queue must not outlive the
 * moment -- the strip being unpaused or taken away, and a preset being loaded,
 * which overrules whatever is queued and must not be undone by it afterwards.
 */
function qbFlushApplies(): void {
    if (qbApplyTimer !== undefined) {
        clearTimeout(qbApplyTimer);
        qbApplyTimer = undefined;
    }
    var bridge = qbBridge();
    var keys = Object.keys(qbPending);
    // The queue is only emptied into something that can carry it; with no bridge
    // it stays put rather than being dropped on the floor.
    if (bridge === undefined || keys.length === 0) {
        return;
    }
    var sending = qbPending;
    qbPending = {};
    qbOverlay(qbSent, sending);
    for (var i = 0; i < keys.length; i++) {
        qbInFlight++;
        bridge.runScriptCallback(
            'quickBarApply(' + JSON.stringify(keys[i]) + ','
            + JSON.stringify(sending[keys[i]]) + ')',
            'onQuickBarApplied');
    }
    qbRemember(sending);
}

/**
 * Loads a preset: the whole configuration, onto the store and onto the run.
 *
 * `applyLiveSettings` rather than one `quickBarApply` per key, because a preset
 * is a form and that is the entry point that takes one -- the same one the
 * settings page's own save goes through, so the two cannot disagree about what
 * a run in progress will take from it. Most of a preset lands there and then;
 * the tsum on the board and the colours it was dealt with wait for the next
 * round (`LiveSettings`, src/quickbar.ts), and `autoPlayGame` and
 * `clickAssist` wait for the next `start()` because they choose the task set.
 * All three cases go to the store as well, which is what the next start reads.
 *
 * One difference from the settings page's own load, and it is a limit rather
 * than a choice: that page writes every shareable row, putting the ones the
 * preset does not name back to their defaults, and this page has no schema to
 * know what those are. It only matters for a preset saved before a setting
 * existed, where the strip leaves that setting alone and the panel would reset
 * it. The name the chip draws agrees either way -- a preset is matched on the
 * keys it names.
 */
function qbApplyPreset(preset: Preset): void {
    var bridge = qbBridge();
    if (!qbPaused || bridge === undefined) {
        return;
    }
    // Ahead of the preset, so a value tapped and then overruled by it is not put
    // back afterwards by a send the debounce was still holding.
    qbFlushApplies();
    // The store first: it is where the rows no run can take live have to land,
    // and where the chip below reads the name it is about to draw from.
    qbRemember(preset.values);
    // Drawn from the preset rather than from the reply, as `qbApply` is -- and
    // held in `qbSent` for the same reason, so a state read already on its way
    // cannot land the old values over these.
    qbOverlay(qbState, preset.values);
    qbOverlay(qbSent, preset.values);
    qbRender();
    qbLogInfo(Log.QuickBar.PresetApplied, 'A preset was loaded from the Quick Bar',
        {preset: preset.name});
    qbInFlight++;
    // Guarded, as everything this page evaluates is: with no script started the
    // bare name is a ReferenceError in the engine's log rather than here.
    bridge.runScriptCallback('typeof applyLiveSettings === "function" ? applyLiveSettings('
        + JSON.stringify(preset.values) + ') : "no run"', 'onQuickBarPresetApplied');
}

/**
 * The engine has taken the preset; tell the settings page and redraw.
 *
 * `Presets` rather than `LiveSettings`, and that is the whole point of the
 * second topic: most of what just moved went to the store rather than to the
 * engine, so a page that only re-read the run would take back half of it at its
 * next save.
 */
function onQuickBarPresetApplied(): void {
    qbInFlight = qbInFlight > 0 ? qbInFlight - 1 : 0;
    if (qbInFlight === 0) {
        qbSent = {};
    }
    var bridge = qbBridge();
    if (bridge !== undefined && bridge.broadcast !== undefined) {
        bridge.broadcast(PageMessage.Presets);
    }
    qbRequestState();
}

// --- reporting a problem ---------------------------------------------------

/** How long the chip says "Saved" before going back to its own word. */
var QB_REPORT_SAID_MS = 6000;
var qbReportTimer: number | undefined;

/**
 * Asks the engine to write an issue report of what is on screen.
 *
 * The one control here that changes nothing, so it goes through none of the
 * apply machinery: no debounce, no `qbState`, no localStorage, and nothing for
 * the settings page to be nudged about. What it writes is `reportIssue`
 * (src/report.ts).
 *
 * Not gated on the pause, unlike every other press: the run is what a report
 * needs, and the host keeps this one chip touchable while the run is going
 * (`qbNameHotspot`). Pressed mid-round, the engine writes the report between
 * two steps of the play loop, so the screen it catches is the live one.
 */
function qbReport(): void {
    var bridge = qbBridge();
    if (!qbActive || bridge === undefined) {
        return;
    }
    // Anything the debounce is still holding goes down first, so the settings
    // the report writes down are the ones the strip has actually asked for.
    qbFlushApplies();
    qbLogInfo(Log.QuickBar.ReportAsked, 'A report was asked for from the Quick Bar');
    bridge.runScriptCallback('typeof reportIssue === "function" ? reportIssue('
        + JSON.stringify('quickBar') + ',"") : "no script"', 'onQuickBarReport');
}

/**
 * The engine's answer: a report id, or a sentence saying why there is none.
 *
 * The chip itself says what happened rather than a toast or a line in the log
 * HUD -- the strip is what the user is looking at, and it is the only surface
 * here that is certainly on screen. The engine banners the id beside it.
 */
function onQuickBarReport(answer: string): void {
    var found = document.querySelector('.qb-report') as HTMLElement | null;
    if (found === null) {
        return;
    }
    var chip = found;
    var id = String(answer === undefined || answer === null ? '' : answer);
    // An id always begins with the UTC stamp `report.ts` builds it from, so its
    // shape is the whole test -- anything else is one of the refusals.
    if (!/^\d{8}-\d{6}-/.test(id)) {
        qbLog(Log.QuickBar.ReportFailed, 'The engine wrote no report', {why: id});
        return;
    }
    chip.setAttribute('data-said', 'saved');
    if (qbReportTimer !== undefined) {
        clearTimeout(qbReportTimer);
    }
    qbReportTimer = setTimeout(function () {
        chip.removeAttribute('data-said');
        qbReportTimer = undefined;
    }, QB_REPORT_SAID_MS);
}

/**
 * Tells the settings page that the running world has moved.
 *
 * `qbRemember` below carries a change to the *next* run; this carries it to the
 * form that is on screen. That page reads its store once at load and is never
 * reloaded, so without this it learns of a change only on its own poll -- and
 * Play pressed before that poll starts the next run on what it was still
 * showing, quietly undoing the change.
 *
 * Feature-detected: the host provides it, so the preview fixture and a desktop
 * browser have none and fall back on that poll.
 */
function qbNudgePages(): void {
    var bridge = qbBridge();
    if (bridge !== undefined && bridge.broadcast !== undefined) {
        bridge.broadcast(PageMessage.LiveSettings);
    }
}

/**
 * Patches the settings page's own stored object, leaving every other key alone.
 *
 * A whole batch at a time: the entry is read, patched and written back, and
 * doing that per setting would re-parse it once per tap for nothing.
 */
function qbRemember(values: { [key: string]: string | number | boolean }): void {
    if (typeof localStorage === 'undefined' || localStorage === null) {
        return;
    }
    var stored: { [key: string]: string | number | boolean } = {};
    try {
        var json = localStorage.getItem(StorageKey.Settings);
        if (json) {
            stored = JSON.parse(json) || {};
        }
        qbOverlay(stored, values);
        localStorage.setItem(StorageKey.Settings, JSON.stringify(stored));
    } catch (e) {
        qbLog(Log.QuickBar.ApplyFailed, 'The Quick Bar could not save a setting for the next run',
            {settings: Object.keys(values).join(' ')});
    }
}

// --- the sheets ------------------------------------------------------------

var qbSheet: HTMLElement | undefined;

/**
 * The sheet itself: the scrim, the window the host has to grow for it, and
 * nothing about what is in it.
 *
 * `fill` puts the rows in. Two lists open into this -- the skills and the
 * presets -- and everything they share is here.
 */
function qbShowSheet(fill: (list: Element) => void): void {
    if (!qbPaused || qbSheet !== undefined) {
        return;
    }
    var template = document.getElementById('tpl-sheet') as HTMLTemplateElement;
    if (template === null) {
        return;
    }
    var sheet = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    fill(sheet.querySelector('.qb-list')!);
    sheet.querySelector('.qb-scrim')!.addEventListener('click', qbCloseSheet);
    document.body.appendChild(sheet);
    qbSheet = sheet;
    // The strip is only as tall as the strip; the list needs the host to grow
    // the window before it has anywhere to open.
    var bridge = qbBridge();
    if (bridge !== undefined && bridge.setQuickBarExpanded) {
        bridge.setQuickBarExpanded(true);
    }
}

/** The saved presets, by name. Picking one loads the whole configuration. */
function qbOpenPresetSheet(): void {
    var option = document.getElementById('tpl-option') as HTMLTemplateElement;
    var list = presetsLoad();
    if (option === null || list.length === 0) {
        return;
    }
    var current = presetMatchName(list, qbStoredSettings());
    qbShowSheet(function (box) {
        for (var i = 0; i < list.length; i++) {
            (function (preset: Preset) {
                var button = option.content.firstElementChild!.cloneNode(true) as HTMLElement;
                // The user's own text, so it is set as text and never looked up
                // as a `UiText` key the way an option's name usually is.
                button.textContent = preset.name;
                button.setAttribute('aria-selected', preset.name === current ? 'true' : 'false');
                button.addEventListener('click', function () {
                    qbApplyPreset(preset);
                    qbCloseSheet();
                });
                box.appendChild(button);
            })(list[i]);
        }
    });
}

/** The list a dropdown cell opens, whichever setting it drives. */
function qbOpenSheet(key: string): void {
    var option = document.getElementById('tpl-option') as HTMLTemplateElement;
    var items = qbOptionsFor(key);
    if (option === null || items === undefined) {
        return;
    }
    qbShowSheet(function (list) {
        qbFillOptions(list, option, key, items!);
    });
}

/**
 * One list of options into an open sheet.
 *
 * Written against what the two shared lists have in common rather than against
 * either, so a third dropdown on the strip is a `qbOptionsFor` entry and nothing
 * here. The sheet has the room the chip does not, so it draws each entry's full
 * `title` even where the chip drew its `short`.
 */
function qbFillOptions(list: Element, option: HTMLTemplateElement,
                       key: string, items: QbOption[]): void {
    var current = qbState[key];
    var heading = document.getElementById('tpl-group') as HTMLTemplateElement | null;
    var group: UiText | undefined;

    for (var i = 0; i < items.length; i++) {
        // A new block wherever the list changes group -- the same headings the
        // settings page draws, off the same list. A list with no groups at all,
        // like the bubble strategies, never enters this.
        if (items[i].group !== group) {
            group = items[i].group;
            if (group !== undefined && heading !== null) {
                var label = heading.content.firstElementChild!.cloneNode(true) as HTMLElement;
                label.textContent = i18nText(group);
                list.appendChild(label);
            }
        }
        (function (choice: QbOption) {
            var button = option.content.firstElementChild!.cloneNode(true) as HTMLElement;
            button.textContent = i18nText(choice.title);
            qbDrawFlag(button, choice.status);
            button.setAttribute('aria-selected', choice.key === current ? 'true' : 'false');
            button.addEventListener('click', function () {
                qbApply(key, choice.key);
                // Whatever this option cannot be played without, switched on with
                // it -- the same list the settings page reads
                // (`SettingSpec.enables`). Second, so the pick is already the new
                // one when they land.
                var needs = choice.enables;
                for (var n = 0; needs !== undefined && n < needs.length; n++) {
                    qbApply(needs[n], true);
                }
                // One deliberate pick rather than a control being nudged, so it
                // goes now -- with whatever it switched on, in the same batch.
                qbFlushApplies();
                qbCloseSheet();
            });
            list.appendChild(button);
        })(items[i]);
    }
}

function qbCloseSheet(): void {
    if (qbSheet === undefined) {
        return;
    }
    qbSheet.parentNode!.removeChild(qbSheet);
    qbSheet = undefined;
    var bridge = qbBridge();
    if (bridge !== undefined && bridge.setQuickBarExpanded) {
        bridge.setQuickBarExpanded(false);
    }
}

// --- wiring ----------------------------------------------------------------

/**
 * Binds every control the markup declared.
 *
 * By class inside the cell, never by id or position, so the markup can be
 * rearranged freely -- see the note at the top of quickbar.html for the three
 * things it does have to keep.
 */
function qbBind(): void {
    // The one control that is a whole configuration rather than one setting, so
    // it carries no `data-key` and has no cell to be found through.
    var preset = document.querySelector('.qb-preset');
    if (preset !== null) {
        preset.addEventListener('click', qbOpenPresetSheet);
    }

    // The other control that is not a setting -- it changes nothing at all.
    var report = document.querySelector('.qb-report');
    if (report !== null) {
        report.addEventListener('click', qbReport);
    }

    var cells = qbCells();
    for (var i = 0; i < cells.length; i++) {
        (function (cell: HTMLElement) {
            var key = cell.getAttribute('data-key')!;
            var toggle = cell.querySelector('.qb-toggle');
            var select = cell.querySelector('.qb-select');
            var steps = cell.querySelectorAll('[data-step]');

            if (toggle !== null) {
                toggle.addEventListener('click', function () {
                    qbApply(key, qbState[key] !== true);
                });
            }
            if (select !== null) {
                select.addEventListener('click', function () {
                    qbOpenSheet(key);
                });
            }
            for (var s = 0; s < steps.length; s++) {
                (function (step: Element) {
                    step.addEventListener('click', function () {
                        var current = qbState[key];
                        if (typeof current !== 'number') {
                            return;
                        }
                        var min = Number(cell.getAttribute('data-min'));
                        var max = Number(cell.getAttribute('data-max'));
                        var next = current + Number(step.getAttribute('data-step'));
                        // Clamped here as well as in the engine: the engine's
                        // clamp is what makes the value safe, and this one is
                        // what stops the button looking broken at the end.
                        if (next < min) { next = min; }
                        if (next > max) { next = max; }
                        if (next !== current) {
                            qbApply(key, next);
                        }
                    });
                })(steps[s]);
            }
        })(cells[i]);
    }
}

/** As the settings page: the script is in <head>, so wait for the markup. */
document.addEventListener('DOMContentLoaded', function () {
    // The strip's own labels are written in quickbar.html as `data-i18n` keys,
    // which is what keeps its layout editable without touching this file. Once,
    // here: the language is picked on the settings page, and this page is
    // reloaded by the host rather than redrawn.
    // Before anything is read: this is what the strip is drawn at, and getting
    // it after the first paint means a visible jump.
    qbMeasureStrip();
    // The host resizes this window whenever the status line comes or goes, and
    // the resize is the one telling that cannot go missing. The Report chip
    // moves with the band, so the host is told where it landed.
    window.addEventListener('resize', function () {
        qbMeasureStrip();
        qbNameHotspot();
    });
    document.documentElement.lang = i18nLocale();
    i18nApplyToDom(document);
    qbBind();
    // Dead until the host says otherwise: `data-state` starts at `idle`.
    qbSetEnabled(false);
    qbSetReportEnabled(false);
    // Before the first reply, and without one: the preset chip reads
    // localStorage, so it has its name to draw with no engine behind it at all.
    // After the labels are in, so the hotspot it names is measured on them.
    qbRenderPreset();
    qbRequestState();
});
