// Presets: named configurations, and the one store both pages read them from.
//
// A preset is a name and **how a round is played** -- exactly the rows
// `SHARE_SLOTS` (src/settings.ts) names, which is the Gameplay and Skills tabs
// less the few rows that shape the run rather than the round (Auto Play Game,
// the between-rounds delay, Track round statistics). Not the language, not the
// device, not the chores, the mailbox or the hearts either: those describe the
// account, and switching between setups should not touch any of it.
//
// Saving one takes a copy of those rows as the form has them; loading one writes
// that copy back, so switching presets is switching rather than merging.
//
// ## Why the values are stored and not the code
//
// A preset holds precisely what a settings code carries, and the code is what an
// export is written in -- so the two are the same content in two spellings, and
// the code would be the tidier thing to keep. It is not what is kept, for one
// reason: **the Quick Bar cannot decode one.** Decoding needs the schema -- each
// row's type, its range, and each dropdown's `share` ids -- and that lives in
// the settings page's `tabs`, which the strip's compilation does not have. The
// values are the form both pages can read; the code is built from them, on the
// page that can.
//
// ## Why it is its own file
//
// Both pages need it. The settings page saves, deletes and applies; the Quick
// Bar's strip lists the names and applies one mid-run. Neither can reach the
// other's script -- they are separate compilations in separate WebViews -- so
// this is compiled into both, the way `src/skillOptions.ts` is.
//
// Nothing here touches the DOM or the host bridge. What a page does *with* a
// preset once it has it -- writing rows, pushing the run, nudging the other page
// -- is that page's own business.

/**
 * The longest a preset name may be.
 *
 * The name is drawn in the app bar and in a Quick Bar chip, both of which
 * ellipsise; this is what stops one being long enough to be nothing but an
 * ellipsis, and what bounds the store.
 */
var PRESET_NAME_MAX = 40;

/** How many presets may be kept. Well past what a player will name. */
var PRESET_MAX = 32;

/** Trims a typed name to what may be stored; '' when nothing is left. */
function presetCleanName(raw: string): string {
    // Collapsed as well as trimmed: two names differing only in their spacing
    // read as the same name and would be two rows in the list.
    var name = String(raw === undefined || raw === null ? '' : raw)
        .replace(/\s+/g, ' ').replace(/^ | $/g, '');
    return name.length > PRESET_NAME_MAX ? name.substring(0, PRESET_NAME_MAX) : name;
}

/** True for the value types a settings row can hold. */
function presetIsValue(value: unknown): boolean {
    var kind = typeof value;
    return kind === 'boolean' || kind === 'number' || kind === 'string';
}

/**
 * Every stored preset, in name order.
 *
 * Anything unreadable answers with an empty list rather than throwing: this is
 * read on every render of both pages, and a store someone has hand-edited into
 * nonsense is a reason to show no presets, not to take the page down with it.
 */
function presetsLoad(): Preset[] {
    if (typeof localStorage === 'undefined' || localStorage === null) {
        return [];
    }
    var raw: unknown;
    try {
        raw = JSON.parse(localStorage.getItem(StorageKey.Presets) || '[]');
    } catch (e) {
        return [];
    }
    if (Object.prototype.toString.call(raw) !== '[object Array]') {
        return [];
    }
    var list: Preset[] = [];
    var entries = raw as Preset[];
    for (var i = 0; i < entries.length && list.length < PRESET_MAX; i++) {
        var entry = entries[i];
        if (entry === null || typeof entry !== 'object') {
            continue;
        }
        var name = presetCleanName(entry.name);
        if (name === '' || entry.values === null || typeof entry.values !== 'object') {
            continue;
        }
        var values: SettingValues = {};
        for (var key in entry.values) {
            if (presetIsValue(entry.values[key])) {
                values[key] = entry.values[key];
            }
        }
        list.push({name: name, values: values});
    }
    return presetsSorted(list);
}

/** Writes the list back, in name order. Silent on a store that refuses. */
function presetsStore(list: Preset[]): boolean {
    if (typeof localStorage === 'undefined' || localStorage === null) {
        return false;
    }
    try {
        localStorage.setItem(StorageKey.Presets, JSON.stringify(presetsSorted(list)));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * By name, case-insensitively, so a list read on either page is in the same
 * order and a new preset lands where the user will look for it.
 */
function presetsSorted(list: Preset[]): Preset[] {
    return list.slice().sort(function (a, b) {
        var left = a.name.toLowerCase();
        var right = b.name.toLowerCase();
        return left < right ? -1 : (left > right ? 1 : 0);
    });
}

/** Where `name` sits in the list, or -1. Case-insensitive: names are labels. */
function presetIndexOf(list: Preset[], name: string): number {
    var wanted = presetCleanName(name).toLowerCase();
    for (var i = 0; i < list.length; i++) {
        if (list[i].name.toLowerCase() === wanted) {
            return i;
        }
    }
    return -1;
}

/** The preset called `name`, or undefined. */
function presetByName(list: Preset[], name: string): Preset | undefined {
    var at = presetIndexOf(list, name);
    return at < 0 ? undefined : list[at];
}

/**
 * The list with `name` saved, replacing an existing one of that name.
 *
 * The spelling the user typed wins on a replace, so correcting a name's case is
 * a save rather than a delete and a save.
 */
function presetsPut(list: Preset[], name: string, values: SettingValues): Preset[] {
    var clean = presetCleanName(name);
    var copy: SettingValues = {};
    for (var key in values) {
        if (presetIsValue(values[key])) {
            copy[key] = values[key];
        }
    }
    var next = list.slice();
    var at = presetIndexOf(next, clean);
    if (at >= 0) {
        next[at] = {name: clean, values: copy};
    } else {
        next.push({name: clean, values: copy});
    }
    return presetsSorted(next);
}

/** The list without `name`. */
function presetsWithout(list: Preset[], name: string): Preset[] {
    var at = presetIndexOf(list, name);
    if (at < 0) {
        return list.slice();
    }
    var next = list.slice();
    next.splice(at, 1);
    return next;
}

/**
 * Which preset `values` currently *is*, or '' for none.
 *
 * Matching rather than remembering what was last applied: a setting changed by
 * hand afterwards has to stop the label claiming that preset, and there is no
 * one place either page could hook to notice that. Every value the preset names
 * has to agree; a key the preset does not name is not looked at, so a preset
 * saved before a setting existed still matches once that setting is at whatever
 * the form has.
 */
function presetMatchName(list: Preset[], values: SettingValues): string {
    for (var i = 0; i < list.length; i++) {
        var preset = list[i];
        var same = true;
        for (var key in preset.values) {
            if (preset.values[key] !== values[key]) {
                same = false;
                break;
            }
        }
        if (same) {
            return preset.name;
        }
    }
    return '';
}

// Exporting is `presetsExportText` in `src/settings.ts` rather than here: it
// writes one settings code per preset, and building a code needs the schema --
// the defaults to compare against and each dropdown's `share` ids -- which only
// that page has.
