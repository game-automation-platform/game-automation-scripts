// The Skill Type dropdown's entries, written once.
//
// Two pages offer this list -- the settings page's Skills tab and the Quick Bar
// -- and they are separate compilations, so a copy in each would be two lists
// that drift the first time a skill is added. This file is in both
// (`tsconfig.settings.json` and `tsconfig.quickbar.json`) and emits one small
// script that both pages load ahead of their own.
//
// Not in the game bundle: the device script never shows a label, it only
// compares `SkillType` ids. So a skill this file withholds is still *in* the
// shipped bundle, handler and all -- there is simply no way to ask for it.
//
// ## Channels
//
// Each entry carries a `status`, and `SkillOptions` is the declared list
// narrowed to what this channel is allowed to offer -- the rule, the floor and
// the badge all live in `src/releaseStatus.ts`, which the settings rows use too.
//
// ## The three groups
//
// Both sheets start a new block whenever `group` changes, so this array's order
// is what groups the list and entries sharing a heading have to stay adjacent.
// They sort by what the activation leaves behind, not by how much work the
// choreography does:
//
//   Burst   fires and clears, and hands the board back unchanged. Aimed taps
//           and drags count -- Cabbage Mickey hunts the board for Mickey and
//           Jedi Luke flies five drags, and both end in a plain clear.
//   Bubble  turns tsums into bubbles for the choreography to sweep
//           (`sweepsBubbles`, `src/skills/`).
//   Unique  changes how the play loop itself plays for a window or the rest of
//           the round -- the skills declaring `orderPaths`, `claimsBubbles` or
//           a chain of their own.
//
// Inside a group the generic entry comes first -- Burst and Burst + clear
// bubbles, what most tsums are played as -- and the rest follow by English
// name, ascending. Nothing sorts at render time, so a new skill is inserted at
// its name. No Skill carries no group and trails the list under no heading.

/**
 * One offered skill.
 *
 * `key` is the game's id and the value that crosses the `start({...})` bridge.
 *
 * `share` is the character this skill is written as in a share code. Unique in
 * this list, and fixed once shipped -- changing one rewrites what every code
 * already in circulation means. It is required rather than optional so a new
 * skill cannot quietly ship without one; take any free letter. Reordering the
 * list is free: a code is read back by `share`, never by position.
 *
 * `title` is a `UiText` key, not a name: the name lives in the catalogues
 * (`src/uiEn.ts` and friends), so a new language translates the skill list
 * without touching this file. Neither `key` nor `share` is ever a label, which
 * is what keeps share codes language-agnostic.
 *
 * `group` is the heading the entry is listed under -- a `UiText` key like
 * `title`, and omitted for an entry that belongs under none.
 *
 * `enables` is the settings this skill cannot play without, switched on when it
 * is picked -- see `SettingSpec.enables` in `src/settings.d.ts`, which is where
 * both pages read it from.
 *
 * `status` is how finished it is. Required rather than optional, for the reason
 * `share` is: a new skill should not be able to ship to everyone by omission.
 * It decides two things -- the badge and colour the sheets draw, and which
 * channels list the entry at all.
 */
interface SkillOption {
    key: SkillType;
    share: string;
    title: UiText;
    status: ReleaseStatus;
    group?: UiText;
    enables?: SettingKey[];
}

/**
 * Every skill this project has, whatever channel it is ready for.
 *
 * Typed as `SkillOption[]`, so a `key` that is not a `SkillType` fails the
 * build: this list is the only place these ids are offered to the user, and one
 * that no skill file registers plays as a plain burst -- it works, so nothing
 * reports it.
 *
 * Not what the pages read -- `SkillOptions`, below, is this list narrowed to the
 * channel being built.
 */
var SkillsDeclared: SkillOption[] = [
    // --- Burst: fires, clears, hands the board back --------------------------
    {key: SkillType.Burst, share: 'b', title: UiText.SkillBurst,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    {key: SkillType.CabbageMickey, share: 'g', title: UiText.SkillCabbageMickey,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    {key: SkillType.CptLightyear, share: 'l', title: UiText.SkillCptLightyear,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    {key: SkillType.CptLightyear120, share: 'L', title: UiText.SkillCptLightyear120,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    {key: SkillType.Donald, share: 'd', title: UiText.SkillDonald,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    {key: SkillType.HolidayDonald, share: 'D', title: UiText.SkillHolidayDonald,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    {key: SkillType.JediLuke, share: 'j', title: UiText.SkillJediLuke,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    {key: SkillType.LightningMcQueenPlus, share: 'q', title: UiText.SkillLightningMcQueenPlus,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    // Two buttons rather than one, but the clear at the end of it is a burst.
    {key: SkillType.PairTsum, share: 'p', title: UiText.SkillPairTsum,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},
    {key: SkillType.SheriffWoody, share: 'w', title: UiText.SkillSheriffWoody,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBurst},

    // --- Bubble: the skill makes bubbles, the choreography sweeps them --------
    {key: SkillType.BurstBubbles, share: 'B', title: UiText.SkillBurstBubbles,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBubble},
    // Aimed by drawing over the board, but it ends on a sweep like the rest.
    {key: SkillType.Cinderella, share: 'c', title: UiText.SkillCinderella,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBubble},
    {key: SkillType.HornHatMickey, share: 'h', title: UiText.SkillHornHatMickey,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBubble},
    {key: SkillType.Marie, share: 'm', title: UiText.SkillMarie,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBubble},
    {key: SkillType.MissBunny, share: 'y', title: UiText.SkillMissBunny,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBubble},
    {key: SkillType.Moana, share: 'o', title: UiText.SkillMoana,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBubble},
    {key: SkillType.Rabbit, share: 'r', title: UiText.SkillRabbit,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBubble},
    {key: SkillType.SnowWhite, share: 's', title: UiText.SkillSnowWhite,
     status: ReleaseStatus.Production, group: UiText.SkillGroupBubble},

    // --- Unique: the play loop plays differently while these are up ----------
    {key: SkillType.CoronationElsa, share: 'e', title: UiText.SkillCoronationElsa,
     status: ReleaseStatus.Alpha, group: UiText.SkillGroupUnique},
    {key: SkillType.FormalBeast, share: 'f', title: UiText.SkillFormalBeast,
     status: ReleaseStatus.Production, group: UiText.SkillGroupUnique},
    {key: SkillType.Gaston, share: 'G', title: UiText.SkillGaston,
     status: ReleaseStatus.Alpha, group: UiText.SkillGroupUnique},
    // The one entry with `enables`: her second skill only exists once the card
    // has been tapped, and tapping it is that switch's job, not hers.
    {key: SkillType.LorcanaAurora, share: 'a', title: UiText.SkillLorcanaAurora,
     status: ReleaseStatus.Production, group: UiText.SkillGroupUnique,
     enables: [SettingKey.LorcanaCard]},
    {key: SkillType.RapunzelPlus, share: 'R', title: UiText.SkillRapunzelPlus,
     status: ReleaseStatus.Production, group: UiText.SkillGroupUnique},
    {key: SkillType.TiaraMinniePlus, share: 't', title: UiText.SkillTiaraMinniePlus,
     status: ReleaseStatus.Production, group: UiText.SkillGroupUnique},

    // Under no heading: not a kind of skill, but the absence of one.
    {key: SkillType.NoSkill, share: 'n', title: UiText.SkillNoSkill,
     status: ReleaseStatus.Production}
];

/**
 * Every skill the user may pick, in the order the dropdown shows them.
 *
 * The narrowing is what "an Alpha skill" means at release time: a Production
 * build has no entry for one, so it cannot be picked, cannot be shown, and a
 * share code naming one decodes to `undefined` -- which `decodeShareValue`
 * already treats as "this version cannot use it" and leaves at the default.
 */
var SkillOptions: SkillOption[] = SkillsDeclared.filter(function (skill) {
    return offeredHere(skill.status);
});
