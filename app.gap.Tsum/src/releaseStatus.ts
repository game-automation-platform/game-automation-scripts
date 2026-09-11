// What this build is allowed to offer, and how an unfinished thing is drawn.
//
// One channel-shaped rule, applied to two different lists: the skills in
// `src/skillOptions.ts` and the settings rows in `src/settings.ts`. Both are
// offered by both pages -- the settings panel and the Quick Bar -- and those are
// separate compilations, so this file is in both
// (`tsconfig.settings.json` and `tsconfig.quickbar.json`) and emits one small
// script they each load ahead of their own.
//
// Not in the game bundle. The device script is given whatever `start({...})`
// carries and never asks whether a build was allowed to offer it, which is the
// point: withholding is a question about the *offer*, not about the run. A
// withheld skill's handler and a withheld setting's behaviour both still ship;
// there is simply no way to ask for either, and the setting travels at the
// schema default it was never allowed to move off.

/**
 * How finished something is, and so which release channels offer it.
 *
 * The numbers are the ordering, and they are what makes the rule one
 * comparison: a channel offers everything at or above its own floor. So Alpha
 * offers all three, Beta drops the Alpha ones, and Production offers only what
 * is finished.
 *
 * A `const enum` for the reason `SkillType` is one: erased and inlined, so the
 * settings page and the Quick Bar share the vocabulary without either runtime
 * carrying a table for it.
 */
declare const enum ReleaseStatus {
    /** Playable, but still being tuned. Orange, badged, Alpha builds only. */
    Alpha = 0,
    /** Believed right; wanted in front of testers. Blue, badged. */
    Beta = 1,
    /** Finished. No badge, no colour -- the ordinary appearance. */
    Production = 2,
}

/**
 * The lowest status this build offers, stamped in from the channel's `Status` in
 * config.json -- see `tools/build/build.js`.
 *
 * A string because that is the only shape a placeholder can take in a compiled
 * file (`ScriptVersion` in `src/data.ts` is the same trick). It is substituted
 * into the inlined page, which is safe because tools/minify runs terser with
 * `compress: false` -- a literal is still a literal in the minified page.
 *
 * Left unstamped the build is a development one -- tools/liveSettings and the
 * Quick Bar preview compile these sources on their own -- and the answer there
 * is Alpha: offer everything.
 */
var ReleaseStatusStamp = '$RELEASE_STATUS';
var ReleaseStatusMin: ReleaseStatus =
    ReleaseStatusStamp === '2' ? ReleaseStatus.Production :
    ReleaseStatusStamp === '1' ? ReleaseStatus.Beta :
    ReleaseStatus.Alpha;

/**
 * Whether this build offers something of that status.
 *
 * `undefined` is offered. Only the things that are *not* finished say so: a
 * skill declares its status outright (`SkillOption.status` is required, because
 * that list is the offer), while a settings row leaves it off unless it is
 * unfinished -- the same shape `neverShared` has, and for the same reason. So
 * the absent case is the overwhelmingly common one and it must mean Production.
 */
function offeredHere(status: ReleaseStatus | undefined): boolean {
    return status === undefined || status >= ReleaseStatusMin;
}

/** How an unfinished thing is drawn: the `data-status`, and the pill's text. */
interface StatusFlag {
    /** What both stylesheets key their colour off, and what markup names. */
    name: string;
    /** The pill's own label -- see `UiText.StatusFlagAlpha`. */
    title: UiText;
}

/**
 * How each status is drawn, indexed by the status itself.
 *
 * One table read both ways -- status to badge, and the `data-status` name back
 * to a status -- so the two directions cannot disagree about what "alpha"
 * means. Production's entry is `undefined`, which is what "no badge" is.
 *
 * Here rather than in either page: both sheets, both settings surfaces and the
 * Quick Bar's chip draw the same pill, and this is the one place the mapping
 * from status to colour and word can be got wrong.
 */
var StatusFlags: (StatusFlag | undefined)[] = [
    {name: 'alpha', title: UiText.StatusFlagAlpha},
    {name: 'beta', title: UiText.StatusFlagBeta},
    undefined,
];

/** The badge for a status, or `undefined` for one that needs none. */
function statusFlag(status: ReleaseStatus | undefined): StatusFlag | undefined {
    return status === undefined ? undefined : StatusFlags[status];
}

/**
 * The status a `data-status` attribute names, or `undefined` for anything else
 * -- an absent attribute included, which is how markup says "Production".
 *
 * For the Quick Bar, whose cells are declared in markup rather than read out of
 * the settings schema (which its compilation does not have). That does mean a
 * strip cell restates a status the schema also carries, so the two can drift;
 * the guard is that a cell is already a hand-maintained claim about which
 * settings the strip offers, and this is one more field of that same claim.
 */
function statusNamed(name: string | null): ReleaseStatus | undefined {
    for (var i = 0; name !== null && i < StatusFlags.length; i++) {
        var flag = StatusFlags[i];
        if (flag !== undefined && flag.name === name) {
            return i;
        }
    }
    return undefined;
}
