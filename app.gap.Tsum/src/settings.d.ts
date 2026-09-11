// Ambient declarations for the host's WebViews -- the settings page
// (settings.ts) and the Quick Bar (quickbarPage.ts).
//
// Neither runs on the device script side, so both see a completely different
// set of globals: the DOM and the `JavaScriptInterface` bridge. None of the
// device API in globals.d.ts exists here -- reaching it means sending a source
// string through `JavaScriptInterface.runScript`.
//
// Emits nothing. Included by tsconfig.settings.json and tsconfig.quickbar.json.

/**
 * The bridge into the device script. Everything crossing it is JavaScript
 * source as a string, evaluated in the game script's global scope -- which is
 * why `start` and `stop` have to stay global functions there.
 */
declare const JavaScriptInterface: {
  /** Evaluate `script` in the device script's scope, discarding the result. */
  runScript(script: string): void;
  /** As runScript, but pass the result to the global function named `callbackName`. */
  runScriptCallback(script: string, callbackName: string): void;
  showMenu(): void;
  hideMenu(): void;
  /**
   * Put `text` on the system clipboard.
   *
   * Provided by the Game Automation Platform bridge, which is why
   * this is optional and every caller feature-detects it and falls back.
   */
  setClipboard?(text: string): void;
  /**
   * The system clipboard's text, or the empty string when it holds none.
   *
   * Game Automation Platform only, as `setClipboard`. Android only lets an app
   * read the clipboard while it has input focus, so this can come back empty
   * even when the clipboard is not.
   */
  getClipboard?(): string;
  /**
   * Ask the host to make the Quick Bar's window taller, or let it shrink back.
   *
   * The strip is only as tall as the strip, so the skill sheet has nowhere to
   * open until the window grows. Game Automation Platform only, and only the
   * Quick Bar's own WebView has anything to grow -- so, as the clipboard pair
   * above, every caller feature-detects it.
   */
  setQuickBarExpanded?(expanded: boolean): void;
  /**
   * Name the one patch of the Quick Bar that still takes a tap while the run
   * is going -- the Report button -- in the page's own CSS px. The strip is
   * untouchable then, so the host covers this rect with a small touchable
   * window of its own and forwards the presses. Zero width or height
   * withdraws it. Game Automation Platform only; feature-detected.
   */
  setQuickBarHotspot?(left: number, top: number, width: number, height: number): void;
  /**
   * Tell the host's *other* page that something both hold has moved.
   *
   * Game Automation Platform only, as the pair above, so every caller
   * feature-detects it and falls back on the poll that was there before.
   * A page never receives its own broadcast.
   */
  broadcast?(topic: PageMessage): void;
};

/**
 * What one page tells the other through `JavaScriptInterface.broadcast`.
 *
 * A topic names what moved and carries no values. The engine is the one
 * authority on what a setting is set to -- it clamps, and a skill can hold
 * another setting off -- so a page that hears one of these re-reads the running
 * world rather than trusting a value that came sideways. Carrying values here
 * would put a fourth copy of the settings in circulation, which is the drift
 * the three-way sync exists to close.
 *
 * A `const enum`, so nothing exists at runtime but the string, and both pages
 * are checked against the same list.
 */
declare const enum PageMessage {
  /**
   * The running world's live settings have moved; pull them again.
   *
   * Sent by whichever page just had a change confirmed by the engine -- after
   * the confirmation, so the read this provokes cannot overtake the write that
   * caused it.
   */
  LiveSettings = 'liveSettings',
  /**
   * A preset was saved, deleted, or applied.
   *
   * Both halves matter, and which one it was is left to the reader: the *list*
   * changes when the settings page saves or deletes one, and the *stored
   * settings* are rewritten wholesale when either page applies one. So the
   * settings page re-reads the store as well as the run -- a preset carries
   * settings no run can take live, and those exist nowhere but the store -- and
   * the strip re-reads the list it draws its names from.
   */
  Presets = 'presets',
}

/**
 * The localStorage keys the pages share.
 *
 * Two pages read and write the same two entries -- the settings page owns them,
 * and the Quick Bar patches the settings one so a value changed mid-run is
 * still there at the next start. Written once here so they cannot drift; a
 * `const enum`, so nothing exists at runtime but the string.
 */
declare const enum StorageKey {
  Language = 'tsumtsumlanguage',
  Settings = 'tsumtsumsettings2',
  /** The named configurations both pages switch between -- see src/presets.ts. */
  Presets = 'tsumtsumpresets',
}

/** Anything one settings row can hold. */
type SettingValue = boolean | number | string;

/** A whole configuration, or part of one, keyed by `SettingKey`. */
type SettingValues = { [key: string]: SettingValue };

/**
 * One saved configuration, under the name the user gave it.
 *
 * `values` is **how a round is played** and no more -- exactly the set
 * `SHARE_SLOTS` names, so a preset and a settings code carry the same thing and
 * the code is what an export is written in. It is held as values rather than as
 * a code because decoding one needs the settings page's schema, which the Quick
 * Bar's compilation does not have; `src/presets.ts` is the long form.
 */
interface Preset {
  name: string;
  values: SettingValues;
}

/**
 * A row that holds no value, so it is not a setting and never reaches `start()`.
 *
 * It still needs a `key`: that is what the row's element id is built from, and
 * two of these are looked up by it after the page is drawn.
 */
declare const enum RowKey {
  /** The Run order card, which draws itself from the live settings. */
  RunOrder = 'runOrder',
  /** The Copy/Paste buttons; the share panel is inserted under this row. */
  ShareSettings = 'shareSettings',
  /** The preset export buttons; their status line is inserted under this row. */
  ExportPresets = 'exportPresets',
  /** The build stamp on the Debug tab. */
  BuildDate = 'buildDate',
  /** The Report button; its note box and status are inserted under this row. */
  ReportIssue = 'reportIssue',
}

/** One row of the settings schema (a `rows` entry of a `GroupSpec`). */
interface SettingSpec {
  /**
   * What the row names. A settings row carries a `SettingKey` -- the contract
   * with `start()`, so nothing else can be typed here -- a value-less row a
   * `RowKey`, and a `dropdown` entry reuses the field for the option's own
   * value, which is why the skill, bubble, box and round-cap vocabularies are
   * in the union too.
   */
  key?: SettingKey | RowKey | SkillType | BubbleStrategy | BoxType | MaxRoundAction;
  /** A `UiText` key, resolved at render time -- see `src/strings.d.ts`. */
  title?: UiText;
  /**
   * A second line under the title, in smaller muted text.
   *
   * This is where the parenthetical halves of the old titles went -- "(scales
   * how long self-dismissing screens stay up)" and friends. Same text, one line
   * down, so the row itself stays scannable.
   */
  help?: UiText;
  default?: boolean | number | string;
  /**
   * Kept out of share codes and presets, but shown like any other row. Every
   * toggle on the Debug tab carries it -- it replaced `dev_mode`, which also hid
   * the row -- and so do the five Gameplay rows that shape the *run* rather
   * than the round (`SHARE_TABS`, src/settings.ts). On a shared tab it is a
   * declaration, not just an effect: it is what stops `checkShareSlots`
   * reporting the missing slot.
   */
  neverShared?: boolean;
  /** Present on dropdown settings: the selectable options. */
  dropdown?: SettingSpec[];
  /**
   * On a dropdown entry: the one character that stands for it in a share code.
   *
   * Unique within its dropdown and fixed once shipped — changing one rewrites
   * what every code in circulation means. An entry without it still travels,
   * written out in full. `_` is reserved as the marker for that longer form.
   */
  share?: string;
  /**
   * On a dropdown entry: the heading the sheet lists it under.
   *
   * A new block is started whenever this changes from one entry to the next, so
   * the list's own order is what groups it and entries sharing a heading have to
   * be adjacent. An entry with no `group` gets no heading. Only the Skill Type
   * list uses this today -- `src/skillOptions.ts`.
   */
  group?: UiText;
  /**
   * How finished this is -- on a settings row *or* on a dropdown entry.
   *
   * Absent means Production, which is what almost everything is; only the
   * unfinished say so. The same shape `neverShared` has, and for the same
   * reason: a field every row had to repeat would be noise on all but a handful
   * of them. `SkillOption.status` is the deliberate exception and *is* required,
   * because that list is itself the offer.
   *
   * Below the channel's floor a row is not drawn, is not taken from storage, and
   * is not taken from a share code or a preset -- so it sits at the schema
   * default it was never allowed to move off, and still travels to `start()`
   * there. It keeps its share slot either way, which is what stops a code
   * written on one channel meaning something else on another. `offeredHere` in
   * `src/releaseStatus.ts` is the one predicate all three ask.
   */
  status?: ReleaseStatus;
  /**
   * On a dropdown entry: switches this option cannot be played without, turned
   * on when it is picked.
   *
   * Lorcana Aurora is the case it exists for. Her skill is two skills either
   * side of a transformation the "Lorcana Card" switch is what plays, so
   * picking her with that switch off is a configuration that half works --
   * silently, because the round looks ordinary until the card it never taps
   * has been sitting there for a minute.
   *
   * Declared here rather than special-cased in the picker so both pages get it
   * from one list: the settings page ticks the row, the Quick Bar applies it to
   * the running world. A one-way nudge, deliberately -- picking the option
   * turns the switch on, and picking another leaves it exactly where the user
   * has it, since a switch that also turned itself off would undo a choice
   * nobody asked it to.
   *
   * Only boolean rows belong here; anything else is left alone and logged.
   */
  enables?: SettingKey[];
  options?: SettingSpec[];
  /**
   * A row of plain buttons instead of a value. Wired by reference, not by name.
   *
   * The label is a thunk rather than a key because it is read on every render
   * and the language can change between two of them -- a key resolved when the
   * schema was built would leave these buttons in whatever language the page
   * opened in, which is exactly what they used to do. It also lets the language
   * picker's own buttons carry endonyms, which are not translated at all.
   */
  buttons?: { text: () => string; onClick: () => void }[];
  /**
   * A row that draws itself and holds no value -- the Run order summary.
   *
   * Called on every render, so it reads the live settings each time; the whole
   * element it returns is the row.
   */
  build?: () => HTMLElement;
  min?: number;
  max?: number;
  step?: number;
  incrementBy1?: boolean;
}

/** One card inside a tab panel: a heading, an optional note, and its rows. */
interface GroupSpec {
  title?: UiText;
  help?: UiText;
  /** Renders the heading and note in the warning colour. */
  warn?: boolean;
  rows: SettingSpec[];
}

/** One button in the tab bar, and the panel it shows. */
interface TabSpec {
  /** Stable id: what is written to localStorage as the remembered tab. */
  id: string;
  title: UiText;
  groups: GroupSpec[];
}
