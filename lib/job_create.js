/* eslint-disable
    no-undef,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
import _ from 'lodash'
import Promise from 'bluebird'

const DEFAULT_PRIORITY = 0
const DEFAULT_TTL_MS = 60 * 1000 * 9 // 9 minutes

class JobCreateService {
  constructor () {
    this.createJob = this.createJob.bind(this)
  }

  clean ({ types, minStuckTimeMs } = {}) {
    if (types == null) { types = ['active', 'failed', 'complete', 'wait', 'active'] }
    return Promise.map(types, type => new Promise((resolve, reject) => jobQueue.clean(5000, type)))
  }

  // if we need a "synchronous" process across all instances
  // ie. run each job one at a time, we can use something like
  // https://github.com/deugene/oraq
  // see https://github.com/OptimalBits/bull/issues/457
  createJob (options) {
    let {
      queue, job, priority, ttlMs, delayMs, type,
      maxAttempts, backoff, waitForCompletion
    } = options

    if (type == null) {
      throw new Error('Must specify a valid job type')
    }

    if (priority == null) { priority = DEFAULT_PRIORITY }
    if (ttlMs == null) { ttlMs = DEFAULT_TTL_MS }
    if (delayMs == null) { delayMs = 0 }
    const jobOptions = {
      priority, timeout: ttlMs, removeOnComplete: true
    }
    if (delayMs) {
      jobOptions.delayMs = delayMs
    }
    if (maxAttempts) {
      jobOptions.attempts = maxAttempts
    }
    if (backoff) {
      jobOptions.backoff = backoff
    }

    return queue.add(type, job, jobOptions)
      .then(function (job) {
        if (!waitForCompletion) {
          return null
        } else {
          return job.finished()
        }
      })
  }
}

export default new JobCreateService()
