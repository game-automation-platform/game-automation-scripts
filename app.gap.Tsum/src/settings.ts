// Converted from settings.js - best-effort TypeScript port.

// For editors only; the build reads none of this. settings.ts is compiled by
// tsconfig.settings.json, which lists these alongside it -- but a TypeScript
// server discovers a project by looking upward for a file named literally
// `tsconfig.json`, finds the game bundle's, and that one excludes settings.ts
// on purpose. It then falls back to a single-file project with no shared.d.ts
// in it and reports ~90 phantom `Cannot find name` errors. These pull the same
// files into that fallback. Its compiler options are still
// the editor's defaults rather than tsconfig.settings.json's, so
// `npm run typecheck` stays the real gate.
/// <reference path="./shared.d.ts" />
/// <reference path="./logEvents.ts" />
/// <reference path="./settings.d.ts" />
/// <reference path="./strings.d.ts" />
/// <reference path="./i18n.ts" />
/// <reference path="./skillOptions.ts" />
/// <reference path="./runPlan.ts" />
/// <reference path="./qrCode.ts" />
/// <reference path="./presets.ts" />

"use strict";

// package.json is the only place the version is written. build.sh / build.ps1
// substitute it here after the page is inlined, the same way as $BUILD_DATE.
// Left literal in build/, where nothing reads it for meaning.
var VERSION = '$VERSION';

/**
 * The localStorage key this page owns. THEME_KEY and TAB_KEY are only ever read
 * from a function, so they stay in their sections; the language tag is not here
 * at all -- `src/i18n.ts` owns it, because the Quick Bar reads the same entry.
 */
var SETTINGS_KEY = StorageKey.Settings;

/**
 * The whole settings page, as data.
 *
 * Three levels, and each one is a piece of the layout: a **tab** is one button
 * in the tab bar and one panel under it, a **group** is one card inside that
 * panel, and a **row** is one setting.
 *
 * Only the rows carry state. Everything that reads or writes settings -- saving,
 * loading, share codes, `genStartCommand` -- works off the flattened `settings`
 * below and never sees the tabs at all, so moving a row between tabs is a purely
 * cosmetic edit. What is *not* cosmetic is the `key`, which is the contract with
 * `start()` in index.ts, and the position in `SHARE_SLOTS`, which is the
 * contract with every share code already in circulation.
 */
var tabs: TabSpec[] = [
    {
        id: 'general',
        title: UiText.TabGeneral,
        groups: [
            {
                title: UiText.GroupDevice,
                rows: [
                    {
                        title: UiText.SettingLanguage,
                        help: UiText.SettingLanguageHelp,
                        // Drawn from the registered catalogues rather than
                        // written out, so a new language file is a new button
                        // with nothing here to edit.
                        buttons: localeButtons()
                    },
                    // {
                    //     key: SettingKey.JpVersion,
                    //     title: UiText.SettingJpVersion,
                    //     default: false
                    // },
                    {
                        key: SettingKey.SpecialScreenRatio,
                        title: UiText.SettingSpecialScreenRatio,
                        help: UiText.SettingSpecialScreenRatioHelp,
                        default: false
                    },
                    // {
                    //     // The game runs its self-dismissing screens off a frame
                    //     // counter, so the durations in PageProfiles are quoted at
                    //     // 60fps and scaled by this. Set it to the emulator's frame
                    //     // rate; leaving it at 60 is what the script did before this
                    //     // existed.
                    //     key: SettingKey.DeviceFps,
                    //     title: UiText.SettingDeviceFps,
                    //     help: UiText.SettingDeviceFpsHelp,
                    //     default: 60,
                    //     step: 10,
                    //     max: 240,
                    //     min: 20
                    // },
                    {
                        key: SettingKey.AutoLaunchApp,
                        title: UiText.SettingAutoLaunchApp,
                        help: UiText.SettingAutoLaunchAppHelp,
                        default: false
                    }
                ]
            },
            {
                title: UiText.GroupRunOrder,
                help: UiText.GroupRunOrderHelp,
                rows: [
                    {
                        key: RowKey.RunOrder,
                        // No `default`, so it holds no value: nothing to save,
                        // nothing to share, no share slot to keep.
                        build: buildRunOrder
                    }
                ]
            },
            {
                title: UiText.GroupSettingsCode,
                help: UiText.GroupSettingsCodeHelp,
                rows: [
                    {
                        key: RowKey.ShareSettings,
                        title: UiText.SettingShareSettings,
                        buttons: [
                            {text: i18nThunk(UiText.ButtonCopy), onClick: function () { copySettingsCode(); }},
                            {text: i18nThunk(UiText.ButtonPaste), onClick: function () { pasteSettingsCode(); }}
                        ]
                    },
                    {
                        // Beside the share code because it is the same errand --
                        // getting a configuration off this device -- and unlike
                        // a code it carries every row, so the two are not
                        // alternatives. See `presetsExportText`, src/presets.ts.
                        key: RowKey.ExportPresets,
                        title: UiText.SettingExportPresets,
                        help: UiText.SettingExportPresetsHelp,
                        buttons: [
                            {text: i18nThunk(UiText.ButtonCopy), onClick: function () { copyPresetsExport(); }},
                            {text: i18nThunk(UiText.ButtonSaveFile), onClick: function () { savePresetsFile(); }}
                        ]
                    }
                ]
            }
        ]
    },
    {
        id: 'gameplay',
        title: UiText.TabGameplay,
        groups: [
            {
                title: UiText.GroupPlaying,
                rows: [
                    {
                        key: SettingKey.AutoPlayGame,
                        title: UiText.SettingAutoPlayGame,
                        help: UiText.SettingAutoPlayGameHelp,
                        default: true,
                        // Whether rounds are played at all, not how one is
                        // played -- see SHARE_TABS.
                        neverShared: true
                    },
                    // {
                    //     key: SettingKey.ClickAssist,
                    //     title: UiText.SettingClickAssist,
                    //     help: UiText.SettingClickAssistHelp,
                    //     default: false
                    // },
                    {
                        // Held by the play loop, not by the task's interval --
                        // see `taskPlayGameQuick`. The button beside the number
                        // ends a wait that is *already running*; the setting
                        // itself is untouched, so the round after it waits
                        // again.
                        key: SettingKey.RoundDelayMinutes,
                        title: UiText.SettingRoundDelay,
                        help: UiText.SettingRoundDelayHelp,
                        default: 0,
                        step: 1,
                        max: 120,
                        min: 0,
                        buttons: [
                            {text: i18nThunk(UiText.ButtonNow), onClick: function () { skipRoundDelay(); }}
                        ],
                        // The gap *between* rounds -- see SHARE_TABS.
                        neverShared: true
                    },
                    {
                        // The clock saying a round will not end -- see the Max
                        // Round Duration block in `src/play.ts`. Measured from
                        // the board coming up, so the walk in is not counted.
                        key: SettingKey.MaxRoundMinutes,
                        title: UiText.SettingMaxRound,
                        help: UiText.SettingMaxRoundHelp,
                        default: 0,
                        step: 1,
                        max: 60,
                        min: 0,
                        // How long the *run* will spend on one round before
                        // giving up on it, not a rule the round is played under
                        // -- the same reason the row above stays home. See
                        // SHARE_TABS.
                        neverShared: true
                    },
                    {
                        key: SettingKey.MaxRoundAction,
                        title: UiText.SettingMaxRoundAction,
                        help: UiText.SettingMaxRoundActionHelp,
                        default: MaxRoundAction.Coast as MaxRoundAction,
                        // No `share` ids on the entries, unlike every other
                        // dropdown: the row is `neverShared`, so no code and no
                        // preset ever writes one. `satisfies` for the reason the
                        // skill and bubble dropdowns have it -- a key that is
                        // not a MaxRoundAction would compile, match no branch in
                        // the play loop and quietly play the round out.
                        dropdown: ([
                            {key: MaxRoundAction.Coast, title: UiText.MaxRoundCoast},
                            {key: MaxRoundAction.Stop, title: UiText.MaxRoundStop}
                        ] satisfies { key: MaxRoundAction; title: UiText }[]),
                        // Meaningless on its own -- it is what the cap above
                        // does, and that row is not shared either.
                        neverShared: true
                    },
                    {
                        key: SettingKey.MaxChainsPerScan,
                        title: UiText.SettingMaxChainsPerScan,
                        help: UiText.SettingMaxChainsPerScanHelp,
                        default: 6,
                        step: 1,
                        max: 12,
                        min: 1
                    },
                    {
                        key: SettingKey.MaxChain,
                        title: UiText.SettingMaxChain,
                        help: UiText.SettingMaxChainHelp,
                        default: 4,
                        step: 1,
                        max: 15,
                        min: 3
                    },
                    {
                        // Percent rather than a multiplier because a share code
                        // carries a number as `Math.round(n).toString(36)` -- 2.2
                        // would travel as 2.
                        key: SettingKey.LinkReachPercent,
                        title: UiText.SettingLinkReach,
                        help: UiText.SettingLinkReachHelp,
                        default: 190,
                        step: 10,
                        max: 350,
                        min: 150
                    },
                    {
                        key: SettingKey.PrioritizeMyTsum,
                        title: UiText.SettingPrioritizeMyTsum,
                        help: UiText.SettingPrioritizeMyTsumHelp,
                        default: false
                    },
                    {
                        key: SettingKey.TrackRoundStats,
                        title: UiText.SettingTrackRoundStats,
                        help: UiText.SettingTrackRoundStatsHelp,
                        default: true,
                        // Bookkeeping about rounds, not a rule one is played
                        // under -- see SHARE_TABS.
                        neverShared: true
                    }
                ]
            },
            {
                title: UiText.GroupBoardHelpers,
                rows: [
                    {
                        key: SettingKey.BubbleStrategy,
                        title: UiText.SettingBubbleStrategy,
                        help: UiText.SettingBubbleStrategyHelp,
                        default: BubbleStrategy.OneMidChain as BubbleStrategy,
                        // `src/bubbleOptions.ts`, as the skill row reads
                        // `SkillOptions`: the Quick Bar offers this list too, and
                        // it is a separate compilation, so the entries are shared
                        // rather than written here and copied there. The typing
                        // that used to be a `satisfies` on this literal is the
                        // `BubbleOption` interface now -- a key that is not a
                        // BubbleStrategy would otherwise compile, fall through
                        // every comparison in the play loop and play as the
                        // stingiest option without reporting it.
                        //
                        // Skills that clear bubbles themselves are unaffected by
                        // any of these -- they declare `sweepsBubbles` and call
                        // `clearAllBubbles` outright.
                        dropdown: BubbleOptions
                    },
                    {
                        key: SettingKey.UseFan,
                        title: UiText.SettingUseFan,
                        help: UiText.SettingUseFanHelp,
                        default: false
                    }
                ]
            },
            {
                title: UiText.GroupItems,
                help: UiText.GroupItemsHelp,
                rows: [
                    {
                        key: SettingKey.BonusScore,
                        title: UiText.SettingBonusScore,
                        help: UiText.SettingBonusScoreHelp,
                        default: false
                    },
                    {
                        key: SettingKey.BonusCoin,
                        title: UiText.SettingBonusCoin,
                        help: UiText.SettingBonusCoinHelp,
                        default: false
                    },
                    {
                        key: SettingKey.BonusExp,
                        title: UiText.SettingBonusExp,
                        help: UiText.SettingBonusExpHelp,
                        default: false
                    },
                    {
                        key: SettingKey.BonusTime,
                        title: UiText.SettingBonusTime,
                        help: UiText.SettingBonusTimeHelp,
                        default: false
                    },
                    {
                        key: SettingKey.BonusBubble,
                        title: UiText.SettingBonusBubble,
                        help: UiText.SettingBonusBubbleHelp,
                        default: false
                    },
                    {
                        key: SettingKey.Bonus5to4,
                        title: UiText.SettingBonus5to4,
                        help: UiText.SettingBonus5to4Help,
                        default: false
                    },
                    {
                        key: SettingKey.BonusCombo,
                        title: UiText.SettingBonusCombo,
                        help: UiText.SettingBonusComboHelp,
                        default: false
                    }
                ]
            },
        ]
    },
    {
        id: 'skills',
        title: UiText.TabSkills,
        groups: [
            {
                title: UiText.GroupSkill,
                rows: [
                    {
                        key: SettingKey.SkillType,
                        title: UiText.SettingSkillType,
                        help: UiText.SettingSkillTypeHelp,
                        default: SkillType.Burst as SkillType,
                        // One list, in src/skillOptions.ts, because the Quick
                        // Bar offers the same skills from its own compilation.
                        dropdown: SkillOptions
                    },
                    {
                        key: SettingKey.SkillLevel,
                        title: UiText.SettingSkillLevel,
                        help: UiText.SettingSkillLevelHelp,
                        default: 6,
                        step: 1,
                        max: 6,
                        min: 1
                    },
                    {
                        key: SettingKey.SkillWaitingTime,
                        title: UiText.SettingSkillWaitingTime,
                        help: UiText.SettingSkillWaitingTimeHelp,
                        default: 0,
                        step: 1,
                        max: 15,
                        min: 0
                    },
                    {
                        // Not part of the skill above it: every Lorcana tsum
                        // transforms the same way whatever its own skill is, so
                        // this is its own switch rather than something a
                        // SkillType implies.
                        key: SettingKey.LorcanaCard,
                        title: UiText.SettingLorcanaCard,
                        help: UiText.SettingLorcanaCardHelp,
                        default: false
                    }
                ]
            },
            {
                title: UiText.GroupTiming,
                rows: [
                    {
                        key: SettingKey.NoSkillLastFeverSec,
                        title: UiText.SettingNoSkillLastFever,
                        help: UiText.SettingNoSkillLastFeverHelp,
                        default: 0,
                        step: 1,
                        max: 10,
                        min: 0
                    },
                    {
                        key: SettingKey.SkillAutoTap,
                        title: UiText.SettingSkillAutoTap,
                        help: UiText.SettingSkillAutoTapHelp,
                        default: true
                    }
                ]
            }
        ]
    },
    {
        id: 'hearts',
        title: UiText.TabHearts,
        groups: [
            {
                title: UiText.GroupReceiveAll,
                rows: [
                    {
                        key: SettingKey.ReceiveAllHearts,
                        title: UiText.SettingReceiveAllHearts,
                        help: UiText.SettingReceiveAllHeartsHelp,
                        default: false
                    },
                    {
                        // The three "waiting time" rows share a title, so each
                        // one's help says which job it paces.
                        key: SettingKey.ReceiveAllHeartsMinWait,
                        title: UiText.SettingRepeatWait,
                        help: UiText.SettingReceiveAllWaitHelp,
                        default: 25,
                        step: 5,
                        max: 60,
                        min: 5
                    }
                ]
            },
            {
                title: UiText.GroupMailbox,
                rows: [
                    {
                        key: SettingKey.ReceiveHeartsOneByOne,
                        title: UiText.SettingReceiveOneByOne,
                        help: UiText.SettingReceiveOneByOneHelp,
                        default: false
                    },
                    {
                        key: SettingKey.ReceiveHeartsSkipFirst,
                        title: UiText.SettingSkipFirstPerson,
                        help: UiText.SettingSkipFirstPersonHelp,
                        default: false
                    },
                    {
                        key: SettingKey.ReceiveHeartsSkipRuby,
                        title: UiText.SettingSkipRuby,
                        help: UiText.SettingSkipRubyHelp,
                        default: false
                    },
                    {
                        key: SettingKey.ReceiveHeartsSkipMedals,
                        title: UiText.SettingSkipMedals,
                        help: UiText.SettingSkipMedalsHelp,
                        default: false
                    },
                    {
                        key: SettingKey.ClaimAllWithoutCoins,
                        title: UiText.SettingClaimAllOldMails,
                        help: UiText.SettingClaimAllOldMailsHelp,
                        default: false
                    },
                    {
                        key: SettingKey.MailOpenMax,
                        title: UiText.SettingMailOpenMax,
                        help: UiText.SettingMailOpenMaxHelp,
                        default: 5,
                        step: 1,
                        max: 20,
                        min: 1
                    },
                    {
                        key: SettingKey.MailMinWait,
                        title: UiText.SettingRepeatWait,
                        help: UiText.SettingMailWaitHelp,
                        default: 5,
                        step: 2,
                        max: 60,
                        min: 1
                    },
                ]
            },
            {
                title: UiText.GroupSendHearts,
                rows: [
                    {
                        key: SettingKey.SendHeartsAuto,
                        title: UiText.SettingSendHeartsAuto,
                        help: UiText.SettingSendHeartsAutoHelp,
                        default: false
                    },
                    {
                        key: SettingKey.SendHeartsToZeroScore,
                        title: UiText.SettingSendToZeroScore,
                        help: UiText.SettingSendToZeroScoreHelp,
                        default: false
                    },
                    {
                        key: SettingKey.SendHeartsMaxRuntime,
                        title: UiText.SettingSendMaxRuntime,
                        help: UiText.SettingSendMaxRuntimeHelp,
                        default: 0,
                        step: 5,
                        max: 80,
                        min: 0
                    },
                    {
                        key: SettingKey.SendHeartsMinWait,
                        title: UiText.SettingRepeatWait,
                        help: UiText.SettingSendWaitHelp,
                        default: 26,
                        step: 5,
                        max: 60,
                        min: 1
                    }
                ]
            }
        ]
    },
    {
        // The jobs a run does between rounds, one group each. They were a single
        // Chores card at the bottom of the Gameplay tab until Box Buying arrived
        // with four rows of its own; a tab is what stops the next chore from
        // pushing the board settings off the screen.
        //
        // Each chore's first row is its schedule in hours, 0 for off, with a Now
        // button beside it -- so the tab reads as a list of jobs and how often
        // each runs. Hearts are chores too and have had their own tab since
        // before this one; they stay there.
        id: 'chores',
        title: UiText.TabChores,
        groups: [
            {
                title: UiText.GroupLevelCaps,
                rows: [
                    {
                        // Now runs one sweep straight away, whatever the schedule
                        // says: queued on a running script, or the script started
                        // for it. It acts on the run rather than the form, as the
                        // round delay's Now does -- see `askUnlockLevelsNow`.
                        key: SettingKey.UnlockLevelHoursWait,
                        title: UiText.SettingUnlockLevel,
                        help: UiText.SettingUnlockLevelHelp,
                        default: 0,
                        min: 0,
                        max: 24,
                        step: 1,
                        buttons: [
                            {text: i18nThunk(UiText.ButtonNow), onClick: function () { askUnlockLevelsNow(); }}
                        ]
                    }
                ]
            },
            {
                title: UiText.GroupBoxes,
                help: UiText.GroupBoxesHelp,
                rows: [
                    {
                        // Now works the same way the level-cap sweep's does --
                        // see `askBuyBoxesNow`.
                        key: SettingKey.BuyBoxHoursWait,
                        title: UiText.SettingBuyBox,
                        help: UiText.SettingBuyBoxHelp,
                        default: 0,
                        min: 0,
                        max: 24,
                        step: 1,
                        buttons: [
                            {text: i18nThunk(UiText.ButtonNow), onClick: function () { askBuyBoxesNow(); }}
                        ]
                    },
                    {
                        key: SettingKey.BuyBoxType,
                        title: UiText.SettingBuyBoxType,
                        help: UiText.SettingBuyBoxTypeHelp,
                        default: BoxType.Premium as BoxType,
                        // `satisfies` for the same reason the skill and bubble
                        // dropdowns have it: a key that is not a BoxType would
                        // compile, match no tab in `BoxStore.order3`/`order4`,
                        // and buy nothing while reporting the store had no such
                        // box.
                        dropdown: ([
                            {key: BoxType.PremiumPlus, share: 'P', title: UiText.BoxPremiumPlus},
                            {key: BoxType.Premium, share: 'p', title: UiText.BoxPremium},
                            {key: BoxType.Select, share: 's', title: UiText.BoxSelect},
                            {key: BoxType.Happiness, share: 'h', title: UiText.BoxHappiness}
                        ] satisfies { key: BoxType; share: string; title: UiText }[])
                    },
                    {
                        key: SettingKey.BuyBoxTenTimes,
                        title: UiText.SettingBuyBoxTenTimes,
                        help: UiText.SettingBuyBoxTenTimesHelp,
                        default: false
                    },
                    {
                        key: SettingKey.BuyBoxMaxPurchases,
                        title: UiText.SettingBuyBoxMax,
                        help: UiText.SettingBuyBoxMaxHelp,
                        default: 10,
                        min: 1,
                        max: 50,
                        step: 1
                    }
                ]
            }
        ]
    },
    {
        id: 'advanced',
        title: UiText.TabAdvanced,
        groups: [
            {
                title: UiText.GroupExperimental,
                help: UiText.GroupExperimentalHelp,
                warn: true,
                rows: [
                    {
                        key: SettingKey.TsumAppRestartFrequency,
                        title: UiText.SettingAppRestartFrequency,
                        help: UiText.SettingAppRestartFrequencyHelp,
                        min: 0,
                        max: 120,
                        step: 6,
                        default: 0
                    }
                ]
            }
        ]
    },
    {
        // Every diagnostic toggle, in one visible tab. These used to be
        // `dev_mode` rows, hidden until the build-date row was tapped ten
        // times; `neverShared` on each row is what still keeps them out of a
        // share code.
        id: 'debug',
        title: UiText.TabDebug,
        groups: [
            {
                title: UiText.GroupDiagnostics,
                rows: [
                    {
                        key: RowKey.BuildDate,
                        title: UiText.SettingBuildDate
                    },
                    {
                        // First of the diagnostics, and the only one here meant
                        // for a player rather than a developer: everything else
                        // on this tab has to be switched on *before* the bug,
                        // and this is what is pressed after it.
                        key: RowKey.ReportIssue,
                        title: UiText.SettingReportIssue,
                        help: UiText.SettingReportIssueHelp,
                        buttons: [
                            {text: i18nThunk(UiText.ButtonReport), onClick: function () { openReportPanel(); }}
                        ]
                    },
                    {
                        key: SettingKey.DebugLogs,
                        title: UiText.SettingDebugLogs,
                        help: UiText.SettingDebugLogsHelp,
                        default: false,
                        neverShared: true
                    },
                    {
                        key: SettingKey.DebugGame,
                        title: UiText.SettingDebugGame,
                        help: UiText.SettingDebugGameHelp,
                        default: false,
                        neverShared: true
                    },
                    {
                        // Records instead of playing: with this on, buildRun
                        // registers no other task and nothing taps, so what is
                        // written down is what the person did.
                        key: SettingKey.Walkthrough,
                        title: UiText.SettingWalkthrough,
                        help: UiText.SettingWalkthroughHelp,
                        default: false,
                        neverShared: true
                    },
                    {
                        key: SettingKey.CollectUnknownScreens,
                        title: UiText.SettingCollectUnknownScreens,
                        help: UiText.SettingCollectUnknownScreensHelp,
                        default: false,
                        neverShared: true
                    },
                    {
                        // How far back the router's page trail goes. With "Debug
                        // game" on it also writes one frame per visit to
                        // tsum_record/pageHistory, and drops each frame as its visit
                        // falls off the stack -- so the directory is bounded by this
                        // number, not by uptime.
                        key: SettingKey.PageHistoryDepth,
                        title: UiText.SettingPageHistoryDepth,
                        help: UiText.SettingPageHistoryDepthHelp,
                        default: 20,
                        step: 5,
                        max: 100,
                        min: 0,
                        neverShared: true
                    }
                ]
            }
        ]
    }
];

/**
 * Every group of every tab, flattened.
 *
 * This is what the rest of the file works on: persistence, share codes and
 * `genStartCommand` all iterate `settings[group][row]` and have no idea the page
 * has tabs. Built once here, and it holds the *same* row objects the tabs do --
 * `setting.default` is the live value, so writing through either view is writing
 * through both.
 */
var settings: SettingSpec[][] = (function () {
    var groups: SettingSpec[][] = [];
    for (var t = 0; t < tabs.length; t++) {
        for (var g = 0; g < tabs[t].groups.length; g++) {
            groups.push(tabs[t].groups[g].rows);
        }
    }
    return groups;
})();

/**
 * Switches language, and redraws the page in it.
 *
 * Redrawing rather than reloading is not an optimisation. The host delivers
 * this page with WebView.loadDataWithBaseURL, so the document has no URL of
 * its own -- its address is the script *directory* the base URL names, and
 * location.reload() therefore navigates away to that directory, leaving a
 * blank file listing where the settings were. There is nothing to reload:
 * the page is already the whole application.
 */
function saveLocale(locale: Locale) {
    i18nStore(locale);
    renderPage();
}

/**
 * The Language row's buttons: one per registered catalogue, labelled with what
 * that language calls itself.
 *
 * Built from `i18nLocales()` rather than written out, which is what makes a new
 * language additive -- `src/uiJa.ts` and two script tags, and the button is
 * there. Called once while `tabs` is being built, which is safe because the
 * catalogues are separate scripts and the page loads them first.
 */
function localeButtons(): { text: () => string; onClick: () => void }[] {
    var buttons: { text: () => string; onClick: () => void }[] = [];
    var entries = i18nLocales();
    for (var i = 0; i < entries.length; i++) {
        (function (entry: LocaleEntry) {
            buttons.push({
                // A thunk like every other button label, but this one never
                // changes with the language: a Chinese reader looking for
                // Chinese looks for 中文 whatever the page is currently in.
                text: function () { return entry.endonym; },
                onClick: function () { saveLocale(entry.tag); }
            });
        })(entries[i]);
    }
    return buttons;
}

/**
 * Reads one row's live value out of the rendered form.
 *
 * Returns undefined for the rows that hold no value at all -- the title-only
 * lines and the button rows, neither of which carries a `default`.
 */
function readSettingValue(setting: SettingSpec): SettingValue | undefined {
    // The control is the truth once the page is rendered; `setting.default` is
    // the fallback for the window before that, and for a row whose control was
    // never built.
    var control = controlFor(setting.key);
    if (typeof setting.default === 'boolean') {
        return control !== null ? control.checked === true : setting.default;
    } else if (typeof setting.default === 'number') {
        return control !== null ? +control.value : setting.default;
    } else if (typeof setting.default === 'string') {
        return control !== null ? String(control.value) : setting.default;
    }
    return undefined;
}

/**
 * Collects the live value of every row, keyed by setting key.
 *
 * The callers want different subsets -- localStorage and `start()` want every
 * row, a share code skips the developer toggles -- and `skip` is the only thing
 * that differs between them.
 */
function collectSettingValues(
    settings: SettingSpec[][],
    skip?: (setting: SettingSpec) => boolean
): { [key: string]: SettingValue } {
    var values: { [key: string]: SettingValue } = {};
    for (var i in settings) {
        for (var g in settings[i]) {
            var setting = settings[i][g];
            if (skip !== undefined && skip(setting)) {
                continue;
            }
            var value = readSettingValue(setting);
            if (value !== undefined) {
                values[setting.key!] = value;
            }
        }
    }
    return values;
}

function loadSettings(settings: SettingSpec[][]) {
    if (localStorage === undefined) {
        return;
    }
    /** @type {Object.<string, boolean|number|string>} */
    var recordSettings;
    var settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (settingsJSON) {
        // new key based setting assignments
        recordSettings = JSON.parse(settingsJSON);
        if (!recordSettings) {
            return;
        }
        (function () {
            for (var k1 in settings) {
                for (var k2 in settings[k1]) {
                    var setting = settings[k1][k2];
                    var key = setting.key;
                    // A stored value for a row this channel does not offer is
                    // left where it is rather than taken: it can only have been
                    // written by a build that did offer it, and taking it would
                    // switch on what this one will not show.
                    if (typeof key === 'string' && offeredHere(setting.status)
                        && typeof recordSettings[key] === typeof setting.default) {
                        setting.default = recordSettings[key];
                    }
                }
            }
        })();
    } else {
        logInfo(Log.Settings.NoneFound, i18nText(UiText.LogNoSettings));
        return;
    }
    logInfo(Log.Settings.Loaded, i18nText(UiText.LogLoadSettings));
}

// --- Saving ----------------------------------------------------------------
//
// A control change is cheap to make and expensive to record: writing reads every
// control on the page, rewrites the whole stored object, and rebuilds the Run
// order card. A stepper held down fires one change per tap, so the write waits
// for the taps to stop instead. Nothing else waits -- `setting.default` is the
// live value and is written by the control itself, so a share code, a start
// command and a redraw all see the change straight away.

/** How long a control has to stop moving before the page writes. */
var SAVE_DEBOUNCE_MS = 300;

/**
 * The longest a burst may hold the write off.
 *
 * A stepper can be tapped faster than the debounce for as long as someone cares
 * to, and the panel can be closed out from under it; this is what stops a long
 * burst from never having been written down at all.
 */
var SAVE_MAX_WAIT_MS = 2000;

var saveTimer: number | undefined;
var savePending: SettingSpec[][] | undefined;
var saveDueBy = 0;

/** Records a change, once the changes stop coming. */
function saveSettings(settings: SettingSpec[][]) {
    var now = Date.now();
    if (saveTimer === undefined) {
        saveDueBy = now + SAVE_MAX_WAIT_MS;
    } else {
        clearTimeout(saveTimer);
    }
    savePending = settings;
    saveTimer = setTimeout(flushSettings, Math.max(0, Math.min(SAVE_DEBOUNCE_MS, saveDueBy - now)));
}

/**
 * Writes whatever is waiting, now.
 *
 * Called wherever the wait must not outlive the moment: the panel closing
 * behind Play or a Now button, and a reset, which cancels rather than writes.
 */
function flushSettings() {
    if (saveTimer !== undefined) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
    }
    var pending = savePending;
    savePending = undefined;
    if (pending === undefined) {
        return;
    }
    // And onto a run in progress, for the rows one can take mid-run -- so a
    // change made here shows on the Quick Bar's strip, and takes effect, without
    // either side waiting for the next start().
    pushLiveSettings(recordSettings(pending));
}

/**
 * Writes the form to the store and rebuilds the Run order card.
 *
 * The half of a save that is only about this page. `flushSettings` pushes the
 * result at the run as well; `takeSettingValues` does not, because what it just
 * wrote onto the form came from the run in the first place.
 */
function recordSettings(from: SettingSpec[][]): { [key: string]: SettingValue } {
    var values = collectSettingValues(from);
    if (localStorage !== undefined) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));

        logInfo(Log.Settings.Saved, i18nText(UiText.LogSaveSettings));
    }
    // Every control change lands here, which makes this the one place the Run
    // order card has to be told that what it is describing has changed -- and
    // the one place the preset dropdown can learn that the form is no longer the
    // preset it is claiming.
    refreshRunOrder();
    refreshPresetLabel();
    return values;
}

function resetSettings() {
    // A write still waiting is a write of the values being thrown away.
    if (saveTimer !== undefined) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
    }
    savePending = undefined;
    localStorage.removeItem(SETTINGS_KEY);
    var note = document.getElementById('restartNowText');
    if (note !== null) {
        note.textContent = i18nText(UiText.ChromeRestartNow);
        note.hidden = false;
    }
}

// --- Keeping step with the run ---------------------------------------------
//
// Three places hold a setting while a run is on: this form, the world the
// script is playing under, and the Quick Bar's strip, which draws from that
// world. The strip writes its changes straight onto it (`quickBarApply`) and
// patches this page's stored settings behind it -- but this page reads that
// store once, at load, and is never reloaded, because the host hides and shows
// one long-lived WebView. So without the two calls below the three drift apart
// the moment either side is touched, and Play would then start the next run on
// whatever this form was showing, quietly undoing every change made in the
// strip.
//
// They are kept in step through the running world, the one thing both pages can
// see: a save is handed to it, and it is read back. Once the run has gone the
// store is read instead -- it is the copy the strip patched, and the one place a
// change that crossed a Stop still exists.
//
// What decides *when* that read happens is `JavaScriptInterface.broadcast` --
// the host handing one page's message to the other, both being WebViews in one
// process. Whichever page has just had a change confirmed nudges the other,
// which reads at once rather than on its next poll.
//
// **A nudge lands whether or not this page is on screen, and the poll does not.**
// The strip is worked with this panel closed -- that is what it is for -- so a
// nudge dropped for want of an audience is a nudge dropped in the only case it
// serves, which is how a Quick Bar change used to survive until the next Play
// and no further.
//
// The poll stays, and is the floor rather than the mechanism: the nudge is the
// host's, so a desktop browser has none, and the engine moves settings nobody
// tapped -- a clamp, or a skill holding "Link MyTsum first" off -- with no way
// to announce it.
//
// A nudge carries no values, only the fact that something moved. The engine is
// the authority on what a setting is set to, so both pages read it back rather
// than believe each other; carrying values would make the message a fourth copy
// to keep in step with the three above.

/**
 * How often the form re-reads the running world while it is on screen.
 *
 * The backstop for what no nudge covers, so it is a poll a change no longer has
 * to wait out.
 */
var LIVE_POLL_MS = 3000;

/**
 * Hands what was just saved to a run in progress.
 *
 * The whole form goes. `applyLiveSettings` in the engine holds the one list of
 * what can be changed mid-run -- the same list the strip's own changes go
 * through -- and ignores the rest in silence, so there is no second list here
 * to fall behind it. With nothing running it answers 'no run' and nothing
 * happens, which is the ordinary case and why this does not ask first.
 *
 * The `typeof` guard is the one the Now buttons use: with no bundle loaded the
 * bare name is a ReferenceError in the engine's log rather than here.
 */
function pushLiveSettings(values: { [key: string]: SettingValue }): void {
    var iface = bridge();
    if (iface === undefined) {
        return;
    }
    var code = 'typeof applyLiveSettings === "function" && applyLiveSettings('
        + JSON.stringify(values) + ');';
    // Fired and forgotten unless there is a strip to tell about it. The nudge
    // has to follow the apply *through the engine*, and only these two calls
    // order that: the host dispatches `runScript` onto a pool and returns, while
    // `runScriptCallback` is answered when the evaluation is done. Nudging
    // beside the first would let the strip's read overtake the write it was told
    // about and draw the value it was already showing.
    if (iface.broadcast === undefined) {
        iface.runScript(code);
        return;
    }
    iface.runScriptCallback(code, 'onLiveSettingsApplied');
}

/**
 * The engine has taken the save; tell the other page to read it.
 *
 * Named by `pushLiveSettings` above, so the host can find it. The result is
 * discarded -- the completion is the whole message.
 */
// noinspection JSUnusedGlobalSymbols
function onLiveSettingsApplied(): void {
    var iface = bridge();
    if (iface !== undefined && iface.broadcast !== undefined) {
        iface.broadcast(PageMessage.LiveSettings);
    }
}

/**
 * The other page, through the host: something they both hold has moved.
 *
 * Reading again is the whole handler, because the message carries no values.
 * Forced, because a nudge is not the poll: the strip is worked with this panel
 * closed, which is the one case the message exists for.
 *
 * A preset applied on the strip needs the *store* read as well as the run, and
 * in that order: a preset carries rows no run can take live -- the chores, the
 * mailbox, the hearts -- and those exist nowhere but the store, while the live
 * ones are the run's to clamp and so are read last.
 */
// noinspection JSUnusedGlobalSymbols
function onGapMessage(topic: string): void {
    if (topic === PageMessage.LiveSettings) {
        pullLiveSettings(true);
    } else if (topic === PageMessage.Presets) {
        takeStoredSettings();
        refreshPresetLabel();
        refreshPresetPanel();
        pullLiveSettings(true);
    }
}

/**
 * Asks the run what it is currently set to; `onLiveSettings` takes the answer.
 *
 * Called on the way back on screen and on a timer while there, because the
 * strip and this panel can be up together -- the strip is live exactly when
 * this page is, since both need the run paused, so a single read on the way in
 * would miss anything changed while both are showing.
 *
 * Every reason not to ask is here rather than at the call sites: no bridge (a
 * desktop browser), nobody looking, or a save of this page's own still waiting,
 * which is newer than any answer this would get back.
 *
 * `force` lifts the second of those, and only the nudge passes it. Nobody
 * looking is a reason to skip a *poll*; it is no reason to drop the other page
 * saying it has just moved something -- and dropping it was the bug. The strip
 * is worked with this panel hidden, so the form never heard a Quick Bar change,
 * and Play then started the next run on the values it was still showing.
 */
function pullLiveSettings(force?: boolean): void {
    var iface = bridge();
    if (iface === undefined || savePending !== undefined) {
        return;
    }
    if (document.hidden && force !== true) {
        return;
    }
    iface.runScriptCallback(
        'typeof quickBarState === "function" ? quickBarState() : ""', 'onLiveSettings');
}

/**
 * The engine's answer to `quickBarState()`: what the running world is set to.
 *
 * Rows it names are moved to match and written straight to the store, which is
 * what makes the three copies converge rather than take turns. With no run to
 * answer for, the store is read instead -- see `takeStoredSettings`.
 *
 * Named by the call above, so the host can find it.
 */
// noinspection JSUnusedGlobalSymbols
function onLiveSettings(json: string): void {
    // A change made here since the read went out is newer than this answer.
    if (savePending !== undefined) {
        return;
    }
    var state: { [key: string]: SettingValue } | null;
    try {
        state = JSON.parse(json);
    } catch (e) {
        // With no bundle loaded the guarded eval answers '', which is not JSON.
        // The ordinary state of affairs before the first Play, so nothing is
        // logged for it.
        return;
    }
    // `active` rather than the keys being there: `endRun` clears `gRunActive`
    // before it clears `ts`, so between the two this still answers off a world
    // that is being taken apart.
    if (state === null || state.active !== true) {
        takeStoredSettings();
        return;
    }
    var moved = takeSettingValues(state);
    if (moved.length > 0) {
        logInfo(Log.Settings.LiveRead, 'Took a change made to the running run onto the form',
            {settings: moved.join(' ')});
    }
}

/**
 * The other copy, for when there is no run to be the authority.
 *
 * The strip patches the shared store as it applies (`qbRemember`), so that entry
 * still holds a change whose run has since been stopped -- and it is the only
 * place that change survives, since this page reads its store at load and is
 * never reloaded. Without this, a Quick Bar change followed by Stop is thrown
 * away: Play builds its command from the controls, and they never heard.
 */
function takeStoredSettings(): void {
    var moved = takeSettingValues(storedSettings());
    if (moved.length > 0) {
        logInfo(Log.Settings.StoreRead, 'Took a change made to the stored settings onto the form',
            {settings: moved.join(' ')});
    }
}

/** The shared store as an object; empty when it holds nothing usable. */
function storedSettings(): { [key: string]: SettingValue } {
    if (localStorage === undefined) {
        return {};
    }
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

/**
 * Moves every row the object names onto the value it carries, and saves.
 *
 * Shared by the two things that can be newer than this form -- the running
 * world, and the store the strip patches behind it -- so they cannot disagree
 * about which rows may move or when the write happens. Answers with the keys
 * that moved, so a caller says nothing when nothing did.
 */
function takeSettingValues(values: { [key: string]: SettingValue }): string[] {
    var byKey = settingsByKey();
    var moved: string[] = [];
    for (var key in values) {
        var setting = byKey[key];
        // The reply carries the run's coin averages beside its settings; a key
        // with no row of its own is one of those.
        if (setting === undefined || readSettingValue(setting) === values[key]) {
            continue;
        }
        // Never a row the user has hold of -- that is a field being typed into.
        if (controlFor(setting.key) === document.activeElement) {
            continue;
        }
        if (applySettingValue(setting, values[key])) {
            moved.push(key);
        }
    }
    if (moved.length > 0) {
        // Written now, and not pushed back. These values came from the other two
        // copies, so there is nothing to debounce and nothing to tell the run --
        // and a save left pending is what `pullLiveSettings` refuses to read
        // over, so scheduling one here would drop the next nudge on the floor
        // and then write this stale form over the store the strip had patched.
        recordSettings(settings);
    }
    return moved;
}

// --- Sharing settings ------------------------------------------------------
//
// The Copy button turns the current gameplay settings into one line of text and
// puts it on the clipboard; the Paste button reads that line back and applies
// it. Everything above the clipboard helpers serves those two buttons.
//
// These codes get pasted into chat messages, so the format says as little as it
// can get away with:
//
//     TSUM4-P2f.PgHDAAA.k5.vo~
//           ||  |       |
//           ||  |       one field per non-boolean setting that is NOT at its
//           ||  |       default: a slot character, then the value
//           ||  every boolean setting, one bit each, six bits to a character
//           ||  the script version, in base36, for the status line only
//           one character of checksum over everything after it
//
// Two things keep it short. Booleans -- 26 of the 46 settings -- cost one bit
// each rather than a name and a value, and everything still at its default is
// not mentioned at all. A code is therefore a *whole* configuration despite
// carrying only the differences: what it leaves out is defined to be default,
// which is why applying one resets the settings it does not mention.

/**
 * What every share code starts with.
 *
 * The digit is the format version -- bump it when the payload shape changes, so
 * codes in the old shape are refused outright instead of being misread -- and
 * the prefix as a whole is what lets a code be picked out of a chat message
 * that has words wrapped around it.
 *
 * 2 -> 3 at script version 0.2, when `pauseWhenCalc`'s slot was cut out of
 * SHARE_SLOTS rather than retired: every slot after it moved one place, so a
 * TSUM2 code read here would set each of those settings from its neighbour.
 *
 * 3 -> 4 at 0.9, for the same reason, and it covers four cuts rather than one:
 * `handleLongSkillAnimations`, the two long-retired `''` slots, and
 * `recordSender` / `recordSenderEnlarge`. All of them landed before 0.9 shipped,
 * so the one bump is the whole sweep.
 *
 * 0.12's cut of three slots needed no bump: they were appended and taken out
 * again inside the same unreleased version, so the last shipped slot is still
 * `lorcanaCard` and no code in circulation names a position past it. Only a slot
 * a release has been out with is a promise this file has to keep.
 */
var SHARE_PREFIX = 'TSUM4-';

/**
 * The same prefix with any digit, so a code from another format version can be
 * told apart from a line that was never a code. Both are refused; only one is
 * worth telling the user to ask for a fresh copy of.
 */
var SHARE_PREFIX_PATTERN = 'TSUM[0-9]+-';

/**
 * What every share code ends with.
 *
 * One character outside the alphabet the fields use, so the scan for a code
 * stops there by itself. Without it, a code that an editor hard-wrapped cannot
 * be put back together: joining the lines also joins whatever word came next
 * onto the end of the code. Codes that arrive without it still read fine -- the
 * scan does not require it, it just has nothing to stop at.
 */
var SHARE_SUFFIX = '~';

/** Between fields. Percent-escaped out of any value that could contain one. */
var SHARE_SEPARATOR = '.';

/**
 * Every setting a share code can carry, in the order that *is* their identity:
 * a setting's position here is the character that names it in a code, and its
 * bit in the boolean bitmap.
 *
 * **APPEND ONLY, once the current SHARE_PREFIX digit has shipped.** Reordering,
 * deleting or reusing a position silently turns one setting into another in
 * every code already in circulation. A new setting goes on the end, and codes
 * made before it existed simply do not mention it, so it stays at its default.
 *
 * One exception to that last clause, and it bites: the bitmap is packed six bits
 * to a character, so an old code's last character carries padding bits that read
 * as `false`. A **boolean defaulting to `true`** appended into that padding --
 * any of the five slots after a multiple of six -- is therefore switched off by
 * every older code. `autoPlayGame` sat at slot 19 for one 0.12 build and did
 * exactly that to codes from 0.11. Append such a setting only at a multiple of
 * six, or give it a `false` default.
 *
 * A setting that goes away can be cut outright instead of retired as `''`, but
 * only by bumping SHARE_PREFIX with it: every slot below the cut moves one
 * place, and the new digit is what makes a code in the old shape fail to match
 * the prefix and be refused rather than read against the wrong slots. The digit
 * went TSUM2 -> TSUM3 at 0.2 and TSUM3 -> TSUM4 at 0.9, and one bump covers
 * every cut made before it ships -- which is why 0.9's four are one bump. A slot
 * appended and removed inside one unreleased version is the exception: nothing
 * ever read it, so there is nothing to keep the shape of.
 *
 * There is room for 64 slots (see SHARE_ALPHABET); past that the format needs a
 * wider slot character and a new SHARE_PREFIX digit. `checkShareSlots` says so
 * in the log rather than letting it go unnoticed.
 */
var SHARE_SLOTS: (SettingKey | '')[] = [
    SettingKey.ClickAssist,
    SettingKey.UseFan,
    SettingKey.MaxChainsPerScan,
    SettingKey.MaxChain,
    SettingKey.PrioritizeMyTsum,
    SettingKey.BonusScore,
    SettingKey.BonusCoin,
    SettingKey.BonusExp,
    SettingKey.BonusTime,
    SettingKey.BonusBubble,
    SettingKey.Bonus5to4,
    SettingKey.BonusCombo,
    SettingKey.SkillWaitingTime,
    SettingKey.SkillLevel,
    SettingKey.SkillType,
    SettingKey.NoSkillLastFeverSec,
    SettingKey.SkillAutoTap,
    // Appended, as the rule above requires: a code written before this existed
    // simply does not mention it, and the receiving script keeps its default.
    SettingKey.LinkReachPercent,
    SettingKey.LorcanaCard,
    // The Gameplay row that was never given a slot: it had its `share` ids
    // written and no position to use them from, so it was an oversight rather
    // than a decision. Auto Play Game, the between-rounds delay and Track round
    // statistics were slotted beside it for one 0.12 build and taken out again
    // -- they are about the run, not about the round. See SHARE_TABS.
    SettingKey.BubbleStrategy,
];

/**
 * The tabs a share code -- and so a preset -- draws its rows from.
 *
 * **What travels is how a round is played, and nothing else.** That is the
 * sentence the feature is defined by, and it is narrower than "these two tabs":
 * a row on them that is about the *run* rather than the round is marked
 * `neverShared` and stays home. Five are -- Auto Play Game (whether rounds are
 * played at all), the between-rounds delay, Track round statistics, and the Max
 * Round Duration pair (how long the run will spend on one round before giving
 * up on it). Nothing off these tabs travels either: not the language, the
 * device, the chores, the mailbox or the hearts, which are about the account.
 *
 * The set is still `SHARE_SLOTS`; these two lists are what `checkShareSlots`
 * holds it up against, so a row added to either tab with neither a slot nor a
 * `neverShared` is reported rather than silently left out of every code and
 * every preset.
 */
var SHARE_TABS = ['gameplay', 'skills'];

/**
 * The 64 characters a code is built from: one per slot, and one per six bits of
 * the bitmap. base64url's alphabet, so a code stays safe in a URL.
 */
var SHARE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Marks a dropdown value written out in full, for an entry that has no `share`
 * id of its own. Reserved: no dropdown entry may use it as its id.
 */
var SHARE_RAW_MARKER = '_';

/**
 * True for a row a share code leaves out -- which is every row `SHARE_SLOTS`
 * does not name.
 *
 * The slot list is the definition, not a subset of one. What travels is how a
 * round is played (see SHARE_TABS): a code cannot switch on someone's debug
 * logging, stop their script playing, or rewrite their mailbox, hearts or chore
 * schedules. This is only about what travels; every row is shown alike.
 */
function isUnsharedSetting(setting: SettingSpec): boolean {
    return typeof setting.key !== 'string' || SHARE_SLOTS.indexOf(setting.key as SettingKey) < 0;
}

/** Every setting a code may carry, by key, as *this* version of the script has them. */
function sharedSettingsByKey(): { [key: string]: SettingSpec } {
    var all = settingsByKey();
    var byKey: { [key: string]: SettingSpec } = {};
    for (var i = 0; i < SHARE_SLOTS.length; i++) {
        var key = SHARE_SLOTS[i];
        // A retired slot, or one naming a setting this version no longer has.
        if (key !== '' && all[key] !== undefined) {
            byKey[key] = all[key];
        }
    }
    return byKey;
}

/**
 * The defaults as the script declares them, taken before `loadSettings` writes
 * the user's saved values over `setting.default`.
 *
 * This is the other half of the wire format: a code carries what differs from
 * these, and a code that is applied puts everything it does not mention back to
 * them. Reading `setting.default` later would compare the user's settings with
 * themselves and produce an empty code.
 */
function captureShareDefaults(): { [key: string]: SettingValue } {
    var defaults: { [key: string]: SettingValue } = {};
    var byKey = sharedSettingsByKey();
    for (var key in byKey) {
        defaults[key] = byKey[key].default!;
    }
    return defaults;
}

var SHARE_DEFAULTS = captureShareDefaults();

/**
 * Reports anything that would make codes wrong or unreadable: a slot listed
 * twice, more slots than the alphabet can name, a slot naming a row that must
 * never travel, or a Gameplay or Skills row with neither a slot nor a
 * `neverShared` saying it was left off on purpose.
 *
 * Called once on load. It only writes to the log -- the settings page is not the
 * place to fail loudly -- but it is what turns "someone added a setting and
 * forgot the slot list" from a silent hole in every code and every preset into a
 * line that says so. `bubbleStrategy` is what that hole looked like: it carried
 * `share` ids for two years with no position to use them from.
 */
function checkShareSlots(): void {
    var seen: { [key: string]: boolean } = {};
    var all = settingsByKey();
    for (var i = 0; i < SHARE_SLOTS.length; i++) {
        var key = SHARE_SLOTS[i];
        if (key === '') {
            continue;
        }
        if (seen[key]) {
            logError(Log.Settings.ShareSlotRepeated, 'A share-code slot is used twice',
                {slot: i, key: key});
        }
        // `neverShared` is now belt to the slot list's braces: the list is what
        // decides, and this says a row that got onto it should not have.
        if (all[key] !== undefined && all[key].neverShared === true) {
            logError(Log.Settings.ShareSlotPrivate,
                'A share-code slot names a setting marked as never shared',
                {slot: i, key: key});
        }
        seen[key] = true;
    }
    if (SHARE_SLOTS.length > SHARE_ALPHABET.length) {
        logError(Log.Settings.ShareSlotsOverflow,
            'More share-code slots than the format can name',
            {slots: SHARE_SLOTS.length, alphabet: SHARE_ALPHABET.length});
    }
    for (var t = 0; t < tabs.length; t++) {
        if (SHARE_TABS.indexOf(tabs[t].id) < 0) {
            continue;
        }
        for (var g = 0; g < tabs[t].groups.length; g++) {
            var rows = tabs[t].groups[g].rows;
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                // `neverShared` is the row saying it meant to be left off --
                // it is about the run rather than the round.
                if (typeof row.key === 'string' && row.default !== undefined
                    && !seen[row.key] && row.neverShared !== true) {
                    logWarn(Log.Settings.ShareNoSlot,
                        'A gameplay or skill setting has no share-code slot, so it is in no '
                        + 'share code and no preset',
                        {setting: row.key, tab: tabs[t].id});
                }
            }
        }
    }
}

/** Escapes a value so it cannot be mistaken for a separator or a terminator. */
function escapeShareText(text: string): string {
    // encodeURIComponent leaves these alone, and two of them delimit a code.
    return encodeURIComponent(text).replace(/[.!~*'()]/g, function (c) {
        return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
}

/** Inverse of escapeShareText. Throws on a malformed escape. */
function unescapeShareText(text: string): string {
    return decodeURIComponent(text);
}

/**
 * One character over the body of a code.
 *
 * A code that lost its tail on the way through a chat client, or picked up a
 * typo being read off someone's screen, would otherwise still decode: the
 * format is positional, so a short code is simply a code that mentions less,
 * and what it stops mentioning silently reverts to default. The checksum turns
 * both into "that is not a settings code". Sixty-four buckets -- one character,
 * and it catches 63 mangled codes in 64.
 */
function shareChecksum(body: string): string {
    var sum = 0;
    for (var i = 0; i < body.length; i++) {
        // Reducing modulo a prime on the way, so that every bit of every
        // character reaches the six bits that survive.
        sum = (sum * 31 + body.charCodeAt(i)) % 65521;
    }
    return SHARE_ALPHABET.charAt(sum % 64);
}

/** Packs one bit per slot, six bits to a character, low bit first. */
function packShareBits(bits: boolean[]): string {
    var packed = '';
    for (var i = 0; i < bits.length; i += 6) {
        var chunk = 0;
        for (var b = 0; b < 6; b++) {
            if (bits[i + b]) {
                chunk |= 1 << b;
            }
        }
        packed += SHARE_ALPHABET.charAt(chunk);
    }
    return packed;
}

/**
 * Unpacks the bitmap. Its *length* is what tells us how many slots the sender
 * knew about: bits past the end are not "false", they are "not spoken for", and
 * those settings keep this version's default.
 *
 * Only to within six bits, though -- the packing rounds up, so the last
 * character carries up to five padding bits that read as `false`. That is the
 * trap in appending a **boolean whose default is `true`**: land it in that
 * padding and every code written before it existed switches it off. See the
 * append rule on SHARE_SLOTS.
 */
function unpackShareBits(packed: string): boolean[] {
    var bits: boolean[] = [];
    for (var i = 0; i < packed.length; i++) {
        var chunk = SHARE_ALPHABET.indexOf(packed.charAt(i));
        for (var b = 0; b < 6; b++) {
            bits.push(chunk >= 0 && (chunk & (1 << b)) !== 0);
        }
    }
    return bits;
}

/** One non-boolean value, as it appears in a code. */
function encodeShareValue(setting: SettingSpec, value: SettingValue): string {
    if (typeof value === 'number') {
        return Math.round(value).toString(36);
    }
    var text = String(value);
    if (setting.dropdown !== undefined) {
        for (var i = 0; i < setting.dropdown.length; i++) {
            var item = setting.dropdown[i];
            if (item.key === text) {
                // One character when the entry declares an id, the whole value
                // when it does not -- a new skill still travels, just longer.
                return typeof item.share === 'string' ?
                    item.share : SHARE_RAW_MARKER + escapeShareText(text);
            }
        }
        return SHARE_RAW_MARKER + escapeShareText(text);
    }
    return escapeShareText(text);
}

/** Inverse of encodeShareValue, or undefined when this version cannot use it. */
function decodeShareValue(setting: SettingSpec, text: string): SettingValue | undefined {
    if (typeof setting.default === 'number') {
        var num = parseInt(text, 36);
        return isNaN(num) ? undefined : num;
    }
    if (setting.dropdown !== undefined) {
        if (text.charAt(0) === SHARE_RAW_MARKER) {
            return unescapeShareText(text.substring(1));
        }
        for (var i = 0; i < setting.dropdown.length; i++) {
            if (setting.dropdown[i].share === text) {
                return setting.dropdown[i].key;
            }
        }
        return undefined;
    }
    return unescapeShareText(text);
}

/**
 * How a round is played, as one line of text to hand to someone else. Defaults
 * to the form as it stands, which is what the Copy button wants; the preset
 * export passes each preset's own values instead.
 */
function buildSettingsCode(from?: SettingValues): string {
    var byKey = sharedSettingsByKey();
    var values = from !== undefined ? from : collectSettingValues(settings, isUnsharedSetting);
    var bits: boolean[] = [];
    var fields: string[] = [];

    for (var slot = 0; slot < SHARE_SLOTS.length; slot++) {
        var key = SHARE_SLOTS[slot];
        var setting = byKey[key];
        var value = setting !== undefined ? values[key] : undefined;
        // Every slot gets a bit whether or not it holds a boolean, so that the
        // bitmap's length stays a straight count of the slots the sender knew.
        bits.push(value === true);
        if (value === undefined || typeof value === 'boolean' ||
            value === SHARE_DEFAULTS[key]) {
            continue;
        }
        fields.push(SHARE_ALPHABET.charAt(slot) + encodeShareValue(setting, value));
    }

    var version = parseInt(VERSION, 10);
    var head = [isNaN(version) ? '0' : version.toString(36), packShareBits(bits)];
    var body = head.concat(fields).join(SHARE_SEPARATOR);
    return SHARE_PREFIX + shareChecksum(body) + body + SHARE_SUFFIX;
}

/** A decoded share code. */
interface SharedSettings {
    /** The script version the code was made on. Only used in the status line. */
    v?: string;
    /** The settings the code speaks for. Everything else is at its default. */
    s: { [key: string]: SettingValue };
    /** Fields this version could not use -- an older or newer script's doing. */
    skipped: number;
}

/** Decodes one candidate, or undefined when it turns out not to be a code. */
function decodeSettingsCode(code: string): SharedSettings | undefined {
    var payload = code.substring(SHARE_PREFIX.length, code.length - SHARE_SUFFIX.length);
    var body = payload.substring(1);
    if (payload.charAt(0) !== shareChecksum(body)) {
        return undefined;
    }
    var fields = body.split(SHARE_SEPARATOR);
    // A version and a bitmap are the shortest a real code gets.
    if (fields.length < 2 || !/^[0-9a-z]+$/.test(fields[0]) ||
        !/^[A-Za-z0-9_-]+$/.test(fields[1])) {
        return undefined;
    }

    var byKey = sharedSettingsByKey();
    var shared: SharedSettings = {s: {}, skipped: 0};
    var version = parseInt(fields[0], 36);
    if (!isNaN(version)) {
        shared.v = String(version);
    }

    var bits = unpackShareBits(fields[1]);
    for (var slot = 0; slot < bits.length && slot < SHARE_SLOTS.length; slot++) {
        var setting = byKey[SHARE_SLOTS[slot]];
        if (setting !== undefined && typeof setting.default === 'boolean') {
            shared.s[SHARE_SLOTS[slot]] = bits[slot];
        }
    }

    for (var i = 2; i < fields.length; i++) {
        var field = fields[i];
        if (field === '') {
            continue;   // a stray separator, e.g. a code that ended a sentence
        }
        var index = SHARE_ALPHABET.indexOf(field.charAt(0));
        var target = index >= 0 && index < SHARE_SLOTS.length ?
            byKey[SHARE_SLOTS[index]] : undefined;
        var value = target !== undefined ?
            decodeShareValue(target, field.substring(1)) : undefined;
        if (value === undefined) {
            shared.skipped++;
            logWarn(Log.Settings.ShareFieldIgnored,
                'Ignoring a field with no value while building a share code', {field: field});
            continue;
        }
        shared.s[SHARE_SLOTS[index]] = value;
    }
    return shared;
}

/**
 * Pulls a share code out of whatever was pasted -- the bare code, or a whole
 * chat message around it -- and decodes it.
 *
 * A code sitting in a sentence is found as it stands. One that a mail client or
 * an editor hard-wrapped is only whole again with the line breaks taken out,
 * which is the second thing tried -- second because it is the rougher of the
 * two. Both look for the terminator, which is what says a code arrived whole:
 * it cannot appear inside one, so the match stops there rather than running on
 * into the next word.
 *
 * Returns undefined when there is nothing usable in `text`, so the caller can
 * say so rather than half-apply something.
 */
function parseSettingsCode(text: string): SharedSettings | undefined {
    if (!text) {
        return undefined;
    }
    var pattern = SHARE_PREFIX + '[A-Za-z0-9._%-]+' + SHARE_SUFFIX;
    var candidates: string[] = text.match(new RegExp(pattern, 'g')) || [];
    var unwrapped = new RegExp(pattern).exec(text.replace(/\s+/g, ''));
    if (unwrapped !== null) {
        candidates.push(unwrapped[0]);
    }
    for (var i = 0; i < candidates.length; i++) {
        var shared;
        try {
            shared = decodeSettingsCode(candidates[i]);
        } catch (e) {
            // a malformed escape
            logWarn(Log.Settings.ShareCodeUndecodable, 'A settings code did not decode',
                {errorText: '' + e});
            shared = undefined;
        }
        if (shared !== undefined) {
            return shared;
        }
    }
    return undefined;
}

/**
 * True when `text` holds a code from another version of the format -- the right
 * shape, the wrong digit. `parseSettingsCode` refuses those along with genuine
 * rubbish, and the two are worth telling apart: one is a stale code to ask for
 * again, the other is a line to check for a typo.
 */
function holdsOtherFormatCode(text: string): boolean {
    if (!text) {
        return false;
    }
    var pattern = new RegExp(SHARE_PREFIX_PATTERN + '[A-Za-z0-9._%-]+' + SHARE_SUFFIX);
    // Both spellings parseSettingsCode looks at, so a code that an editor
    // hard-wrapped is recognised as a code here too rather than as rubbish.
    var found = pattern.exec(text) || pattern.exec(text.replace(/\s+/g, ''));
    return found !== null && found[0].indexOf(SHARE_PREFIX) !== 0;
}

/**
 * Writes one shared value onto its row, both on the spec and in the rendered
 * control.
 *
 * Returns false when the value does not belong on that row -- a boolean where a
 * number goes, a skill id this version does not have -- which is what a code
 * from a different script version looks like from here.
 */
function applySettingValue(setting: SettingSpec, value: SettingValue): boolean {
    var control = controlFor(setting.key);
    if (typeof value !== typeof setting.default) {
        return false;
    }
    // A row this channel does not offer refuses the value, exactly as a skill id
    // this version does not have already does: a code or preset written where
    // the row was on offer must not switch on what this build will not show.
    if (!offeredHere(setting.status)) {
        return false;
    }
    if (typeof setting.default === 'boolean') {
        setting.default = value as boolean;
        if (control !== null) {
            control.checked = value;
        }
        return true;
    }
    if (typeof setting.default === 'string' && setting.dropdown !== undefined) {
        var items = setting.dropdown;
        for (var i = 0; i < items.length; i++) {
            if (items[i].key === value) {
                setting.default = value as string;
                if (control !== null) {
                    control.value = value;
                }
                return true;
            }
        }
        return false;
    }
    if (typeof setting.default === 'number') {
        var num = value as number;
        if (!isFinite(num)) {
            return false;
        }
        // Clamped rather than refused: a code made where the range was wider is
        // still worth taking, at this version's limits.
        if (setting.max !== undefined) {
            num = Math.min(num, setting.max);
        }
        if (setting.min !== undefined) {
            num = Math.max(num, setting.min);
        }
        setting.default = num;
        if (control !== null) {
            control.value = String(num);
        }
        return true;
    }
    setting.default = value as string;
    if (control !== null) {
        control.value = value;
    }
    return true;
}

/**
 * Applies a decoded code to the form and saves the result.
 *
 * A code is a whole *round* configuration, so every row a slot names is written:
 * the ones the code speaks for from the code, and the rest back to their
 * defaults. Pasting therefore gives the sender's setup rather than theirs mixed
 * into whatever was already here.
 *
 * The rows no slot names are not touched at all -- the language, the chores, the
 * mailbox, the hearts, the box buying, and the three run-shaped rows on the
 * shared tabs (SHARE_TABS). A code cannot carry them, so putting them back to
 * default would be an edit made on no evidence.
 */
function applySharedSettings(shared: SharedSettings): { applied: number; skipped: number } {
    var byKey = sharedSettingsByKey();
    var applied = 0;
    var skipped = shared.skipped;
    for (var key in byKey) {
        var value = shared.s.hasOwnProperty(key) ? shared.s[key] : SHARE_DEFAULTS[key];
        if (value === undefined) {
            continue;
        }
        if (applySettingValue(byKey[key], value)) {
            applied++;
        } else {
            skipped++;
            logWarn(Log.Settings.ShareKeyIgnored,
                'Ignoring a key from a share code that this version does not know', {key: key});
        }
    }
    saveSettings(settings);
    return {applied: applied, skipped: skipped};
}

/** The host bridge, when the page is running inside a host that has one. */
function bridge(): typeof JavaScriptInterface | undefined {
    return typeof JavaScriptInterface !== 'undefined' ? JavaScriptInterface : undefined;
}

/**
 * The Now button beside "Delay between rounds": ends a wait that is already
 * running, so the next round starts at the play task's next turn.
 *
 * Nothing is saved -- the *setting* is unchanged and the round after this one
 * waits again. It is the running script that holds the wait, so this is the one
 * control on the page that acts on the live run rather than on the form; the
 * `typeof` guard is because the bundle is only loaded once something has been
 * started, and evaluating a name that is not there is a ReferenceError in the
 * engine's log rather than here.
 */
// noinspection JSUnusedGlobalSymbols
function skipRoundDelay(): void {
    var iface = bridge();
    if (iface === undefined) {
        return;
    }
    iface.runScript('typeof roundDelaySkip === "function" && roundDelaySkip();');
    logInfo(Log.Settings.RoundDelaySkipAsked, 'Asked the run to end its between-rounds wait');
}

/**
 * The Now button beside "Unlock Level every hours": runs the level-cap sweep
 * once, whatever the schedule says -- including when it is set to 0.
 *
 * Acts on the run, like `skipRoundDelay` above, with two differences. The
 * page's settings go with the call, so that with nothing running
 * `unlockLevelsNow` can start a run on them with the sweep first -- the button
 * works from a stopped script as well as a playing one. And the panel is closed
 * first, the way Play closes it: an open panel holds a live run paused, and sits
 * over the game a new one would be tapping, so nothing could begin until it went.
 * What a live run is asked for is a *queued* sweep, not an immediate one --
 * `unlockLevelsNow` in src/index.ts says why. The `typeof` guard is for a host
 * with no bundle loaded, where the name would be a ReferenceError.
 */
// noinspection JSUnusedGlobalSymbols
function askUnlockLevelsNow(): void {
    var iface = bridge();
    if (iface === undefined) {
        return;
    }
    // The panel is about to close, so anything the debounce is still holding
    // goes down now -- the call below carries these values either way.
    flushSettings();
    iface.hideMenu();
    iface.showMenu();
    iface.runScript('typeof unlockLevelsNow === "function" && unlockLevelsNow('
        + JSON.stringify(startSettings(settings)) + ');');
    logInfo(Log.Settings.UnlockLevelsNowAsked, 'Asked the run to raise level caps now');
}

/**
 * The Now button beside "Buy boxes every hours": buys boxes once, whatever the
 * schedule says -- including when it is set to 0.
 *
 * `askUnlockLevelsNow` above in every respect, and for the same reasons: the
 * panel is closed first because it holds a live run paused and sits over the
 * game a new one would be tapping, the page's settings go with the call so the
 * button works from a stopped script, and a live run is asked for a *queued*
 * sweep rather than an immediate one.
 */
// noinspection JSUnusedGlobalSymbols
function askBuyBoxesNow(): void {
    var iface = bridge();
    if (iface === undefined) {
        return;
    }
    // As `askUnlockLevelsNow`: the panel closes, so nothing waits.
    flushSettings();
    iface.hideMenu();
    iface.showMenu();
    iface.runScript('typeof buyBoxesNow === "function" && buyBoxesNow('
        + JSON.stringify(startSettings(settings)) + ');');
    logInfo(Log.Settings.BuyBoxesNowAsked, 'Asked the run to buy boxes now');
}

/**
 * The browser's async clipboard, which only exists in a secure context. Both
 * hosts load this page from a file:// base, so it is normally absent and only
 * ever helps when the page is opened in a real browser.
 */
function asyncClipboard(): any {
    var nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
    return nav ? nav.clipboard : undefined;
}

/**
 * Selects the text in a visible box and asks the document to copy it.
 *
 * The selection is left behind on purpose: when the copy is refused, a long
 * press on an already-selected field is the shortest way out for the user. Which
 * box is the caller's to say -- the share code has one, the preset export has
 * another, and copying the wrong one is worse than not copying at all.
 */
function copyFieldSelection(node: HTMLTextAreaElement | undefined): boolean {
    if (node === undefined) {
        return false;
    }
    node.focus();
    node.select();
    // Selecting leaves the caret at the end, which scrolls a multi-line box to
    // the bottom -- so the preset export would open showing its last brace.
    node.scrollTop = 0;
    try {
        return document.execCommand('copy') === true;
    } catch (e) {
        logWarn(Log.Settings.ClipboardExecCommandFailed, 'execCommand(copy) failed',
            {errorText: '' + e});
        return false;
    }
}

/**
 * Puts `text` on the system clipboard, then calls `done` with whether it got
 * there.
 *
 * Three routes, best first: Game Automation Platform's bridge -- the only one
 * that works from a file:// page, and the reason the app grew a clipboard
 * method at all -- then the async clipboard API for when this page is opened in
 * a browser, then `execCommand` on the visible box. A host without the bridge
 * always lands on the last one, and the code stays selected either way.
 *
 * `shown` is the box holding `text` on screen, for that last route. It defaults
 * to the share box, which is what every caller but the preset export wants.
 */
function writeClipboard(text: string, done: (ok: boolean) => void,
                        shown?: HTMLTextAreaElement): void {
    var fallback = function (): boolean {
        return copyFieldSelection(shown !== undefined ? shown : shareBox());
    };
    var iface = bridge();
    if (iface !== undefined && typeof iface.setClipboard === 'function') {
        try {
            iface.setClipboard(text);
            done(true);
            return;
        } catch (e) {
            logWarn(Log.Settings.ClipboardSetFailed, 'setClipboard failed', {errorText: '' + e});
        }
    }
    var clipboard = asyncClipboard();
    if (clipboard && typeof clipboard.writeText === 'function') {
        try {
            clipboard.writeText(text).then(
                function () {
                    done(true);
                },
                function () {
                    done(fallback());
                }
            );
            return;
        } catch (e) {
            logWarn(Log.Settings.ClipboardWriteFailed, 'clipboard.writeText failed',
                {errorText: '' + e});
        }
    }
    done(fallback());
}

/**
 * Hands `done` whatever text the clipboard holds, or '' when this page cannot
 * read it -- the case without a bridge, and under Android's rule that only
 * the app holding input focus may read the clipboard at all.
 */
function readClipboard(done: (text: string) => void): void {
    var iface = bridge();
    if (iface !== undefined && typeof iface.getClipboard === 'function') {
        try {
            done(iface.getClipboard() || '');
            return;
        } catch (e) {
            logWarn(Log.Settings.ClipboardGetFailed, 'getClipboard failed', {errorText: '' + e});
        }
    }
    var clipboard = asyncClipboard();
    if (clipboard && typeof clipboard.readText === 'function') {
        try {
            clipboard.readText().then(
                function (text: string) {
                    done(text || '');
                },
                function () {
                    done('');
                }
            );
            return;
        } catch (e) {
            logWarn(Log.Settings.ClipboardReadFailed, 'clipboard.readText failed',
                {errorText: '' + e});
        }
    }
    done('');
}

// --- reporting a problem ---------------------------------------------------
//
// The one thing on the Debug tab meant for a player. Everything else there has
// to be switched on before the bug; this is what is pressed after it, which is
// why it is not a setting at all.
//
// What it captures is `reportIssue` in the engine (src/report.ts). Note the
// screen it gets: opening this panel pauses the run, and the pause hook presses
// the game's own Pause button, so the frame is the pause menu rather than
// whatever went wrong. The screens *before* it are what carry that -- the
// router's trail, which a report copies -- and the log ring carries the rest.
// The host's own Log-chip long press is the route that catches a live screen.

var reportPanel: HTMLElement | undefined;

function ensureReportPanel(): HTMLElement {
    if (reportPanel !== undefined) {
        return reportPanel;
    }
    var panel = fromTemplate('tpl-report');
    var note = pick(panel, '.report-note') as HTMLInputElement;
    var save = pick(panel, '.report-save');
    var close = pick(panel, '.report-close');

    note.placeholder = i18nText(UiText.ReportNotePlaceholder);
    save.textContent = i18nText(UiText.ButtonSaveReport);
    save.addEventListener('click', function () {
        askReportIssue(note.value);
    });
    close.textContent = i18nText(UiText.ButtonClose);
    close.addEventListener('click', function () {
        panel.hidden = true;
        setReportStatus('', false);
    });

    var row = document.getElementById(rowElementId(RowKey.ReportIssue));
    if (row !== null && row.parentNode !== null) {
        row.parentNode.insertBefore(panel, row.nextSibling);
    } else {
        document.getElementById('tabPanels')!.appendChild(panel);
    }
    reportPanel = panel;
    return panel;
}

function setReportStatus(message: string, isError: boolean): void {
    if (reportPanel === undefined) {
        return;
    }
    var status = pick(reportPanel, '.report-status');
    status.textContent = message;
    status.className = isError ? 'share-status report-status share-error'
        : 'share-status report-status';
}

/** The Report button: opens the note box, and writes nothing yet. */
function openReportPanel(): void {
    var panel = ensureReportPanel();
    panel.hidden = false;
    setReportStatus('', false);
    // Not focused: on a phone that raises the keyboard over the panel, and the
    // note is optional -- most reports are the button and nothing else.
}

/**
 * Asks the engine to write a report, and says what came back.
 *
 * Unlike the two Now buttons, the panel is *not* closed first: this needs the
 * run exactly as it is, and closing the panel would resume it and let the loop
 * move the screen on before the capture. Nothing here waits either -- the
 * answer arrives at `onReportSaved` below.
 */
// noinspection JSUnusedGlobalSymbols
function askReportIssue(note: string): void {
    var iface = bridge();
    if (iface === undefined) {
        setReportStatus(i18nText(UiText.ReportFailed), true);
        return;
    }
    logInfo(Log.Settings.ReportAsked, 'Asked the run to save a report',
        {noted: note !== ''});
    iface.runScriptCallback('typeof reportIssue === "function" ? reportIssue('
        + JSON.stringify('settings') + ',' + JSON.stringify(note) + ') : "no script"',
        'onReportSaved');
}

/**
 * The engine's answer: a report id, or a sentence saying why there is none.
 *
 * An id is the only shape that means it worked, and it always begins with the
 * UTC date stamp `report.ts` builds it from -- so the test is the shape rather
 * than a second value crossing the bridge to say so.
 */
// noinspection JSUnusedGlobalSymbols
function onReportSaved(answer: string): void {
    var id = String(answer === undefined || answer === null ? '' : answer);
    if (!/^\d{8}-\d{6}-/.test(id)) {
        setReportStatus(i18nText(UiText.ReportFailed), true);
        return;
    }
    setReportStatus(id + ' — ' + i18nText(UiText.ReportSaved), false);
}

/**
 * Builds the box under the Share settings row: the code itself, an Apply
 * button, a status line, and the code again as a QR.
 *
 * Built here rather than in index.html so the whole feature stays in one file,
 * and so it sits directly under the two buttons that drive it instead of below
 * a screenful of other settings.
 */
var sharePanel: HTMLElement | undefined;

function ensureSharePanel(): HTMLElement {
    if (sharePanel !== undefined) {
        return sharePanel;
    }
    var panel = fromTemplate('tpl-share');
    var apply = pick(panel, '.share-apply');
    var close = pick(panel, '.share-close');

    apply.textContent = i18nText(UiText.ButtonApply);
    apply.addEventListener('click', function () {
        var box = shareBox();
        applySettingsCodeText(box !== undefined ? box.value : '');
    });
    close.textContent = i18nText(UiText.ButtonClose);
    close.addEventListener('click', function () {
        panel.hidden = true;
        setShareStatus('', false);
    });

    // Directly under the two buttons that drive it, rather than at the end of
    // the tab: the row it belongs to is the one the user just tapped.
    var row = document.getElementById(rowElementId(RowKey.ShareSettings));
    if (row !== null && row.parentNode !== null) {
        row.parentNode.insertBefore(panel, row.nextSibling);
    } else {
        document.getElementById('tabPanels')!.appendChild(panel);
    }
    sharePanel = panel;
    return panel;
}

/** The textarea holding the code, once the panel has been built. */
function shareBox(): HTMLTextAreaElement | undefined {
    return sharePanel === undefined ?
        undefined : pick(sharePanel, '.share-code') as HTMLTextAreaElement;
}

/**
 * How wide the QR is drawn, in CSS pixels, before the module size is rounded
 * down to a whole number. Under the narrowest page this can be shown on, since
 * a canvas the browser has to shrink loses whole rows of modules.
 */
var SHARE_QR_WIDTH = 220;

/** The canvas the code is drawn onto, once the panel has been built. */
function shareQrCanvas(): HTMLCanvasElement | undefined {
    return sharePanel === undefined ?
        undefined : pick(sharePanel, '.share-qr') as HTMLCanvasElement;
}

/**
 * Draws whatever is in the share box as a QR, or takes the canvas down when it
 * is not something a camera should be pointed at.
 *
 * This is the route between two phones that needs nothing else installed: the
 * other player photographs the screen instead of being sent the line. It shows
 * the box's contents rather than the current settings, so a pasted code draws
 * the code that was pasted -- what is on screen and what the camera reads are
 * then the same thing, whichever button opened the panel.
 *
 * The quiet zone is drawn into the bitmap rather than left to the CSS margin,
 * because it is four modules of the symbol and has to survive a crop.
 */
function drawShareQr(text: string): void {
    var canvas = shareQrCanvas();
    if (canvas === undefined) {
        return;
    }
    var matrix = text === '' ? undefined : qrMatrix(text);
    var context = canvas.getContext('2d');
    if (matrix === undefined || context === null) {
        canvas.hidden = true;
        return;
    }

    var quiet = 4;
    var span = matrix.length + quiet * 2;
    // A whole number of pixels per module, so nothing is ever half a module
    // wide. `image-rendering: pixelated` keeps them square from there.
    var scale = Math.max(3, Math.floor(SHARE_QR_WIDTH / span));
    canvas.width = span * scale;
    canvas.height = span * scale;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    for (var y = 0; y < matrix.length; y++) {
        for (var x = 0; x < matrix.length; x++) {
            if (matrix[y][x]) {
                context.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
            }
        }
    }
    canvas.hidden = false;
}

/** Says what just happened, under the Share settings row. */
function setShareStatus(message: string, isError: boolean): void {
    if (sharePanel === undefined) {
        return;
    }
    var status = pick(sharePanel, '.share-status');
    status.textContent = message;
    status.className = isError ? 'share-status share-error' : 'share-status';
}

/**
 * Opens the share box with `text` in it.
 *
 * Focus is asked for only when the user is meant to type into the box, since on
 * a phone it is what raises the keyboard. Copying does not need it: the one
 * route that does -- `copyFieldSelection` -- takes focus itself, and only
 * when it is actually reached.
 */
function showShareText(text: string, focus: boolean): void {
    var panel = ensureSharePanel();
    var box = shareBox()!;
    panel.hidden = false;
    box.value = text;
    drawShareQr(text);
    if (focus) {
        box.focus();
    }
}

/**
 * Applies whatever `text` holds and reports the result. The Apply button and
 * the Paste button both end up here.
 */
function applySettingsCodeText(text: string): void {
    ensureSharePanel();
    var shared = parseSettingsCode(text);
    if (shared === undefined) {
        showShareText(text || '', false);
        setShareStatus(i18nText(holdsOtherFormatCode(text) ?
            UiText.ShareOtherFormat : UiText.ShareNotACode), true);
        return;
    }
    var result = applySharedSettings(shared);
    var from = shared.v ? ' (v' + shared.v + ')' : '';
    showShareText(text, false);
    // Two sentences rather than one with an optional tail: a language that puts
    // the skipped count somewhere else in the sentence has nowhere to put it
    // when the tail is glued on here.
    setShareStatus(i18nFormat(
        result.skipped > 0 ? UiText.ShareAppliedSkipped : UiText.ShareApplied,
        {applied: result.applied, from: from, skipped: result.skipped}), false);
}

/**
 * The Copy button.
 *
 * The code is shown either way: when the clipboard is out of reach it is the
 * only way to get at it, and when it is not, seeing what was copied costs two
 * lines of screen.
 */
// noinspection JSUnusedGlobalSymbols
function copySettingsCode(): void {
    ensureSharePanel();
    var code = buildSettingsCode();
    showShareText(code, false);
    writeClipboard(code, function (ok) {
        setShareStatus(i18nText(ok ? UiText.ShareCopied : UiText.ShareCopyFailed), !ok);
    });
}

/**
 * The Paste button.
 *
 * When the clipboard cannot be read -- no bridge, or an app without focus -- the
 * box opens empty instead, for the user to paste into and tap Apply.
 */
// noinspection JSUnusedGlobalSymbols
function pasteSettingsCode(): void {
    ensureSharePanel();
    readClipboard(function (text) {
        if (parseSettingsCode(text) !== undefined) {
            applySettingsCodeText(text);
            return;
        }
        showShareText('', true);
        setShareStatus(i18nText(text ?
            UiText.SharePasteEmpty : UiText.SharePastePrompt), false);
    });
}

// --- Presets ---------------------------------------------------------------
//
// A preset is a name and a settings code's worth of form: **the Gameplay and
// Skills tabs, and nothing else**. `SHARE_SLOTS` above is that set, so a preset
// and a share code carry exactly the same rows -- which is what makes the code
// the export format rather than a second one invented for this.
//
// This half is the app bar: the dropdown that says which preset the form
// currently *is* and switches between them, the panel behind the save button,
// and the export row on the General tab. `src/presets.ts` is the store.
//
// Two things are worth knowing before editing any of it.
//
// **Nothing remembers which preset is loaded.** The dropdown's label is worked
// out by matching the form against every preset on each save (`presetMatchName`),
// so a value changed by hand afterwards drops it back to "No preset" with nothing
// to invalidate -- and a change made on the Quick Bar's strip does the same, for
// free, because that change reaches this form and this form is what is matched.
//
// **Applying one is applying a whole round configuration**, exactly as
// pasting a share code is: every row a slot names is written, the ones the
// preset names from it and the rest back to their defaults. Merging would make
// "switch between configurations" mean something different each time. The rows
// outside that set are left where they are -- switching presets does not touch
// your language, your chores or your mailbox.

/** The form as a preset keeps it: the rows a share code speaks for, and no others. */
function presetFormValues(): SettingValues {
    return collectSettingValues(settings, isUnsharedSetting);
}

/** Which saved preset the form currently is, or '' for none. */
function presetLoadedName(): string {
    return presetMatchName(presetsLoad(), presetFormValues());
}

/**
 * Redraws the app bar's dropdown.
 *
 * Called from `recordSettings`, which is the one place every save funnels
 * through -- a change made here, a change taken off the running world, a change
 * the strip made and pushed back -- so the label cannot go stale without the
 * settings themselves going stale with it.
 */
function refreshPresetLabel(): void {
    var select = document.getElementById('presetSelect') as HTMLButtonElement | null;
    var label = document.getElementById('presetName');
    if (select === null || label === null) {
        return;
    }
    var list = presetsLoad();
    var name = presetMatchName(list, presetFormValues());
    label.textContent = name !== '' ? name : i18nText(UiText.PresetNone);
    // An empty list has nothing to open; the save button beside it is the way in.
    select.disabled = list.length === 0;
}

/** The list of saved presets; picking one loads it. */
function openPresetSheet(): void {
    var owner = document.getElementById('presetSelect');
    var list = presetsLoad();
    if (owner === null || list.length === 0) {
        return;
    }
    var current = presetLoadedName();
    openListSheet(owner, function (box, close) {
        var chosen: HTMLElement | null = null;
        for (var i = 0; i < list.length; i++) {
            var option = fromTemplate('tpl-select-option');
            // The user's own text, so it is set as text and never as a key --
            // `getTitle` is for a `UiText`, and a preset name is not one.
            option.textContent = list[i].name;
            option.setAttribute('aria-selected', list[i].name === current ? 'true' : 'false');
            option.addEventListener('click', (function (preset: Preset) {
                return function () {
                    close();
                    applyPreset(preset);
                };
            })(list[i]));
            if (list[i].name === current) {
                chosen = option;
            }
            box.appendChild(option);
        }
        return chosen;
    });
}

/**
 * Loads a preset onto the form, and onto the run in progress.
 *
 * Written now rather than on the debounce: this is a deliberate act like Play or
 * a Now button, and half of what it is worth is that the strip and the run move
 * with it. `flushSettings` is what carries it to both -- the store the next
 * `start()` reads, and `applyLiveSettings` for the rows a run can take live.
 */
function applyPreset(preset: Preset): void {
    var byKey = sharedSettingsByKey();
    var applied = 0;
    for (var key in byKey) {
        var value = preset.values.hasOwnProperty(key) ? preset.values[key] : SHARE_DEFAULTS[key];
        if (value === undefined) {
            continue;
        }
        if (applySettingValue(byKey[key], value)) {
            applied++;
        }
    }
    saveSettings(settings);
    flushSettings();
    var field = document.getElementById('presetNameInput') as HTMLInputElement | null;
    if (field !== null) {
        // So the panel opens on the preset that is loaded and Update is one tap.
        field.value = preset.name;
    }
    refreshPresetPanel();
    logInfo(Log.Settings.PresetApplied, 'Loaded a preset onto the form',
        {preset: preset.name, settings: applied});
}

/** The save panel, and the field inside it. */
function presetPanel(): HTMLElement | null {
    return document.getElementById('presetPanel');
}

function presetNameField(): HTMLInputElement | null {
    return document.getElementById('presetNameInput') as HTMLInputElement | null;
}

function openPresetPanel(): void {
    var panel = presetPanel();
    var field = presetNameField();
    if (panel === null || field === null) {
        return;
    }
    if (panel.hidden === false) {
        closePresetPanel();
        return;
    }
    panel.hidden = false;
    // Opens on whatever is loaded, so the common act -- adjust a setting, save it
    // back -- is one tap. An empty box is what a new preset starts from.
    if (field.value === '') {
        field.value = presetLoadedName();
    }
    setPresetStatus('', false);
    refreshPresetPanel();
    field.focus();
    field.select();
}

function closePresetPanel(): void {
    var panel = presetPanel();
    if (panel !== null) {
        panel.hidden = true;
    }
    setPresetStatus('', false);
}

/**
 * Enables what the typed name allows, so each button says what it would do: a
 * name nothing holds can only be saved as new, and one that is taken can only be
 * overwritten or deleted.
 */
function refreshPresetPanel(): void {
    var field = presetNameField();
    if (field === null) {
        return;
    }
    var name = presetCleanName(field.value);
    var exists = presetIndexOf(presetsLoad(), name) >= 0;
    var setEnabled = function (id: string, enabled: boolean) {
        var button = document.getElementById(id) as HTMLButtonElement | null;
        if (button !== null) {
            button.disabled = !enabled;
        }
    };
    setEnabled('presetSaveNew', name !== '' && !exists);
    setEnabled('presetUpdate', exists);
    setEnabled('presetDelete', exists);
}

/** Says what just happened, inside the save panel. */
function setPresetStatus(message: string, isError: boolean): void {
    var status = document.getElementById('presetStatus');
    if (status !== null) {
        status.textContent = message;
        status.className = isError ? 'preset-status share-error' : 'preset-status';
    }
}

/**
 * Saves the form under the name in the field.
 *
 * `overwrite` is which button was pressed, and it is checked rather than
 * inferred: "Save as new" over a name that is taken is a preset about to be lost
 * silently, and "Update" over one that is not is a typo about to become a second
 * preset. Both say so instead.
 */
function savePreset(overwrite: boolean): void {
    var field = presetNameField();
    if (field === null) {
        return;
    }
    var name = presetCleanName(field.value);
    if (name === '') {
        setPresetStatus(i18nText(UiText.PresetNeedsName), true);
        return;
    }
    var list = presetsLoad();
    var exists = presetIndexOf(list, name) >= 0;
    if (overwrite && !exists) {
        setPresetStatus(i18nFormat(UiText.PresetUnknownName, {name: name}), true);
        return;
    }
    if (!overwrite && exists) {
        setPresetStatus(i18nFormat(UiText.PresetNameTaken, {name: name}), true);
        return;
    }
    if (!exists && list.length >= PRESET_MAX) {
        setPresetStatus(i18nFormat(UiText.PresetFull, {max: PRESET_MAX}), true);
        return;
    }
    if (!presetsStore(presetsPut(list, name, presetFormValues()))) {
        setPresetStatus(i18nText(UiText.PresetStoreFailed), true);
        logError(Log.Settings.PresetStoreFailed, 'The presets could not be stored',
            {preset: name});
        return;
    }
    field.value = name;
    setPresetStatus(i18nFormat(exists ? UiText.PresetUpdated : UiText.PresetSaved,
        {name: name}), false);
    logInfo(Log.Settings.PresetSaved, 'Saved the form as a preset',
        {preset: name, replaced: exists});
    presetsChanged();
}

/** Removes the preset named in the field. */
function deletePreset(): void {
    var field = presetNameField();
    if (field === null) {
        return;
    }
    var name = presetCleanName(field.value);
    var list = presetsLoad();
    if (presetIndexOf(list, name) < 0) {
        setPresetStatus(i18nFormat(UiText.PresetUnknownName, {name: name}), true);
        return;
    }
    if (!presetsStore(presetsWithout(list, name))) {
        setPresetStatus(i18nText(UiText.PresetStoreFailed), true);
        logError(Log.Settings.PresetStoreFailed, 'The presets could not be stored',
            {preset: name});
        return;
    }
    setPresetStatus(i18nFormat(UiText.PresetDeleted, {name: name}), false);
    logInfo(Log.Settings.PresetDeleted, 'Deleted a preset', {preset: name});
    presetsChanged();
}

/**
 * The list has moved: redraw here, and tell the strip.
 *
 * The Quick Bar draws its own dropdown from the same store, and it is read once
 * per render rather than held, so the nudge is the whole message -- see
 * `PageMessage.Presets`.
 */
function presetsChanged(): void {
    refreshPresetLabel();
    refreshPresetPanel();
    var iface = bridge();
    if (iface !== undefined && iface.broadcast !== undefined) {
        iface.broadcast(PageMessage.Presets);
    }
}

/** What the file export is called, under the engine's storage path. */
var PRESET_FILE_NAME = 'presets.txt';

/**
 * Every preset as one block of text: a name and its settings code per line.
 *
 * The code is the vehicle because a preset holds exactly what a code carries --
 * `SHARE_SLOTS` -- so nothing is lost on the way out and nothing has to be
 * invented on the way in. One line is one whole configuration, and
 * `parseSettingsCode` finds a code inside whatever text is wrapped around it, so
 * a line pasted into the Share settings box applies as it stands. That is the
 * import path, and it is the one that already existed.
 */
function presetsExportText(list: Preset[]): string {
    var lines: string[] = [];
    for (var i = 0; i < list.length; i++) {
        lines.push(list[i].name + ': ' + buildSettingsCode(list[i].values));
    }
    return lines.join('\n');
}

/** The panel under the Export presets row, built the first time it is used. */
var presetExportPanel: HTMLElement | undefined;

function ensurePresetExportPanel(): HTMLElement {
    if (presetExportPanel !== undefined) {
        return presetExportPanel;
    }
    var panel = fromTemplate('tpl-preset-export');
    var close = pick(panel, '.preset-export-close');
    close.textContent = i18nText(UiText.ButtonClose);
    close.addEventListener('click', function () {
        panel.hidden = true;
    });
    var row = document.getElementById(rowElementId(RowKey.ExportPresets));
    if (row !== null && row.parentNode !== null) {
        row.parentNode.insertBefore(panel, row.nextSibling);
    } else {
        document.getElementById('tabPanels')!.appendChild(panel);
    }
    presetExportPanel = panel;
    return panel;
}

/**
 * Opens the export panel with `text` in it, and clears whatever the last export
 * had to say.
 *
 * The clear matters because the clipboard route can be asynchronous: without it
 * the line from the previous attempt stands until the new one answers, which is
 * a message about an export that already happened.
 */
function showPresetExport(text: string): HTMLTextAreaElement {
    var panel = ensurePresetExportPanel();
    var box = pick(panel, '.preset-export-text') as HTMLTextAreaElement;
    panel.hidden = false;
    box.value = text;
    setPresetExportStatus('', false);
    return box;
}

function setPresetExportStatus(message: string, isError: boolean): void {
    if (presetExportPanel === undefined) {
        return;
    }
    var status = pick(presetExportPanel, '.preset-status');
    status.textContent = message;
    status.className = isError ? 'preset-status share-error' : 'preset-status';
}

/**
 * The Copy button on the Export presets row.
 *
 * The text is shown as well as copied, for the same reason the share code is:
 * when the clipboard is out of reach the visible box is the only way to it, and
 * it is what `writeClipboard`'s last resort selects.
 */
// noinspection JSUnusedGlobalSymbols
function copyPresetsExport(): void {
    var list = presetsLoad();
    if (list.length === 0) {
        showPresetExport('');
        setPresetExportStatus(i18nText(UiText.PresetExportNone), true);
        return;
    }
    var text = presetsExportText(list);
    var box = showPresetExport(text);
    writeClipboard(text, function (ok) {
        setPresetExportStatus(i18nText(ok ?
            UiText.PresetExportCopied : UiText.PresetExportCopyFailed), !ok);
        if (ok) {
            logInfo(Log.Settings.PresetExported, 'Copied every preset to the clipboard',
                {presets: list.length});
        }
    }, box);
}

/**
 * The Save file button on the Export presets row.
 *
 * This page is a file:// document in a WebView and has no filesystem of its own,
 * so the write goes through the bundle's `writeFile` native -- which means it
 * only works once something has been started, and the reply below is what says
 * so rather than leaving the button looking ignored. The directory is read from
 * `Config.recordDir` inside the engine, so the export lands beside the round
 * stats with nothing here holding a second copy of that name.
 */
// noinspection JSUnusedGlobalSymbols
function savePresetsFile(): void {
    var list = presetsLoad();
    if (list.length === 0) {
        showPresetExport('');
        setPresetExportStatus(i18nText(UiText.PresetExportNone), true);
        return;
    }
    var text = presetsExportText(list);
    showPresetExport(text);
    var iface = bridge();
    if (iface === undefined) {
        setPresetExportStatus(i18nText(UiText.PresetExportNoEngine), true);
        return;
    }
    iface.runScriptCallback('(function () {'
        + 'if (typeof writeFile !== "function" || typeof getStoragePath !== "function"'
        + ' || typeof Config === "undefined") { return "no engine"; }'
        + 'try {'
        + 'var dir = getStoragePath() + "/" + Config.recordDir;'
        + 'execute("mkdir -p " + dir);'
        + 'var path = dir + "/" + ' + JSON.stringify(PRESET_FILE_NAME) + ';'
        + 'writeFile(path, ' + JSON.stringify(text) + ');'
        + 'return path;'
        + '} catch (e) { return "error " + e; }'
        + '})()', 'onPresetsFileWritten');
}

/**
 * The engine's answer to the call above: the path it wrote, or why it did not.
 *
 * Named by `savePresetsFile`, so the host can find it.
 */
// noinspection JSUnusedGlobalSymbols
function onPresetsFileWritten(reply: string): void {
    var answer = reply === undefined || reply === null ? '' : String(reply);
    if (answer === '' || answer === 'no engine' || answer === 'undefined') {
        setPresetExportStatus(i18nText(UiText.PresetExportNoEngine), true);
        return;
    }
    if (answer.indexOf('error ') === 0) {
        setPresetExportStatus(i18nFormat(UiText.PresetExportFailed,
            {error: answer.substring(6)}), true);
        return;
    }
    setPresetExportStatus(i18nFormat(UiText.PresetExportSaved, {path: answer}), false);
    logInfo(Log.Settings.PresetExported, 'Wrote every preset to a file', {path: answer});
}

/** Wires the app bar's two preset controls and the panel behind them. */
function bindPresets(): void {
    var select = document.getElementById('presetSelect');
    if (select !== null) {
        select.addEventListener('click', openPresetSheet);
    }
    var save = document.getElementById('presetSave');
    if (save !== null) {
        save.addEventListener('click', openPresetPanel);
    }
    var field = presetNameField();
    if (field !== null) {
        // Per keystroke rather than on change: the three buttons under it say
        // what the typed name allows, and they have to say it while it is typed.
        field.addEventListener('input', refreshPresetPanel);
    }
    var wire = function (id: string, onClick: () => void) {
        var button = document.getElementById(id);
        if (button !== null) {
            button.addEventListener('click', onClick);
        }
    };
    wire('presetSaveNew', function () { savePreset(false); });
    wire('presetUpdate', function () { savePreset(true); });
    wire('presetDelete', deletePreset);
    wire('presetClose', closePresetPanel);
}

/**
 * The object `start()` receives: every row's live value, plus the language.
 * Shared by the Play command and the unlock Now button, which starts a run
 * on the same settings when nothing is running.
 */
function startSettings(settings: SettingSpec[][]): Partial<Settings> {
    // Keyed rather than a bare `{}` so the assignments below are checked: a key
    // that is not in Settings is a setting the game script will never read.
    var commandSettings: Partial<Settings> & { [k: string]: unknown } = {};
    var values = collectSettingValues(settings);
    for (var key in values) {
        commandSettings[key] = values[key];
    }

    // The chosen language travels with the settings, so the run writes its log
    // sentences in it. A tag rather than a flag: the engine looks the catalogue
    // up by it, so a third language needs no change on either side of this line.
    commandSettings.locale = i18nLocale();
    return commandSettings;
}

function genStartCommand(settings: SettingSpec[][]): string {
    var command = "start(" + JSON.stringify(startSettings(settings)) + ");";
    logInfo(Log.Settings.StartCommand, i18nText(UiText.LogStartCommand), {command: command});
    return command;
}

// --- Theme -----------------------------------------------------------------
//
// Two states, and the device's own setting decides which one the page opens in.
// A tap stores an explicit choice; until there is one, the page keeps following
// the device, so turning the phone to dark at dusk turns this page with it.

/** localStorage key holding an explicit choice, if the user has made one. */
var THEME_KEY = 'tsumtsumtheme';

/** What the device asks for. Light when it has no opinion, or cannot say. */
function systemTheme(): string {
    if (typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

/** The theme the page is showing right now. */
function currentTheme(): string {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Switches the page to `theme`, and records it as the user's choice when
 * `remember` says the user is the one who asked.
 *
 * `data-theme` is always set explicitly, even when it only mirrors the device,
 * because Pico's dark rules and the toggle's own icon both key off it.
 */
function setTheme(theme: string, remember: boolean): void {
    document.documentElement.setAttribute('data-theme', theme);
    var toggle = document.getElementById('themeToggle');
    if (toggle !== null) {
        toggle.setAttribute('aria-label', i18nText(theme === 'dark' ?
            UiText.ChromeThemeToLight : UiText.ChromeThemeToDark));
    }
    if (remember && localStorage !== undefined) {
        localStorage.setItem(THEME_KEY, theme);
    }
}

/** The stored choice, or null while the page is still following the device. */
function storedTheme(): string | null {
    var stored = localStorage !== undefined ? localStorage.getItem(THEME_KEY) : null;
    return stored === 'dark' || stored === 'light' ? stored : null;
}

/**
 * Keeps following the device after load -- but only while there is no stored
 * choice, since that choice is precisely the statement that the device's
 * setting is not what this page should use.
 */
function followSystemTheme(): void {
    if (storedTheme() !== null || typeof window.matchMedia !== 'function') {
        return;
    }
    var query: any = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () {
        setTheme(systemTheme(), false);
    };
    if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', onChange);
    } else if (typeof query.addListener === 'function') {
        query.addListener(onChange);   // pre-2020 WebViews
    }
}

// Run at parse time, from <head>: the theme has to be on the root element
// before the body is laid out, or the page flashes light on a dark device.
setTheme(storedTheme() || systemTheme(), false);

// --- Run order -------------------------------------------------------------
//
// The read-only card on the General tab: which jobs a run will register, in the
// order they will go in, and what one board scan does inside a round.
//
// It is a *mirror* of two places, and nothing checks that it still matches
// them: `buildRun` in src/index.ts, which decides what is registered and with
// which interval, and `taskPlayGameQuick` in src/play.ts, which is the scan
// loop. A task added there needs a line here.

/** One scheduled job, as the card lists it. */
interface RunStep {
    what: string;
    /** Its interval in ms. */
    every: number;
    /** Its place among the jobs due at once: lower first. The card sorts on this. */
    priority: number;
    detail?: string;
}

/** At most one decimal, so 1.5 min stays readable and 3 s stays "3 s". */
function roundedNumber(value: number): string {
    return String(Math.round(value * 10) / 10);
}

/** An interval as "every 6 h" / "every 30 min" / "every 3 s". */
function everyLabel(ms: number): string {
    var amount: string;
    if (ms >= 60 * 60 * 1000) {
        amount = i18nFormat(UiText.RunHours, {count: roundedNumber(ms / (60 * 60 * 1000))});
    } else if (ms >= 60 * 1000) {
        amount = i18nFormat(UiText.RunMinutes, {count: roundedNumber(ms / (60 * 1000))});
    } else {
        amount = i18nFormat(UiText.RunSeconds, {count: roundedNumber(ms / 1000)});
    }
    // Two steps rather than one, so a language may put the unit and the "every"
    // in whichever order it wants; neither string knows about the other.
    return i18nFormat(UiText.RunEvery, {amount: amount});
}

/** The schema row with this key, wherever it sits. */
function rowByKey(key: string): SettingSpec | undefined {
    for (var i = 0; i < settings.length; i++) {
        for (var g = 0; g < settings[i].length; g++) {
            if (settings[i][g].key === key) {
                return settings[i][g];
            }
        }
    }
    return undefined;
}

/** A row's own label, so the card and the row it summarises cannot drift apart. */
function labelOf(key: SettingKey): string {
    var row = rowByKey(key);
    return row === undefined ? key : getTitle(row);
}

/** A dropdown value's label -- the skill name, the bubble strategy. */
function optionLabelOf(key: SettingKey, value: SettingValue): string {
    var row = rowByKey(key);
    var items = row !== undefined ? row.dropdown : undefined;
    for (var i = 0; items !== undefined && i < items.length; i++) {
        if (items[i].key === value) {
            return getTitle(items[i]);
        }
    }
    return String(value);
}

/**
 * The jobs a run would register, off the same table `buildRun` registers from
 * (`runTaskTable`, src/runPlan.ts) -- so a job added there is on the card
 * without a second list here.
 *
 * The order is the table's `JobPriority`: when more than one job is due at
 * once -- at start, all of them are -- the loop takes the lowest first. So
 * sorting on `priority` is the real order, not a presentational choice.
 */
function runOrderSteps(values: { [key: string]: SettingValue }): RunStep[] {
    var steps: RunStep[] = [];
    var jobs = runTaskTable(values);
    for (var i = 0; i < jobs.length; i++) {
        var step: RunStep = {
            what: taskLabel(jobs[i].name),
            every: jobs[i].intervalMs,
            priority: jobs[i].priority
        };
        var detail = taskDetail(jobs[i].name, values);
        if (detail !== '') {
            step.detail = detail;
        }
        steps.push(step);
    }
    return steps;
}

/** What the card calls each job. */
function taskLabel(name: TaskName): string {
    switch (name) {
        case TaskName.Walkthrough: return i18nText(UiText.RunWalkthrough);
        case TaskName.ReceiveOneItem: return i18nText(UiText.RunMailbox);
        case TaskName.ReceiveAllItems: return i18nText(UiText.RunReceiveAll);
        case TaskName.SendHearts: return i18nText(UiText.RunSendHearts);
        case TaskName.AppRestart: return i18nText(UiText.RunRestartApp);
        case TaskName.ClickAssist: return i18nText(UiText.RunClickAssist);
        case TaskName.UnlockLevel: return i18nText(UiText.RunUnlockLevel);
        case TaskName.BuyBoxes: return i18nText(UiText.RunBuyBoxes);
        case TaskName.PlayRound: return i18nText(UiText.RunPlayRound);
    }
}

/** The line under a job: what its settings add up to. Empty when there is nothing to say. */
function taskDetail(name: TaskName, values: { [key: string]: SettingValue }): string {
    var num = function (key: SettingKey): number { return +values[key] || 0; };
    switch (name) {
        // The recorder is a mode, not a job: the table returns it alone.
        case TaskName.Walkthrough: return i18nText(UiText.RunWalkthroughDetail);
        case TaskName.ReceiveOneItem:
            return i18nFormat(UiText.RunMailboxDetail, {max: num(SettingKey.MailOpenMax)});
        case TaskName.ReceiveAllItems: return '';
        case TaskName.SendHearts:
            return num(SettingKey.SendHeartsMaxRuntime) > 0
                ? i18nFormat(UiText.RunSendHeartsLimited,
                    {minutes: num(SettingKey.SendHeartsMaxRuntime)})
                : i18nText(UiText.RunSendHeartsUnlimited);
        // The one job the table marks not due at start.
        case TaskName.AppRestart: return i18nText(UiText.RunRestartAppDetail);
        case TaskName.ClickAssist: return i18nText(UiText.RunClickAssistDetail);
        case TaskName.UnlockLevel: return '';
        case TaskName.BuyBoxes:
            return i18nFormat(UiText.RunBuyBoxesDetail, {
                box: optionLabelOf(SettingKey.BuyBoxType, values[SettingKey.BuyBoxType]),
                boxes: values[SettingKey.BuyBoxTenTimes] === true ? 10 : 1,
                max: num(SettingKey.BuyBoxMaxPurchases)
            });
        case TaskName.PlayRound: {
            // The delay is not a second interval: the task still comes round
            // every 3s and returns until the wait is up (`taskPlayGameQuick`),
            // which is what lets the chores keep their own clocks through it.
            var delay = num(SettingKey.RoundDelayMinutes);
            var cap = num(SettingKey.MaxRoundMinutes);
            return (delay > 0 ? i18nFormat(UiText.RunPlayRoundDelay, {minutes: delay}) : '')
                + (cap > 0 ? i18nFormat(UiText.RunPlayRoundCap, {
                    minutes: cap,
                    action: optionLabelOf(SettingKey.MaxRoundAction,
                        values[SettingKey.MaxRoundAction])
                }) : '')
                + itemsLabel(values);
        }
    }
}

/** What the bonus-item toggles will set on the start screen, before each round. */
function itemsLabel(values: { [key: string]: SettingValue }): string {
    var keys = [SettingKey.BonusScore, SettingKey.BonusCoin, SettingKey.BonusExp,
        SettingKey.BonusTime, SettingKey.BonusBubble, SettingKey.Bonus5to4,
        SettingKey.BonusCombo];
    var chosen: string[] = [];
    for (var i = 0; i < keys.length; i++) {
        if (values[keys[i]] === true) {
            chosen.push(labelOf(keys[i]));
        }
    }
    if (chosen.length === 0) {
        return i18nText(UiText.RunItemsNone);
    }
    // The separator is text too: English joins with a comma, Chinese with the
    // ideographic one, and a third language may want something else again.
    return i18nFormat(UiText.RunItemsSome,
        {items: chosen.join(i18nText(UiText.RunItemsSeparator))});
}

/** One board scan inside a round, step by step -- the loop in taskPlayGameQuick. */
function roundFlowChips(values: { [key: string]: SettingValue }): string[] {
    var chips: string[] = [];
    var num = function (key: SettingKey): number { return +values[key] || 0; };
    var on = function (key: SettingKey): boolean { return values[key] === true; };
    var strategy = String(values[SettingKey.BubbleStrategy]);

    chips.push(i18nText(UiText.FlowScan));
    if (strategy === BubbleStrategy.AllAsap) {
        chips.push(i18nText(UiText.FlowPopAll));
    }
    chips.push(i18nFormat(UiText.FlowPlan, {
        max: num(SettingKey.MaxChain),
        reach: num(SettingKey.LinkReachPercent)
    }));
    if (on(SettingKey.PrioritizeMyTsum)) {
        chips.push(i18nText(UiText.FlowMyTsumFirst));
    }
    chips.push(i18nFormat(UiText.FlowKeep, {count: num(SettingKey.MaxChainsPerScan)}));
    if (on(SettingKey.SkillAutoTap)) {
        chips.push(i18nText(UiText.FlowTapSkill));
    }
    chips.push(i18nText(strategy === BubbleStrategy.OneMidChain
        ? UiText.FlowLinkOneBubble
        : strategy === BubbleStrategy.AllMidChain
            ? UiText.FlowLinkAllBubbles
            : UiText.FlowLink));
    if (on(SettingKey.UseFan)) {
        chips.push(i18nText(UiText.FlowFan));
    }
    chips.push(values[SettingKey.SkillType] === SkillType.NoSkill
        ? i18nText(UiText.FlowNoSkill)
        : i18nFormat(UiText.FlowUseSkill, {
            skill: optionLabelOf(SettingKey.SkillType, values[SettingKey.SkillType]),
            level: num(SettingKey.SkillLevel)
        }));
    if (on(SettingKey.LorcanaCard)) {
        chips.push(i18nText(UiText.FlowLorcanaCard));
    }
    chips.push(i18nText(UiText.FlowBoardUp));
    return chips;
}

/** Builds the whole card from the settings as they stand. */
function buildRunOrder(): HTMLElement {
    var card = fromTemplate('tpl-run-order');
    var list = pick(card, '.run-steps');
    var note = pick(card, '.run-note');
    var flowTitle = pick(card, '.run-flow-title');
    var flow = pick(card, '.run-flow');
    var values = collectSettingValues(settings);
    var steps = runOrderSteps(values);

    steps.sort(function (a, b) { return a.priority - b.priority; });
    for (var i = 0; i < steps.length; i++) {
        var item = fromTemplate('tpl-run-step');
        pick(item, '.run-what').textContent = steps[i].what;
        pick(item, '.run-every').textContent = everyLabel(steps[i].every);
        pick(item, '.run-detail').textContent = steps[i].detail || '';
        list.appendChild(item);
    }

    var plays = values[SettingKey.Walkthrough] !== true
        && (values[SettingKey.AutoPlayGame] === true || values[SettingKey.ClickAssist] === true);
    if (values[SettingKey.Walkthrough] === true) {
        note.textContent = i18nText(UiText.RunNoteRecording);
    } else if (!plays) {
        card.className += ' run-order-warn';
        note.textContent = i18nText(UiText.RunNoteNothingPlays);
    } else {
        note.textContent = i18nText(UiText.RunNoteOrder);
    }

    if (values[SettingKey.Walkthrough] === true || values[SettingKey.AutoPlayGame] !== true
        || values[SettingKey.ClickAssist] === true) {
        flowTitle.parentNode!.removeChild(flowTitle);
        flow.parentNode!.removeChild(flow);
        return card;
    }
    flowTitle.textContent = i18nText(UiText.RunFlowTitle);
    var chips = roundFlowChips(values);
    for (var c = 0; c < chips.length; c++) {
        var chip = fromTemplate('tpl-run-chip');
        chip.textContent = chips[c];
        flow.appendChild(chip);
    }
    return card;
}

/**
 * Redraws the card in place, if it is on the page.
 *
 * Called from `flushSettings`, which every control change reaches once the
 * changes stop -- so the card is never left showing a run that the settings no
 * longer describe, and a stepper held down rebuilds it once rather than per tap.
 */
function refreshRunOrder(): void {
    var shown = document.getElementById(rowElementId(RowKey.RunOrder));
    if (shown === null || shown.parentNode === null) {
        return;
    }
    var fresh = buildRunOrder();
    fresh.id = shown.id;
    shown.parentNode.replaceChild(fresh, shown);
}

// --- Rendering -------------------------------------------------------------
//
// Every piece of page structure is a <template> in index.html; this half clones
// one and fills in text. Nothing below concatenates HTML, which is what lets a
// title or a skill name contain any character at all without being escaped.

/** Clones the one element a <template> holds. */
function fromTemplate(id: string): HTMLElement {
    var template = document.getElementById(id) as HTMLTemplateElement;
    return template.content.firstElementChild!.cloneNode(true) as HTMLElement;
}

/** A row's own element id, and the id of the control inside it. */
function rowElementId(key: SettingSpec['key']): string {
    return 'setting_' + key;
}

function controlElementId(key: SettingSpec['key']): string {
    return 'setting_value_' + key;
}

/** The one element inside `root` matching `selector`. */
function pick(root: ParentNode, selector: string): HTMLElement {
    return root.querySelector(selector) as HTMLElement;
}

/** The localised title of a row, group, tab or dropdown entry. */
function getTitle(spec: { title?: UiText }): string {
    return spec.title === undefined ? '' : i18nText(spec.title);
}

/** The localised second line, or '' for a spec that has none. */
function getHelp(spec: { help?: UiText }): string {
    return spec.help === undefined ? '' : i18nText(spec.help);
}

/**
 * The rendered control holding a setting's value.
 *
 * One id per setting is the whole lookup story here: `readSettingValue`,
 * `applySettingValue` and the share code all reach a row this way, so nothing
 * outside `buildControl` needs to know which kind of control a row got.
 */
function controlFor(key: SettingSpec['key']): any {
    return key === undefined ? null : document.getElementById(controlElementId(key));
}

/** Builds the control for one row, or undefined for the rows that hold no value. */
function buildControl(setting: SettingSpec): HTMLElement | undefined {
    if (typeof setting.default === 'boolean') {
        return buildSwitch(setting);
    }
    if (typeof setting.default === 'string' && setting.dropdown !== undefined) {
        return buildSelect(setting);
    }
    if (typeof setting.default === 'number') {
        return buildStepper(setting);
    }
    if (typeof setting.default === 'string') {
        return buildText(setting);
    }
    if (setting.buttons !== undefined) {
        return buildButtons(setting);
    }
    return undefined;
}

function buildSwitch(setting: SettingSpec): HTMLElement {
    var input = fromTemplate('tpl-switch') as HTMLInputElement;
    input.id = controlElementId(setting.key);
    input.checked = setting.default === true;
    input.addEventListener('change', function () {
        setting.default = input.checked;
        saveSettings(settings);
    });
    return input;
}

/**
 * A dropdown, built from a button and a list instead of a `<select>`.
 *
 * The host shows this page in a WebView inside an overlay window, which has no
 * Activity behind it, and Chromium will not open a select popup without one --
 * silently, so a native `<select>` renders perfectly and then does nothing at
 * all when tapped. Everything here is ordinary page content instead.
 *
 * The button still answers to `.value` exactly as the `<select>` did, which is
 * the whole contract every `controlFor` caller is written against.
 */
function buildSelect(setting: SettingSpec): HTMLElement {
    var button = fromTemplate('tpl-select') as HTMLButtonElement;
    var label = pick(button, '.select-value');
    var name = pick(label, '.select-name');
    var items = setting.dropdown!;
    var current = setting.default as string;

    button.id = controlElementId(setting.key);

    function show(key: string): void {
        current = key;
        for (var i = 0; i < items.length; i++) {
            if (items[i].key === key) {
                name.textContent = getTitle(items[i]);
                drawStatusFlag(label, items[i].status);
                return;
            }
        }
        // An id nobody offers falls back to the id itself and gets no badge: a
        // share code can name a skill this channel does not list.
        name.textContent = key;
        drawStatusFlag(label, undefined);
    }

    // An own property shadows HTMLButtonElement's `value`, so reading and
    // writing the control keeps working unchanged -- including from a share
    // code, which sets `.value` and expects the label to follow.
    Object.defineProperty(button, 'value', {
        configurable: true,
        get: function () { return current; },
        set: function (key) { show(String(key)); }
    });

    show(current);
    button.addEventListener('click', function () {
        openSelectSheet(button, items, current, function (key) {
            show(key);
            setting.default = key;
            applyDropdownEnables(items, key);
            saveSettings(settings);
        });
    });
    return button;
}

/**
 * Turns on whatever the picked dropdown entry declared it needs.
 *
 * See `SettingSpec.enables`. Ticks the row and its control together, through the
 * same `applySettingValue` a share code goes through, so a switch turned on
 * here is indistinguishable from one the user tapped -- it is saved by the
 * caller's `saveSettings` and travels in a share code like any other.
 */
function applyDropdownEnables(items: SettingSpec[], picked: string): void {
    var byKey: { [key: string]: SettingSpec } | null = null;
    for (var i = 0; i < items.length; i++) {
        if (items[i].key !== picked || items[i].enables === undefined) {
            continue;
        }
        var wanted = items[i].enables!;
        for (var j = 0; j < wanted.length; j++) {
            if (byKey === null) {
                byKey = settingsByKey();
            }
            var row = byKey[wanted[j]];
            // A row that is missing, or is not a switch, is a schema that has
            // moved on without this list -- say so rather than half-applying it.
            if (row === undefined || typeof row.default !== 'boolean') {
                logWarn(Log.Settings.EnableUnknown,
                    'A dropdown entry asked to enable a setting that is not a switch here',
                    {option: picked, setting: wanted[j]});
                continue;
            }
            if (row.default === true) {
                continue;
            }
            applySettingValue(row, true);
            logInfo(Log.Settings.Enabled, 'Switched a setting on for the option just picked',
                {option: picked, setting: wanted[j]});
        }
    }
}

/** Every row of the schema that holds a value, by key. */
function settingsByKey(): { [key: string]: SettingSpec } {
    var byKey: { [key: string]: SettingSpec } = {};
    for (var i in settings) {
        for (var g in settings[i]) {
            var setting: SettingSpec = settings[i][g];
            if (typeof setting.key === 'string' && setting.default !== undefined) {
                byKey[setting.key] = setting;
            }
        }
    }
    return byKey;
}

/**
 * Colours an element for an unfinished option and appends its pill.
 *
 * Called after whatever set the element's `textContent`, which is what drops the
 * previous pill -- so the closed row can be redrawn by `show()` without
 * accumulating badges. A finished option is left exactly as it was.
 */
function drawStatusFlag(element: HTMLElement, status: ReleaseStatus | undefined): void {
    // Cleared rather than assumed absent: the closed row is redrawn in place on
    // every pick, where a sheet option is a fresh clone.
    var previous = element.querySelector('.select-flag');
    if (previous !== null) {
        element.removeChild(previous);
    }
    var flag = statusFlag(status);
    if (flag === undefined) {
        element.removeAttribute('data-status');
        return;
    }
    element.setAttribute('data-status', flag.name);
    var pill = fromTemplate('tpl-select-flag');
    pill.textContent = i18nText(flag.title);
    element.appendChild(pill);
}

/**
 * Shows one dropdown's options, and closes on a pick, on the scrim, or on Esc.
 *
 * The sheet is parked on `<body>` rather than beside the button: the panel this
 * page runs in is a couple of hundred pixels tall and scrolls, so anything
 * anchored inside a row would be clipped by it.
 *
 * An entry carrying a `group` opens a new block under that heading -- see
 * `SettingSpec.group`, and `src/skillOptions.ts` for the list that uses it.
 */
function openSelectSheet(
    owner: HTMLElement,
    items: SettingSpec[],
    selected: string,
    onPick: (key: string) => void
): void {
    openListSheet(owner, function (list, close) {
        var chosen: HTMLElement | null = null;
        var group: UiText | undefined;

        for (var i = 0; i < items.length; i++) {
            if (items[i].group !== group) {
                group = items[i].group;
                // A heading between the options, not a box round them: the
                // options stay direct children of the listbox.
                if (group !== undefined) {
                    var heading = fromTemplate('tpl-select-group');
                    heading.textContent = i18nText(group);
                    list.appendChild(heading);
                }
            }
            var option = fromTemplate('tpl-select-option');
            var key = items[i].key!;
            option.textContent = getTitle(items[i]);
            drawStatusFlag(option, items[i].status);
            option.setAttribute('aria-selected', key === selected ? 'true' : 'false');
            option.addEventListener('click', (function (picked) {
                return function () {
                    close();
                    onPick(picked);
                };
            })(key));
            if (key === selected) {
                chosen = option;
            }
            list.appendChild(option);
        }
        return chosen;
    });
}

/**
 * The sheet itself: scrim, Esc, and opening on the row that is set.
 *
 * `fill` puts the rows in and answers with the one already selected, or null.
 * Split out from `openSelectSheet` because the preset dropdown opens the same
 * sheet over a list that is not settings rows at all -- names the user typed --
 * and the only thing the two share is this.
 */
function openListSheet(
    owner: HTMLElement,
    fill: (list: HTMLElement, close: () => void) => HTMLElement | null
): void {
    var sheet = fromTemplate('tpl-select-sheet');
    var list = pick(sheet, '.select-list');

    function close(): void {
        if (sheet.parentNode !== null) {
            sheet.parentNode.removeChild(sheet);
        }
        document.removeEventListener('keydown', onKey);
        owner.setAttribute('aria-expanded', 'false');
    }

    function onKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            close();
        }
    }

    var chosen = fill(list, close);

    pick(sheet, '.select-scrim').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    owner.setAttribute('aria-expanded', 'true');
    document.body.appendChild(sheet);

    // Twenty skills do not fit on a phone-sized panel; open on the one that is
    // set rather than at the top of the alphabet.
    if (chosen !== null) {
        list.scrollTop = chosen.offsetTop - (list.clientHeight - chosen.offsetHeight) / 2;
    }
}

/**
 * A number row: the value, a coarse pair stepping by the row's `step`, and a
 * fine pair stepping by 1.
 *
 * The fine pair is dropped when the coarse step is already 1, and the field
 * itself is typeable -- reaching 350 from 220 ten at a time is thirteen taps.
 */
function buildStepper(setting: SettingSpec): HTMLElement {
    var stepper = fromTemplate('tpl-number');
    var input = pick(stepper, '.setting-number') as HTMLInputElement;
    var step = setting.step || 1;

    input.id = controlElementId(setting.key);
    input.value = String(setting.default);
    input.step = String(step);
    if (setting.min !== undefined) {
        input.min = String(setting.min);
    }
    if (setting.max !== undefined) {
        input.max = String(setting.max);
    }

    var steps = stepper.querySelectorAll('.step');
    for (var i = 0; i < steps.length; i++) {
        var button = steps[i] as HTMLButtonElement;
        var coarse = button.getAttribute('data-coarse');
        var fine = button.getAttribute('data-fine');
        if (fine !== null && step === 1) {
            button.parentNode!.removeChild(button);
            continue;
        }
        var by = coarse !== null ? +coarse * step : +fine!;
        // A real minus sign: the hyphen reads as a dash next to the digits.
        button.textContent = (by > 0 ? '+' : '−') + Math.abs(by);
        button.addEventListener('click', (function (by) {
            return function () {
                setNumberValue(setting, input, (+input.value) + by);
            };
        })(by));
    }

    input.addEventListener('change', function () {
        setNumberValue(setting, input, +input.value);
    });

    // A number row may also carry an action -- "Now", beside the between-rounds
    // delay. Inside the stepper rather than beside it, so the row's control
    // column stays one flex line whatever the row holds.
    if (setting.buttons !== undefined) {
        stepper.appendChild(buildButtons(setting));
    }
    return stepper;
}

/**
 * Writes a number onto its row, clamped to the row's range and rounded, and
 * saves.
 *
 * Every numeric row in the schema is a whole number -- a count, a minute, a
 * percentage -- and a share code already carries one as `Math.round(n)`. Typing
 * `2.5` into a field used to store `2.5` here and travel as `3`; rounding on the
 * way in is the two agreeing.
 */
function setNumberValue(setting: SettingSpec, input: HTMLInputElement, value: number): void {
    var next = isFinite(value) ? Math.round(value) : (setting.default as number);
    if (setting.max !== undefined) {
        next = Math.min(next, setting.max);
    }
    if (setting.min !== undefined) {
        next = Math.max(next, setting.min);
    }
    input.value = String(next);
    setting.default = next;
    saveSettings(settings);
}

function buildText(setting: SettingSpec): HTMLElement {
    var input = fromTemplate('tpl-text') as HTMLInputElement;
    input.id = controlElementId(setting.key);
    input.value = setting.default as string;
    input.addEventListener('change', function () {
        setting.default = input.value;
        saveSettings(settings);
    });
    return input;
}

function buildButtons(setting: SettingSpec): HTMLElement {
    var host = fromTemplate('tpl-buttons');
    var specs = setting.buttons!;
    for (var i = 0; i < specs.length; i++) {
        var button = fromTemplate('tpl-button') as HTMLButtonElement;
        // Called here rather than read off the spec: the schema is built once
        // at load and the language can change under it.
        button.textContent = specs[i].text();
        // By reference rather than through an onclick attribute, which is what
        // used to force these handlers to be space-free source strings.
        button.addEventListener('click', (function (onClick) {
            return function () {
                onClick();
            };
        })(specs[i].onClick));
        host.appendChild(button);
    }
    return host;
}

/** One row: label, optional second line, and its control. */
function renderRow(setting: SettingSpec): HTMLElement {
    // A row that draws itself is the whole row -- no label column, no control.
    if (setting.build !== undefined) {
        var block = setting.build();
        if (setting.key !== undefined) {
            block.id = rowElementId(setting.key);
        }
        return block;
    }
    var control = buildControl(setting);
    var row: HTMLElement;
    if (control === undefined) {
        row = fromTemplate('tpl-note');
        pick(row, '.note-text').textContent = getTitle(setting);
    } else {
        row = fromTemplate('tpl-row');
        var rowTitle = pick(row, '.row-title');
        rowTitle.textContent = getTitle(setting);
        // A row this channel *does* offer but that is not finished says so, the
        // same way an unfinished skill does in the sheet.
        drawStatusFlag(rowTitle, setting.status);
        pick(row, '.row-help').textContent = getHelp(setting);
        pick(row, '.row-control').appendChild(control);
    }
    if (setting.key !== undefined) {
        row.id = rowElementId(setting.key);
    }
    return row;
}

/**
 * One card: a heading, an optional note, and the rows under it.
 *
 * Answers `undefined` for a card this channel has nothing to put in, so a group
 * whose every row is unfinished leaves no empty heading behind.
 */
function renderGroup(group: GroupSpec): HTMLElement | undefined {
    var article = fromTemplate('tpl-group');
    var title = pick(article, '.group-title');
    var help = pick(article, '.group-help');
    var rows = pick(article, '.group-rows');
    var drawn = 0;

    title.textContent = getTitle(group);
    help.textContent = getHelp(group);
    if (help.textContent === '') {
        help.parentNode!.removeChild(help);
    }
    if (group.warn) {
        article.className += ' group-warn';
    }
    for (var i = 0; i < group.rows.length; i++) {
        // Below this channel's floor the row is not drawn at all. It stays in
        // the schema -- `settings` holds these same objects, so it keeps its
        // share slot and still reaches `start()` at its default.
        if (!offeredHere(group.rows[i].status)) {
            continue;
        }
        rows.appendChild(renderRow(group.rows[i]));
        drawn++;
    }
    return drawn === 0 ? undefined : article;
}

/** Builds the tab bar and every panel behind it. */
function renderTabs(bar: HTMLElement, panels: HTMLElement, tabs: TabSpec[]): void {
    for (var t = 0; t < tabs.length; t++) {
        var tab = tabs[t];
        var button = fromTemplate('tpl-tab-button');
        var panel = fromTemplate('tpl-tab-panel');

        button.id = 'tab_' + tab.id;
        button.textContent = getTitle(tab);
        button.setAttribute('aria-controls', 'panel_' + tab.id);
        button.addEventListener('click', (function (id) {
            return function () {
                selectTab(id);
            };
        })(tab.id));

        panel.id = 'panel_' + tab.id;
        panel.setAttribute('aria-labelledby', button.id);
        for (var g = 0; g < tab.groups.length; g++) {
            var card = renderGroup(tab.groups[g]);
            if (card !== undefined) {
                panel.appendChild(card);
            }
        }

        bar.appendChild(button);
        panels.appendChild(panel);
    }
}

/** localStorage key holding the tab that was open last. */
var TAB_KEY = 'tsumtsumtab';

/** Shows one tab and hides the rest, remembering which for the next visit. */
function selectTab(id: string): void {
    for (var t = 0; t < tabs.length; t++) {
        var selected = tabs[t].id === id;
        var button = document.getElementById('tab_' + tabs[t].id);
        var panel = document.getElementById('panel_' + tabs[t].id);
        if (button !== null) {
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
        }
        if (panel !== null) {
            panel.hidden = !selected;
        }
    }
    // The reset button is footer chrome, not a row, so it is shown and hidden
    // here: Debug tab only, one tab away from the rows being adjusted.
    var reset = document.getElementById('resetSettings');
    if (reset !== null) {
        reset.hidden = id !== 'debug';
    }
    if (localStorage !== undefined) {
        localStorage.setItem(TAB_KEY, id);
    }
    window.scrollTo(0, 0);
}

/** The remembered tab, or the first one when there is nothing usable stored. */
function rememberedTab(): string {
    var stored = localStorage !== undefined ? localStorage.getItem(TAB_KEY) : null;
    for (var t = 0; t < tabs.length; t++) {
        if (tabs[t].id === stored) {
            return tabs[t].id;
        }
    }
    return tabs[0].id;
}

// entry function called by the host's settings WebView
// noinspection JSUnusedGlobalSymbols
function onEvent(eventType: string): void {
    if (eventType === 'OnPlayClick') {
        // The panel is closing, so a write the debounce is still holding goes
        // down first. The command below reads the controls, not the store, so
        // this is about what the page comes back to rather than what starts.
        flushSettings();
        // close settings by hiding and showing menu
        JavaScriptInterface.hideMenu();
        JavaScriptInterface.showMenu();
        var startCommand = genStartCommand(settings);
        JavaScriptInterface.runScript(startCommand);
    } else if (eventType === 'OnPauseClick') {
        JavaScriptInterface.runScript('stop();');
    } else if (eventType === 'OnSettingClick') {
        // Nothing, deliberately. The host pauses the run while this panel is up
        // -- a paused script cannot tap the page over the game -- and resumes it
        // when the panel closes. This used to `stop();`, which threw the round,
        // its stats and the whole run away for a look at the settings.
        //
        // The host sends this on the way in *and* on the way out, so reading the
        // run from here would race the save the way out has just pushed. The
        // panel coming back on screen is `visibilitychange`, which is where that
        // read is, and the poll beside it covers a host that never fires one.
        //
        // An older host still stops on its own side, so a run does not survive
        // one; nothing here has to tell the two apart.
    }
}

// function called by the host when writing logs
// noinspection JSUnusedGlobalSymbols
function onLog(message: string): void {
    console.log(message);
}

/**
 * The settings page writes onto the same stream the script does, so it writes
 * the same records: one JSON object per line, the same fixed envelope, a `data`
 * bag for anything the call site had to say, and `component: "settings"`. Mixing
 * one plain-text line into that stream is all it takes to break a JSONL reader
 * on the far end.
 *
 * The schema is `src/logging.ts` -- this is a second, smaller implementation of
 * it rather than a shared one, because the settings UI is a separate ES5
 * compilation that shares nothing with the bundle but `src/shared.d.ts`.
 */
function settingsLog(level: string, event: string, message: string, fields?: {[key: string]: any}): void {
    var record: {[key: string]: any} = {
        timestamp: new Date().toISOString(),
        level: level,
        component: 'settings',
        event: event,
        message: message
    };
    // Always present, even when empty, so the top level is the same set of keys
    // on every record -- from here and from the bundle alike.
    var data: {[key: string]: any} = {};
    if (fields !== undefined) {
        for (var key in fields) {
            if (fields[key] !== undefined) {
                data[key] = fields[key];
            }
        }
    }
    record.data = data;
    var line;
    try {
        line = JSON.stringify(record);
    } catch (e) {
        // As the bundle's logger: a record that will not serialise is reported
        // as an error, on the error channel, rather than lost or thrown.
        level = 'error';
        line = JSON.stringify({
            timestamp: record.timestamp,
            level: 'error',
            component: 'settings',
            event: Log.Settings.Unserializable,
            message: 'A settings log record could not be serialised',
            data: {failedEvent: event}
        });
    }
    if (typeof JavaScriptInterface !== "undefined" && typeof JavaScriptInterface.runScript === "function") {
        var method = level === 'warn' ? 'warn' : (level === 'error' ? 'error' : 'log');
        // `JSON.stringify` of the line is what escapes it into a JS string
        // literal. The hand-rolled quoting this replaces swapped every `'` for a
        // `"` and wrapped the result in single quotes, which mangled any message
        // carrying an apostrophe and would break outright on JSON.
        JavaScriptInterface.runScript('console.' + method + '(' + JSON.stringify(line) + ');');
    } else {
        console.log(line);
    }
}

function logInfo(event: string, message: string, fields?: {[key: string]: any}): void {
    settingsLog('info', event, message, fields);
}

function logWarn(event: string, message: string, fields?: {[key: string]: any}): void {
    settingsLog('warn', event, message, fields);
}

function logError(event: string, message: string, fields?: {[key: string]: any}): void {
    settingsLog('error', event, message, fields);
}

/** The page text that is not a setting row, in the language now chosen. */
function localiseChrome(): void {
    // The locale tags are BCP-47, which is what this attribute wants, so the
    // chosen language is also what a screen reader and the font stack are told.
    document.documentElement.lang = i18nLocale();

    var version = document.getElementById('version');
    if (version !== null) {
        version.textContent = 'Tsum Tsum v' + VERSION;
    }
    var reset = document.getElementById('resetSettings');
    if (reset !== null) {
        reset.textContent = i18nText(UiText.ChromeReset);
    }
    var note = document.getElementById('restartNowText');
    if (note !== null && !note.hidden) {
        note.textContent = i18nText(UiText.ChromeRestartNow);
    }
    localisePresets();
}

/**
 * The preset chrome: the app bar's two controls and the panel behind them.
 *
 * Part of `localiseChrome` rather than of the render, because none of it is
 * inside `#tabPanels` -- it is chrome like the footer, and survives a language
 * change with only its text rewritten.
 */
function localisePresets(): void {
    var labelled = function (id: string, key: UiText) {
        var element = document.getElementById(id);
        if (element !== null) {
            element.setAttribute('aria-label', i18nText(key));
        }
    };
    var titled = function (id: string, key: UiText) {
        var element = document.getElementById(id);
        if (element !== null) {
            element.textContent = i18nText(key);
        }
    };
    labelled('presetSelect', UiText.PresetOpen);
    labelled('presetSave', UiText.PresetManage);
    titled('presetSaveNew', UiText.PresetSaveNew);
    titled('presetUpdate', UiText.PresetUpdate);
    titled('presetDelete', UiText.PresetDelete);
    titled('presetClose', UiText.ButtonClose);
    var field = presetNameField();
    if (field !== null) {
        field.placeholder = i18nText(UiText.PresetNameHint);
        field.setAttribute('aria-label', i18nText(UiText.PresetNameHint));
    }
    // The dropdown's own label is a preset name or "No preset", so it is redrawn
    // rather than translated -- the name is the user's text either way.
    refreshPresetLabel();
}

/**
 * Builds the tab bar and every panel behind it, from scratch.
 *
 * Called again whenever the language changes, which is why it clears first, and
 * why what it wires -- the build-date unlock, the revealed developer rows -- is
 * re-applied here rather than once at startup. Rows keep their live values
 * across a render because `setting.default` is where every control writes.
 */
function renderPage(): void {
    var bar = document.getElementById('tabBar')!;
    var panels = document.getElementById('tabPanels')!;

    bar.textContent = '';
    panels.textContent = '';
    // Both panels are appended into #tabPanels, so they have just gone with it.
    sharePanel = undefined;
    presetExportPanel = undefined;

    renderTabs(bar, panels, tabs);
    selectTab(rememberedTab());
    localiseChrome();
}

/** Renders the page and wires everything that is not a setting row. */
function bootstrap(): void {
    var toggle = document.getElementById('themeToggle');
    if (toggle !== null) {
        toggle.addEventListener('click', function () {
            setTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
        });
    }
    // Re-run now that the button exists, so it gets its label.
    setTheme(currentTheme(), false);
    followSystemTheme();

    // Wired once: the app bar and the panel under it are not re-rendered, and
    // their labels are `localiseChrome`'s, which every render calls.
    bindPresets();

    checkShareSlots();
    loadSettings(settings);
    renderPage();

    // The last word on a debounced write: the panel can go away between a tap
    // and the timer, and the host closes it in ways this page never hears about
    // -- `onEvent` only carries its own three buttons. Coming back is the other
    // half: the page was never reloaded, so whatever the Quick Bar did while it
    // was away is only on the running world until this asks for it.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            flushSettings();
        } else {
            pullLiveSettings();
        }
    });
    window.addEventListener('pagehide', function () {
        flushSettings();
    });
    // And while it is up, because the strip can be open at the same time. Every
    // reason to do nothing is inside `pullLiveSettings`, so a hidden page and a
    // desktop browser both cost one call to it.
    setInterval(pullLiveSettings, LIVE_POLL_MS);
    pullLiveSettings();

    // The footer is not re-rendered, so this is wired once; its label is not,
    // and localiseChrome sets that on every render.
    var reset = document.getElementById('resetSettings');
    if (reset !== null) {
        reset.addEventListener('click', function () {
            resetSettings();
        });
    }

    // convenience preparations of the host control panel. Absent when the page
    // is opened in a desktop browser, which is worth supporting: everything
    // except Play/Pause works there.
    var iface = bridge();
    if (iface !== undefined) {
        iface.showMenu();
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
