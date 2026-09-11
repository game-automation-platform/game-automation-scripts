// The run's task table, written once.
//
// Two things used to describe the same set of jobs: `buildRun` (src/index.ts)
// registered them, and the settings page's Run order card (`runOrderSteps`,
// src/settings.ts) listed them -- by hand, with nothing keeping the two in step.
// This file is in **both** compilations (tsconfig.json and tsconfig.settings.json,
// the way src/skillOptions.ts is), so there is one table: the script registers
// what it says, and the page describes what it says.
//
// Names, priorities and intervals only. Which method a name binds to is
// `taskBody` in src/index.ts; what a name is called on the page is
// `runOrderSteps`. Both switch on `TaskName`, so a job added here without a
// body or a label is a build error rather than a silent omission.

/** Every job the loop can run, by the name it is registered under. */
const enum TaskName {
  Walkthrough = 'taskWalkthrough',
  ReceiveOneItem = 'receiveOneItem',
  ReceiveAllItems = 'receiveItems',
  SendHearts = 'sendHearts',
  AppRestart = 'taskTsumAppRestart',
  ClickAssist = 'taskClickAssist',
  UnlockLevel = 'autoUnlockLevel',
  BuyBoxes = 'buyBoxes',
  PlayRound = 'taskPlayGameQuick',
}

/**
 * The order the loop takes the jobs that are due at once: lower first.
 *
 * Distinct per job, so the order is this table's and nothing else's -- not the
 * intervals, not the order of registration (`compareTasks`, taskController.ts
 * refuses two jobs at one priority). The one-shot sweeps a Now button queues go
 * first; the app restart next, so the chores after it run on a fresh app; the
 * two coin-spending sweeps; the mailbox and hearts; and the round last, since
 * it is the job that never finishes early. The three at the bottom share a
 * number because a run registers at most one of them.
 */
const enum JobPriority {
  UnlockNow = 10,
  BuyBoxesNow = 11,
  AppRestart = 20,
  UnlockLevel = 30,
  BuyBoxes = 31,
  ReceiveOneItem = 40,
  ReceiveAllItems = 41,
  SendHearts = 42,
  PlayRound = 90,
  ClickAssist = 90,
  Walkthrough = 90,
}

/** One job, as the scheduler is told about it. */
interface TaskSpec {
  name: TaskName;
  priority: JobPriority;
  intervalMs: number;
  /** Due at the loop's first pass, or only after a whole interval has gone. */
  dueAtStart: boolean;
}

/**
 * The settings as either side holds them: the script has a `Settings`, the
 * page a loose map of what its controls hold. Both read through this.
 */
type RunSettings = { [K in SettingKey]?: boolean | number | string };

/**
 * The jobs a run registers.
 *
 * The walkthrough recorder is a mode rather than a job: it watches a person
 * play, so nothing else may touch the screen, and returning it alone is what
 * enforces that. Click Assist and auto-play are exclusive the same way.
 */
function runTaskTable(settings: RunSettings): TaskSpec[] {
  const on = function(key: SettingKey): boolean {
    return settings[key] === true;
  };
  const num = function(key: SettingKey): number {
    const value = settings[key];
    if (typeof value === 'number') {
      return value;
    }
    return typeof value === 'string' ? (+value || 0) : 0;
  };
  const minutes = 60 * 1000;
  const hours = 60 * minutes;
  const jobs: TaskSpec[] = [];

  if (on(SettingKey.Walkthrough)) {
    jobs.push({ name: TaskName.Walkthrough, priority: JobPriority.Walkthrough,
      intervalMs: 1000, dueAtStart: true });
    return jobs;
  }
  if (on(SettingKey.ReceiveHeartsOneByOne)) {
    jobs.push({ name: TaskName.ReceiveOneItem, priority: JobPriority.ReceiveOneItem,
      intervalMs: num(SettingKey.MailMinWait) * minutes, dueAtStart: true });
  }
  if (on(SettingKey.ReceiveAllHearts)) {
    jobs.push({ name: TaskName.ReceiveAllItems, priority: JobPriority.ReceiveAllItems,
      intervalMs: num(SettingKey.ReceiveAllHeartsMinWait) * minutes, dueAtStart: true });
  }
  if (on(SettingKey.SendHeartsAuto)) {
    jobs.push({ name: TaskName.SendHearts, priority: JobPriority.SendHearts,
      intervalMs: num(SettingKey.SendHeartsMinWait) * minutes, dueAtStart: true });
  }
  if (on(SettingKey.AutoLaunchApp) && num(SettingKey.TsumAppRestartFrequency) > 0) {
    // The one job that waits a whole interval first: the app was just started.
    jobs.push({ name: TaskName.AppRestart, priority: JobPriority.AppRestart,
      intervalMs: num(SettingKey.TsumAppRestartFrequency) * hours, dueAtStart: false });
  }
  if (on(SettingKey.ClickAssist)) {
    jobs.push({ name: TaskName.ClickAssist, priority: JobPriority.ClickAssist,
      intervalMs: 3000, dueAtStart: true });
  } else if (on(SettingKey.AutoPlayGame)) {
    // A sweep the Now button already queued is not due at start as well: the
    // schedule then counts from that sweep rather than running a second one
    // behind it.
    if (num(SettingKey.UnlockLevelHoursWait) > 0) {
      jobs.push({ name: TaskName.UnlockLevel, priority: JobPriority.UnlockLevel,
        intervalMs: num(SettingKey.UnlockLevelHoursWait) * hours,
        dueAtStart: !on(SettingKey.UnlockLevelsFirst) });
    }
    if (num(SettingKey.BuyBoxHoursWait) > 0) {
      jobs.push({ name: TaskName.BuyBoxes, priority: JobPriority.BuyBoxes,
        intervalMs: num(SettingKey.BuyBoxHoursWait) * hours,
        dueAtStart: !on(SettingKey.BuyBoxesFirst) });
    }
    jobs.push({ name: TaskName.PlayRound, priority: JobPriority.PlayRound,
      intervalMs: 3000, dueAtStart: true });
  }
  return jobs;
}
