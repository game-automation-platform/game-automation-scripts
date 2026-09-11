// The Bubble Strategy dropdown's entries, written once.
//
// The same arrangement as `src/skillOptions.ts` and for the same reason: two
// pages offer this list -- the settings page's Gameplay tab and the Quick Bar --
// and they are separate compilations, so a copy in each would be two lists that
// drift the first time an option is added. This file is in both
// (`tsconfig.settings.json` and `tsconfig.quickbar.json`).
//
// Not in the game bundle: the device script never shows a label, it only
// compares `BubbleStrategy` ids.
//
// No groups here, unlike the skills. Three options on one axis -- how eagerly
// bubbles are spent -- read as a list rather than as blocks, and they are
// ordered from stingiest to most eager so the list itself is the scale.

/**
 * One offered bubble strategy.
 *
 * `key`, `share` and `title` mean exactly what they do in `SkillOption`: the id
 * the play loop compares, the character a share code writes it as -- fixed once
 * shipped, since changing one rewrites every code in circulation -- and a
 * `UiText` key rather than a name, so a new language translates the list without
 * touching this file.
 *
 * `short` is the second name, for the Quick Bar. The strip gives this setting a
 * chip a few characters wide, where "All Bubbles Mid Chain" is an ellipsis and
 * says nothing; the settings page has a whole row and uses `title`. Two names
 * rather than one shortened at render time, because which words survive is a
 * translation decision and not an arithmetic one.
 */
interface BubbleOption {
    key: BubbleStrategy;
    share: string;
    title: UiText;
    short: UiText;
}

/** Every strategy the user may pick, stingiest first. */
var BubbleOptions: BubbleOption[] = [
    {key: BubbleStrategy.OneMidChain, share: '1',
     title: UiText.BubbleOneMidChain, short: UiText.BubbleOneMidChainShort},
    {key: BubbleStrategy.AllMidChain, share: 'a',
     title: UiText.BubbleAllMidChain, short: UiText.BubbleAllMidChainShort},
    {key: BubbleStrategy.AllAsap, share: 'A',
     title: UiText.BubbleAllAsap, short: UiText.BubbleAllAsapShort}
];
