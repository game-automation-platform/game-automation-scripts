// The page-side i18n runtime: which language, and the text for a key in it.
//
// Both WebView pages load this -- the settings page and the Quick Bar -- ahead
// of their own script and ahead of the catalogues, which register themselves
// into `gLocales` as they load. Adding a language is therefore additive: write
// one `src/ui<Tag>.ts`, list it in the two page tsconfigs and the two HTML
// files, and it appears in the picker with no other file touched.
//
// ## What a catalogue owes
//
// English (`src/uiEn.ts`) is the reference and is typed `UiStrings`, so it must
// be complete -- a new `UiText` member fails the build until it has English
// text. Every other language is `UiStringsPartial` and falls back to English key
// by key. That is deliberate: forcing a translation to be finished before it
// compiles is what stops languages being added at all, and an English line in a
// mostly-Chinese page is better than a blank one. `npm run i18n:check` reports
// what each language is still missing.
//
// ## Why nothing here is resolved early
//
// Text is looked up at *render* time, never at load time. The language can
// change while the page is up -- the picker redraws rather than reloads, since
// the host delivers this document with no URL of its own to reload -- so a
// string resolved into a data structure at load would be stuck in whatever
// language the page opened in. That is what `i18nThunk` is for.

/**
 * Every registered language, in the order their files loaded -- which is the
 * order the picker offers them.
 */
var gLocales: LocaleEntry[] = [];

/** English, held aside: it is what every other language falls back to. */
var gLocaleFallback: UiStringsPartial | undefined;

/**
 * Adds one language. Called by each catalogue file as it loads.
 *
 * The first one registered is the fallback, which is why `uiEn.js` is loaded
 * first: English is the only complete catalogue, so it is the only one that can
 * answer for a key another language has not translated yet.
 */
function i18nRegister(tag: Locale, endonym: string, strings: UiStringsPartial): void {
    gLocales.push({tag: tag, endonym: endonym, strings: strings});
    if (gLocaleFallback === undefined) {
        gLocaleFallback = strings;
    }
}

/** Every registered language. The picker draws itself from this. */
function i18nLocales(): LocaleEntry[] {
    return gLocales;
}

/**
 * The language the page is in.
 *
 * A stored tag that no catalogue claims -- a language that was removed, or a
 * page opened with someone else's localStorage -- reads as the fallback rather
 * than leaving the page blank.
 */
function i18nLocale(): Locale {
    var stored = typeof localStorage !== 'undefined' && localStorage !== null
        ? localStorage.getItem(StorageKey.Language) : null;
    for (var i = 0; i < gLocales.length; i++) {
        if (gLocales[i].tag === stored) {
            return gLocales[i].tag;
        }
    }
    return gLocales.length > 0 ? gLocales[0].tag : Locale.English;
}

/** Remembers `tag` as the chosen language. Redrawing is the caller's job. */
function i18nStore(tag: Locale): void {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
        localStorage.setItem(StorageKey.Language, tag);
    }
}

/** The active catalogue, or undefined before any has registered. */
function i18nActive(): UiStringsPartial | undefined {
    var tag = i18nLocale();
    for (var i = 0; i < gLocales.length; i++) {
        if (gLocales[i].tag === tag) {
            return gLocales[i].strings;
        }
    }
    return gLocaleFallback;
}

/**
 * The text for `key` in the current language.
 *
 * Falls back to English, and then to the key itself -- which is a visible,
 * greppable `setting.newThing` on the page rather than an `undefined` or a
 * blank row, so a string added without a catalogue line says so.
 */
function i18nText(key: UiText): string {
    var active = i18nActive();
    var found = active !== undefined ? active[key] : undefined;
    if (typeof found === 'string') {
        return found;
    }
    var english = gLocaleFallback !== undefined ? gLocaleFallback[key] : undefined;
    return typeof english === 'string' ? english : key;
}

/**
 * As `i18nText`, with `{named}` placeholders filled from `values`.
 *
 * Named rather than positional because word order is the first thing a
 * translation changes: "Waits 5 min between rounds" and 每局之間休息 5 分鐘 put
 * the number in different places, and neither sentence has to know that. A
 * placeholder with no value is left as it stands, so a missing one is visible.
 */
function i18nFormat(key: UiText, values: { [name: string]: string | number }): string {
    return i18nText(key).replace(/\{([A-Za-z0-9_]+)\}/g, function (whole, name) {
        var value = values[name];
        return value === undefined ? whole : String(value);
    });
}

/**
 * `key`, as something to call at render time.
 *
 * Button labels are held in the settings schema, which is built once at load;
 * a thunk is what lets the language change under them. The locale picker's own
 * buttons pass a thunk of their endonym instead, which is why this is a
 * function rather than a key on the spec.
 */
function i18nThunk(key: UiText): () => string {
    return function () {
        return i18nText(key);
    };
}

/**
 * Fills in every `data-i18n` element under `root`.
 *
 * The Quick Bar's text is written in its markup rather than by its script --
 * that is what keeps the strip's layout editable without touching code -- so
 * the markup names a key and this puts the language on it. Call it after the
 * markup is up, and again whenever the language changes.
 */
function i18nApplyToDom(root: ParentNode): void {
    var marked = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < marked.length; i++) {
        var element = marked[i] as HTMLElement;
        var key = element.getAttribute('data-i18n');
        if (key !== null) {
            element.textContent = i18nText(key as UiText);
        }
    }
}
