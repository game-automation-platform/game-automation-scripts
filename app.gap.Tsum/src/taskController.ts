// The cooperative scheduler: one job per pass, run to completion.

/** The rest between passes, ms. Fixed: nothing a job registers changes it. */
const TickMs = 200;

/**
 * Consecutive failures of one job that bounce the game app. Per job, so a
 * healthy round cannot mask a chore that throws every time, and a flaky chore
 * cannot spend a healthy round's credit.
 */
const TaskErrorsBeforeRestart = 5;

/**
 * The order the loop takes the jobs that are due at once: lowest priority
 * first, then the name. A total order -- every job's priority is distinct
 * (`JobPriority`, src/runPlan.ts) and names are unique -- so the pick depends
 * on the table and on nothing else, not on the order the jobs were registered
 * in and not on their intervals. The rule this replaced took a longer interval
 * over a higher priority, was not transitive, and so let the order fall to
 * object iteration: jobs started in registration order, and a Now sweep ran
 * after the first round rather than before it.
 */
function compareTasks(a: Task, b: Task): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
}

// Named `TsumTaskController` rather than `TaskController` to avoid colliding
// with the DOM lib's built-in `TaskController` (Prioritized Task Scheduling
// API) that ships in lib.dom.d.ts.
class TsumTaskController {
  tasks: { [name: string]: Task };
  isRunning: boolean;
  /** The rest between passes. `TickMs`, kept as a field for the loop's readers. */
  interval: number;
  /**
   * The job on the screen right now, or `''` between passes.
   *
   * Written for a reader outside the loop: an issue report is taken while the
   * run is paused, which means parked inside whatever job was tapping, and
   * "which chore was it in" is the first thing anyone asks of a wedge. The due
   * list cannot answer it -- that says what would run next, not what is halfway
   * through.
   */
  runningTask: string;

  constructor() {
    this.tasks = {};
    this.isRunning = false;
    this.interval = TickMs;
    this.runningTask = '';
  }

  /**
   * The jobs due at `now`, in the order the loop would take them.
   *
   * Public so `forecast.ts` orders the set the way the loop really does, and
   * the offline harness can read the pick without running it.
   */
  dueTasks(now: number): Task[] {
    const due: Task[] = [];
    for (const name in this.tasks) {
      const task = this.tasks[name];
      if (now - task.lastRunTime >= task.interval) {
        due.push(task);
      }
    }
    due.sort(compareTasks);
    return due;
  }

  /**
   * One pass of the loop: run the job that is due, if any, and say which.
   *
   * Public so the offline harness (`tools/dispatchEval/scheduler.js`) can drive
   * the real pick and bookkeeping under a fake clock. `loop()` is this plus the
   * rest between passes.
   */
  tick(): string {
    const due = this.dueTasks(Date.now());
    if (due.length === 0) {
      return "";
    }
    const task = due[0];
    this.runningTask = task.name;
    // Swallow uncaught errors so one bad job cannot kill the whole controller;
    // a run of them from the same job bounces the game app.
    try {
      task.run();
      task.errors = 0;
    } catch (e) {
      task.errors++;
      logError(Log.Task.Threw, 'Task threw', { task: task.name, errorCount: task.errors, errorText: '' + e });
      if (task.errors >= TaskErrorsBeforeRestart) {
        logWarn(Log.Task.WatchdogRestart, 'Consecutive task errors; restarting the Tsum app', { task: task.name, errorCount: task.errors });
        try { ts!.taskTsumAppRestart(); } catch (e2) { logError(Log.Task.WatchdogRestartFailed, 'Restarting the Tsum app failed', { errorText: '' + e2 }); }
        task.errors = 0;
      }
    }
    this.runningTask = '';
    task.lastRunTime = Date.now();
    task.runTimes--;
    if (task.runTimes === 0) {
      delete this.tasks[task.name];
    }
    return task.name;
  }

  loop(): void {
    logInfo(Log.Task.LoopStart, 'Task loop started', { intervalMs: this.interval });
    while (this.isRunning) {
      this.tick();
      sleep(this.interval);
    }
    this.isRunning = false;
    logInfo(Log.Task.LoopStop, 'Task loop stopped');
  }

  newTaskObject(name: string, run: () => void, interval: number | undefined, runTimes: number | undefined, priority: number): Task {
    return {
      name: name,
      run: run,
      interval: interval || 1000,
      runTimes: runTimes || 0,
      priority: priority,
      lastRunTime: 0,
      errors: 0,
      status: 0
    };
  }

  /**
   * Register a job. Effective at once: the next pass can take it.
   *
   * `runOnce` is a misnomer kept from the original: it stamps `lastRunTime`,
   * so the job waits a whole interval before its first turn. `register` below
   * is the spelling the task table uses.
   *
   * A second job at a priority another job already holds is refused, because
   * the order among due jobs is the priority and nothing else; a name already
   * registered is replaced, which is what a re-registration means.
   */
  newTask(name: string, run: () => void, interval?: number, runTimes?: number, runOnce?: boolean, priority?: number): Task | undefined {
    if (typeof run !== "function") {
      logError(Log.Task.NotAFunction, 'Task body is not a function', { task: name });
      return undefined;
    }
    const task = this.newTaskObject(name, run, interval, runTimes, priority || 0);
    for (const other in this.tasks) {
      if (other !== name && this.tasks[other].priority === task.priority) {
        throw new Error('Task ' + name + ' and task ' + other + ' share priority ' + task.priority);
      }
    }
    if (runOnce === true) {
      task.lastRunTime = Date.now();
    }
    this.tasks[name] = task;
    return task;
  }

  /** Register one job off the run's task table (`runTaskTable`, src/runPlan.ts). */
  register(spec: TaskSpec, run: () => void): Task | undefined {
    return this.newTask(spec.name, run, spec.intervalMs, 0, !spec.dueAtStart, spec.priority);
  }

  removeTask(name: string): void {
    delete this.tasks[name];
  }

  removeAllTasks(): void {
    for (const key in this.tasks) {
      delete this.tasks[key];
    }
  }

  start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.loop();
    }
  }

  stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      logInfo(Log.Task.LoopStopping, 'Waiting for the task loop to hand back');
    }
  }
}
