// The UI string vocabulary: one key per piece of text the two pages show.
//
// This is the i18n contract. `UiText` is the list of every translatable string;
// `UiStrings` is derived from it, so a catalogue and this enum cannot drift --
// there is one list, and a catalogue is checked against it.
//
// Keys are dotted and grouped by where the text appears (`setting.*`, `run.*`,
// `flow.*`), which is what makes a catalogue file readable top to bottom. The
// key is *not* the English text: wording changes freely, a key is an interface.
//
// A value may carry `{named}` placeholders -- see `tf` in `src/i18n.ts`. Named
// rather than positional because word order is the first thing a translation
// changes; `'Waits {min} min between rounds.'` and its Chinese counterpart put
// the number in different places, and neither has to know that.
//
// Emits nothing. Included by tsconfig.settings.json and tsconfig.quickbar.json.

/**
 * Every translatable string the pages show.
 *
 * A `const enum`, for the reason `SettingKey` is one: it is erased and inlined,
 * so the key costs nothing at runtime and the same vocabulary spans both page
 * compilations without a runtime object to duplicate into each.
 */
declare const enum UiText {
  // --- tabs ---------------------------------------------------------------
  TabGeneral = 'tab.general',
  TabGameplay = 'tab.gameplay',
  TabChores = 'tab.chores',
  TabSkills = 'tab.skills',
  TabHearts = 'tab.hearts',
  TabAdvanced = 'tab.advanced',
  TabDebug = 'tab.debug',

  // --- group headings -----------------------------------------------------
  GroupDevice = 'group.device',
  GroupRunOrder = 'group.runOrder',
  GroupRunOrderHelp = 'group.runOrder.help',
  GroupSettingsCode = 'group.settingsCode',
  GroupSettingsCodeHelp = 'group.settingsCode.help',
  GroupPlaying = 'group.playing',
  GroupBoardHelpers = 'group.boardHelpers',
  GroupItems = 'group.items',
  GroupItemsHelp = 'group.items.help',
  GroupLevelCaps = 'group.levelCaps',
  GroupBoxes = 'group.boxes',
  GroupBoxesHelp = 'group.boxes.help',
  GroupSkill = 'group.skill',
  GroupTiming = 'group.timing',
  GroupReceiveAll = 'group.receiveAll',
  GroupMailbox = 'group.mailbox',
  GroupSendHearts = 'group.sendHearts',
  GroupExperimental = 'group.experimental',
  GroupExperimentalHelp = 'group.experimental.help',
  GroupDiagnostics = 'group.diagnostics',

  // --- setting rows -------------------------------------------------------
  SettingLanguage = 'setting.language',
  SettingLanguageHelp = 'setting.language.help',
  SettingJpVersion = 'setting.jpVersion',
  SettingSpecialScreenRatio = 'setting.specialScreenRatio',
  SettingSpecialScreenRatioHelp = 'setting.specialScreenRatio.help',
  SettingDeviceFps = 'setting.deviceFps',
  SettingDeviceFpsHelp = 'setting.deviceFps.help',
  SettingAutoLaunchApp = 'setting.autoLaunchApp',
  SettingAutoLaunchAppHelp = 'setting.autoLaunchApp.help',
  SettingShareSettings = 'setting.shareSettings',
  SettingExportPresets = 'setting.exportPresets',
  SettingExportPresetsHelp = 'setting.exportPresets.help',
  SettingAutoPlayGame = 'setting.autoPlayGame',
  SettingAutoPlayGameHelp = 'setting.autoPlayGame.help',
  SettingClickAssist = 'setting.clickAssist',
  SettingClickAssistHelp = 'setting.clickAssist.help',
  SettingRoundDelay = 'setting.roundDelay',
  SettingRoundDelayHelp = 'setting.roundDelay.help',
  SettingMaxRound = 'setting.maxRound',
  SettingMaxRoundHelp = 'setting.maxRound.help',
  SettingMaxRoundAction = 'setting.maxRoundAction',
  SettingMaxRoundActionHelp = 'setting.maxRoundAction.help',
  MaxRoundCoast = 'maxRound.coast',
  MaxRoundStop = 'maxRound.stop',
  SettingMaxChainsPerScan = 'setting.maxChainsPerScan',
  SettingMaxChainsPerScanHelp = 'setting.maxChainsPerScan.help',
  SettingMaxChain = 'setting.maxChain',
  SettingMaxChainHelp = 'setting.maxChain.help',
  SettingLinkReach = 'setting.linkReach',
  SettingLinkReachHelp = 'setting.linkReach.help',
  SettingPrioritizeMyTsum = 'setting.prioritizeMyTsum',
  SettingPrioritizeMyTsumHelp = 'setting.prioritizeMyTsum.help',
  SettingTrackRoundStats = 'setting.trackRoundStats',
  SettingTrackRoundStatsHelp = 'setting.trackRoundStats.help',
  SettingBubbleStrategy = 'setting.bubbleStrategy',
  SettingBubbleStrategyHelp = 'setting.bubbleStrategy.help',
  SettingUseFan = 'setting.useFan',
  SettingUseFanHelp = 'setting.useFan.help',
  SettingBonusScore = 'setting.bonusScore',
  SettingBonusScoreHelp = 'setting.bonusScore.help',
  SettingBonusCoin = 'setting.bonusCoin',
  SettingBonusCoinHelp = 'setting.bonusCoin.help',
  SettingBonusExp = 'setting.bonusExp',
  SettingBonusExpHelp = 'setting.bonusExp.help',
  SettingBonusTime = 'setting.bonusTime',
  SettingBonusTimeHelp = 'setting.bonusTime.help',
  SettingBonusBubble = 'setting.bonusBubble',
  SettingBonusBubbleHelp = 'setting.bonusBubble.help',
  SettingBonus5to4 = 'setting.bonus5to4',
  SettingBonus5to4Help = 'setting.bonus5to4.help',
  SettingBonusCombo = 'setting.bonusCombo',
  SettingBonusComboHelp = 'setting.bonusCombo.help',
  SettingUnlockLevel = 'setting.unlockLevel',
  SettingUnlockLevelHelp = 'setting.unlockLevel.help',
  SettingBuyBox = 'setting.buyBox',
  SettingBuyBoxHelp = 'setting.buyBox.help',
  SettingBuyBoxType = 'setting.buyBoxType',
  SettingBuyBoxTypeHelp = 'setting.buyBoxType.help',
  SettingBuyBoxTenTimes = 'setting.buyBoxTenTimes',
  SettingBuyBoxTenTimesHelp = 'setting.buyBoxTenTimes.help',
  SettingBuyBoxMax = 'setting.buyBoxMax',
  SettingBuyBoxMaxHelp = 'setting.buyBoxMax.help',
  BoxPremiumPlus = 'box.premiumPlus',
  BoxPremium = 'box.premium',
  BoxSelect = 'box.select',
  BoxHappiness = 'box.happiness',
  SettingSkillType = 'setting.skillType',
  SettingSkillTypeHelp = 'setting.skillType.help',
  SettingSkillLevel = 'setting.skillLevel',
  SettingSkillLevelHelp = 'setting.skillLevel.help',
  SettingSkillWaitingTime = 'setting.skillWaitingTime',
  SettingSkillWaitingTimeHelp = 'setting.skillWaitingTime.help',
  SettingNoSkillLastFever = 'setting.noSkillLastFever',
  SettingNoSkillLastFeverHelp = 'setting.noSkillLastFever.help',
  SettingSkillAutoTap = 'setting.skillAutoTap',
  SettingSkillAutoTapHelp = 'setting.skillAutoTap.help',
  SettingLorcanaCard = 'setting.lorcanaCard',
  SettingLorcanaCardHelp = 'setting.lorcanaCard.help',
  SettingReceiveAllHearts = 'setting.receiveAllHearts',
  SettingReceiveAllHeartsHelp = 'setting.receiveAllHearts.help',
  /** Shared by the three "wait before repeating" rows, which say the same thing. */
  SettingRepeatWait = 'setting.repeatWait',
  /** The three rows above share a title, so each wait explains its own job. */
  SettingReceiveAllWaitHelp = 'setting.receiveAllWait.help',
  SettingMailWaitHelp = 'setting.mailWait.help',
  SettingSendWaitHelp = 'setting.sendWait.help',
  SettingReceiveOneByOne = 'setting.receiveOneByOne',
  SettingReceiveOneByOneHelp = 'setting.receiveOneByOne.help',
  SettingSkipFirstPerson = 'setting.skipFirstPerson',
  SettingSkipFirstPersonHelp = 'setting.skipFirstPerson.help',
  SettingSkipRuby = 'setting.skipRuby',
  SettingSkipRubyHelp = 'setting.skipRuby.help',
  SettingSkipMedals = 'setting.skipMedals',
  SettingSkipMedalsHelp = 'setting.skipMedals.help',
  SettingClaimAllOldMails = 'setting.claimAllOldMails',
  SettingClaimAllOldMailsHelp = 'setting.claimAllOldMails.help',
  SettingMailOpenMax = 'setting.mailOpenMax',
  SettingMailOpenMaxHelp = 'setting.mailOpenMax.help',
  SettingSendHeartsAuto = 'setting.sendHeartsAuto',
  SettingSendHeartsAutoHelp = 'setting.sendHeartsAuto.help',
  SettingSendToZeroScore = 'setting.sendToZeroScore',
  SettingSendToZeroScoreHelp = 'setting.sendToZeroScore.help',
  SettingSendMaxRuntime = 'setting.sendMaxRuntime',
  SettingSendMaxRuntimeHelp = 'setting.sendMaxRuntime.help',
  SettingAppRestartFrequency = 'setting.appRestartFrequency',
  SettingAppRestartFrequencyHelp = 'setting.appRestartFrequency.help',
  /** Carries the `$BUILD_DATE` placeholder the build substitutes into the page. */
  SettingBuildDate = 'setting.buildDate',
  SettingDebugLogs = 'setting.debugLogs',
  SettingDebugLogsHelp = 'setting.debugLogs.help',
  SettingDebugGame = 'setting.debugGame',
  SettingDebugGameHelp = 'setting.debugGame.help',
  SettingWalkthrough = 'setting.walkthrough',
  SettingWalkthroughHelp = 'setting.walkthrough.help',
  SettingCollectUnknownScreens = 'setting.collectUnknownScreens',
  SettingCollectUnknownScreensHelp = 'setting.collectUnknownScreens.help',
  SettingPageHistoryDepth = 'setting.pageHistoryDepth',
  SettingPageHistoryDepthHelp = 'setting.pageHistoryDepth.help',
  SettingReportIssue = 'setting.reportIssue',
  SettingReportIssueHelp = 'setting.reportIssue.help',
  /** The note box under the Report row, and what it says once one is written. */
  ReportNotePlaceholder = 'report.notePlaceholder',
  ReportSaved = 'report.saved',
  ReportFailed = 'report.failed',

  // --- dropdown entries ---------------------------------------------------
  BubbleOneMidChain = 'bubble.oneMidChain',
  BubbleAllMidChain = 'bubble.allMidChain',
  BubbleAllAsap = 'bubble.allAsap',
  /* The Quick Bar's names for the same three: its chip is a few characters
     wide, where the full names above are an ellipsis. See `BubbleOption.short`. */
  BubbleOneMidChainShort = 'bubble.oneMidChain.short',
  BubbleAllMidChainShort = 'bubble.allMidChain.short',
  BubbleAllAsapShort = 'bubble.allAsap.short',

  /** The Skill Type dropdown's three headings -- see `src/skillOptions.ts`. */
  SkillGroupBurst = 'skill.group.burst',
  SkillGroupBubble = 'skill.group.bubble',
  SkillGroupUnique = 'skill.group.unique',

  /**
   * The badge on a skill that is not finished -- see `ReleaseStatus`. A
   * Production skill has none, so there is no third key here.
   */
  StatusFlagAlpha = 'status.flag.alpha',
  StatusFlagBeta = 'status.flag.beta',

  SkillBurst = 'skill.burst',
  SkillBurstBubbles = 'skill.burstBubbles',
  SkillDonald = 'skill.donald',
  SkillHolidayDonald = 'skill.holidayDonald',
  SkillJediLuke = 'skill.jediLuke',
  SkillMoana = 'skill.moana',
  SkillMarie = 'skill.marie',
  SkillMissBunny = 'skill.missBunny',
  SkillRabbit = 'skill.rabbit',
  SkillHornHatMickey = 'skill.hornHatMickey',
  SkillSnowWhite = 'skill.snowWhite',
  SkillCinderella = 'skill.cinderella',
  SkillSheriffWoody = 'skill.sheriffWoody',
  SkillCabbageMickey = 'skill.cabbageMickey',
  SkillCptLightyear = 'skill.cptLightyear',
  SkillCptLightyear120 = 'skill.cptLightyear120',
  SkillLightningMcQueenPlus = 'skill.lightningMcQueenPlus',
  SkillFormalBeast = 'skill.formalBeast',
  SkillGaston = 'skill.gaston',
  SkillTiaraMinniePlus = 'skill.tiaraMinniePlus',
  SkillCoronationElsa = 'skill.coronationElsa',
  SkillRapunzelPlus = 'skill.rapunzelPlus',
  SkillLorcanaAurora = 'skill.lorcanaAurora',
  SkillPairTsum = 'skill.pairTsum',
  SkillNoSkill = 'skill.noSkill',

  // --- buttons ------------------------------------------------------------
  ButtonCopy = 'button.copy',
  ButtonPaste = 'button.paste',
  ButtonNow = 'button.now',
  ButtonApply = 'button.apply',
  ButtonClose = 'button.close',
  ButtonSaveFile = 'button.saveFile',
  ButtonReport = 'button.report',
  ButtonSaveReport = 'button.saveReport',

  // --- page chrome --------------------------------------------------------
  ChromeReset = 'chrome.reset',
  ChromeRestartNow = 'chrome.restartNow',
  ChromeThemeToLight = 'chrome.themeToLight',
  ChromeThemeToDark = 'chrome.themeToDark',

  // --- the share panel ----------------------------------------------------
  ShareCopied = 'share.copied',
  ShareCopyFailed = 'share.copyFailed',
  SharePasteEmpty = 'share.pasteEmpty',
  SharePastePrompt = 'share.pastePrompt',
  ShareOtherFormat = 'share.otherFormat',
  ShareNotACode = 'share.notACode',
  /** `{applied}` settings, `{from}` version suffix. */
  ShareApplied = 'share.applied',
  /** As above, plus `{skipped}`. */
  ShareAppliedSkipped = 'share.appliedSkipped',

  // --- presets ------------------------------------------------------------
  //
  // The app bar's dropdown and the panel it opens, plus the export row on the
  // General tab. The preset *names* are the user's own text and are never keys.
  /** The dropdown's label while the form is not any saved preset. */
  PresetNone = 'preset.none',
  /** The dropdown's accessible name. */
  PresetOpen = 'preset.open',
  /** The save button's accessible name, and the panel's own heading. */
  PresetManage = 'preset.manage',
  PresetNameHint = 'preset.name.hint',
  PresetSaveNew = 'preset.saveNew',
  PresetUpdate = 'preset.update',
  PresetDelete = 'preset.delete',
  /** `{name}` saved for the first time. */
  PresetSaved = 'preset.saved',
  /** `{name}` written over. */
  PresetUpdated = 'preset.updated',
  /** `{name}` removed. */
  PresetDeleted = 'preset.deleted',
  // Loading one says so by putting its name in the dropdown, which is where the
  // reader is already looking -- so there is no string for it here.
  PresetNeedsName = 'preset.needsName',
  /** `{name}` is already a preset -- Update overwrites it. */
  PresetNameTaken = 'preset.nameTaken',
  /** `{name}` is not a saved preset -- Save as new makes it one. */
  PresetUnknownName = 'preset.unknownName',
  /** No room for another; `{max}` is the limit. */
  PresetFull = 'preset.full',
  PresetStoreFailed = 'preset.storeFailed',
  PresetExportNone = 'preset.exportNone',
  PresetExportCopied = 'preset.exportCopied',
  PresetExportCopyFailed = 'preset.exportCopyFailed',
  /** Written to `{path}`. */
  PresetExportSaved = 'preset.exportSaved',
  PresetExportNoEngine = 'preset.exportNoEngine',
  /** `{error}` is whatever the engine said went wrong. */
  PresetExportFailed = 'preset.exportFailed',

  // --- the sentences this page's own log records carry ---------------------
  LogNoSettings = 'log.noSettings',
  LogLoadSettings = 'log.loadSettings',
  LogSaveSettings = 'log.saveSettings',
  LogStartCommand = 'log.startCommand',

  // --- the Run order card -------------------------------------------------
  /** `{amount}` is one of the three units below. */
  RunEvery = 'run.every',
  RunHours = 'run.hours',
  RunMinutes = 'run.minutes',
  RunSeconds = 'run.seconds',
  RunWalkthrough = 'run.walkthrough',
  RunWalkthroughDetail = 'run.walkthrough.detail',
  RunMailbox = 'run.mailbox',
  /** `{max}` mails per pass. */
  RunMailboxDetail = 'run.mailbox.detail',
  RunReceiveAll = 'run.receiveAll',
  RunSendHearts = 'run.sendHearts',
  /** Stops after `{minutes}`. */
  RunSendHeartsLimited = 'run.sendHearts.limited',
  RunSendHeartsUnlimited = 'run.sendHearts.unlimited',
  RunRestartApp = 'run.restartApp',
  RunRestartAppDetail = 'run.restartApp.detail',
  RunClickAssist = 'run.clickAssist',
  RunClickAssistDetail = 'run.clickAssist.detail',
  RunUnlockLevel = 'run.unlockLevel',
  RunBuyBoxes = 'run.buyBoxes',
  /** Which box, at what size: `{box}`, `{boxes}` at a time, up to `{max}`. */
  RunBuyBoxesDetail = 'run.buyBoxes.detail',
  RunPlayRound = 'run.playRound',
  /** Waits `{minutes}` between rounds. Prefixed to the item list, so it ends in a space. */
  RunPlayRoundDelay = 'run.playRound.delay',
  RunPlayRoundCap = 'run.playRound.cap',
  RunItemsNone = 'run.items.none',
  /** `{items}`, joined with `RunItemsSeparator`. */
  RunItemsSome = 'run.items.some',
  /** Between item names in the line above -- a comma in English, an ideographic one in Chinese. */
  RunItemsSeparator = 'run.items.separator',
  RunNoteRecording = 'run.note.recording',
  RunNoteNothingPlays = 'run.note.nothingPlays',
  RunNoteOrder = 'run.note.order',
  RunFlowTitle = 'run.flow.title',

  // --- one board scan, chip by chip ---------------------------------------
  FlowScan = 'flow.scan',
  FlowPopAll = 'flow.popAll',
  /** Chains up to `{max}` long at `{reach}`% reach. */
  FlowPlan = 'flow.plan',
  FlowMyTsumFirst = 'flow.myTsumFirst',
  /** Keep `{count}`. */
  FlowKeep = 'flow.keep',
  FlowTapSkill = 'flow.tapSkill',
  FlowLinkOneBubble = 'flow.linkOneBubble',
  FlowLinkAllBubbles = 'flow.linkAllBubbles',
  FlowLink = 'flow.link',
  FlowFan = 'flow.fan',
  FlowNoSkill = 'flow.noSkill',
  /** `{skill}` at level `{level}`. */
  FlowUseSkill = 'flow.useSkill',
  FlowLorcanaCard = 'flow.lorcanaCard',
  FlowBoardUp = 'flow.boardUp',

  // --- the Quick Bar strip ------------------------------------------------
  //
  // Named by `data-i18n` in quickbar.html rather than by a call site, so the
  // markup stays the one place the strip's layout is described.
  QbLevel = 'qb.level',
  /** The bonus toggles' own short names: the settings rows' names are longer
   *  in some languages than the chip has room for. */
  QbBonusCoin = 'qb.bonusCoin',
  QbBonus5to4 = 'qb.bonus5to4',
  QbScan = 'qb.scan',
  QbChain = 'qb.chain',
  QbPreset = 'qb.preset',
  QbBubble = 'qb.bubble',
  QbReport = 'qb.report',
  QbBase = 'qb.base',
  QbFinal = 'qb.final',
  QbRounds = 'qb.rounds',
}

/**
 * A complete catalogue: every `UiText` key, with the text for one language.
 *
 * Mapped over the enum rather than written out, so adding a key is one edit and
 * the reference catalogue below fails the build until it has a line for it.
 */
type UiStrings = { [K in UiText]: string };

/**
 * A translation: any subset of the keys.
 *
 * Partial on purpose. A language that has not caught up with a new string still
 * compiles and still ships -- `t` falls back to English for whatever is missing,
 * which is a page in two languages rather than a page with holes in it. Run
 * `npm run i18n:check` for what each language is still missing.
 *
 * A key that is *not* in `UiText` is still a build error, so a typo or a stale
 * entry cannot hide in here.
 */
type UiStringsPartial = { [K in UiText]?: string };

/** One registered language: its tag, the name it calls itself, and its text. */
interface LocaleEntry {
  tag: Locale;
  /**
   * What this language calls itself, which is what the picker shows. Not
   * translated -- a Chinese reader looking for Chinese looks for 中文, whatever
   * language the page happens to be in.
   */
  endonym: string;
  strings: UiStringsPartial;
}
