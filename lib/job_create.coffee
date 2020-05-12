_ = require 'lodash'
Promise = require 'bluebird'

DEFAULT_PRIORITY = 0
DEFAULT_TTL_MS = 60 * 1000 * 9 # 9 minutes

class JobCreateService
  clean: ({types, minStuckTimeMs} = {}) ->
    types ?= ['active', 'failed', 'complete', 'wait', 'active']
    Promise.map types, (type) ->
      new Promise (resolve, reject) ->
        jobQueue.clean 5000, type

  # if we need a "synchronous" process across all instances
  # ie. run each job one at a time, we can use something like
  # https://github.com/deugene/oraq
  # see https://github.com/OptimalBits/bull/issues/457
  createJob: (options) =>
    {job, priority, ttlMs, delayMs, type,
      maxAttempts, backoff, waitForCompletion} = options

    unless type?
      throw new Error 'Must specify a valid job type'

    priority ?= DEFAULT_PRIORITY
    ttlMs ?= DEFAULT_TTL_MS
    delayMs ?= 0
    jobOptions = {
      priority, timeout: ttlMs, removeOnComplete: true
    }
    if delayMs
      jobOptions.delayMs = delayMs
    if maxAttempts
      jobOptions.attempts = maxAttempts
    if backoff
      jobOptions.backoff = backoff

    queue.add type, job, jobOptions
    .then (job) ->
      if not waitForCompletion
        null
      else
        job.finished()

module.exports = new JobCreateService()
