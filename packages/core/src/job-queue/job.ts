import { JobState } from '@vendure/common/lib/generated-types';
import { ID } from '@vendure/common/lib/shared-types';

import { JobConfig, JobData } from './types';

/**
 * @description
 * An event raised by a Job.
 *
 * @docsCategory JobQueue
 * @docsPage Job
 */
export type JobEventType = 'start' | 'complete' | 'fail';

/**
 * @description
 * The signature of the event handler expected by the `Job.on()` method.
 *
 * @docsCategory JobQueue
 * @docsPage Job
 */
export type JobEventListener<T extends JobData<T>> = (job: Job<T>) => void;

/**
 * @description
 * A Job represents a piece of work to be run in the background, i.e. outside the request-response cycle.
 * It is intended to be used for long-running work triggered by API requests. Jobs should now generally
 * be directly instantiated. Rather, the {@link JobQueue} `add()` method should be used to create and
 * add a new Job to a queue.
 *
 * @docsCategory JobQueue
 * @docsPage Job
 */
export class Job<T extends JobData<T> = any> {
    readonly id: ID | null;
    readonly queueName: string;
    readonly retries: number;
    readonly createdAt: Date;
    private readonly _data: T;
    private _state: JobState;
    private _progress: number;
    private _result?: any;
    private _error?: any;
    private _attempts: number;
    private _startedAt?: Date;
    private _settledAt?: Date;
    private readonly eventListeners: { [type in JobEventType]: Array<JobEventListener<T>> } = {
        start: [],
        complete: [],
        fail: [],
    };

    get name(): string {
        return this.queueName;
    }

    get data(): T {
        return this._data;
    }

    get state(): JobState {
        return this._state;
    }

    get progress(): number {
        return this._progress;
    }

    get result(): any {
        return this._result;
    }

    get error(): any {
        return this._error;
    }

    get isSettled(): boolean {
        return !!this._settledAt;
    }

    get startedAt(): Date | undefined {
        return this._startedAt;
    }

    get settledAt(): Date | undefined {
        return this._settledAt;
    }

    get duration(): number {
        const end = this._settledAt || new Date();
        return +end - +(this._startedAt || end);
    }

    get attempts(): number {
        return this._attempts;
    }

    constructor(config: JobConfig<T>) {
        this.queueName = config.queueName;
        this._data = config.data;
        this.id = config.id || null;
        this._state = config.state || JobState.PENDING;
        this.retries = config.retries || 0;
        this._attempts = config.attempts || 0;
        this._progress = config.progress || 0;
        this.createdAt = config.createdAt || new Date();
        this._result = config.result;
        this._error = config.error;
        this._startedAt = config.startedAt;
        this._settledAt = config.settledAt;
    }

    /**
     * @description
     * Calling this signifies that the job work has started. This method should be
     * called in the {@link JobQueueStrategy} `next()` method.
     */
    start() {
        if (this._state === JobState.PENDING || this._state === JobState.RETRYING) {
            this._state = JobState.RUNNING;
            this._startedAt = new Date();
            this._attempts++;
            this.fireEvent('start');
        }
    }

    /**
     * @description
     * Sets the progress (0 - 100) of the job.
     */
    setProgress(percent: number) {
        this._progress = Math.min(percent, 100);
    }

    /**
     * @description
     * Calling this method signifies that the job succeeded. The result
     * will be stored in the `Job.result` property.
     */
    complete(result?: any) {
        this._result = result;
        this._progress = 100;
        this._state = JobState.COMPLETED;
        this._settledAt = new Date();
        this.fireEvent('complete');
    }

    /**
     * @description
     * Calling this method signifies that the job failed.
     */
    fail(err?: any) {
        this._error = err?.message ? err.message : String(err);
        this._progress = 0;
        if (this.retries >= this._attempts) {
            this._state = JobState.RETRYING;
        } else {
            this._state = JobState.FAILED;
            this._settledAt = new Date();
        }
        this.fireEvent('fail');
    }

    /**
     * @description
     * Sets a RUNNING job back to PENDING. Should be used when the JobQueue is being
     * destroyed before the job has been completed.
     */
    defer() {
        if (this._state === JobState.RUNNING) {
            this._state = JobState.PENDING;
            this._attempts = 0;
        }
    }

    /**
     * @description
     * Used to register event handlers for job events
     */
    on(eventType: JobEventType, listener: JobEventListener<T>) {
        this.eventListeners[eventType].push(listener);
    }

    private fireEvent(eventType: JobEventType) {
        for (const listener of this.eventListeners[eventType]) {
            listener(this);
        }
    }
}
