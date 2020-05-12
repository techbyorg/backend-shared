_ = require 'lodash'

class JobRunnerService
  listen: (queues) ->
    _.forEach queues, ({types, queue}) ->
      _.forEach types, ({fn, concurrencyPerCpu}, type) ->
        queue.process type, concurrencyPerCpu, (job) ->
          try
            fn job.data
            .catch (err) ->
              console.log 'queue err', err
              throw err
          catch err
            console.log 'queue err', err
            throw err

module.exports = new JobRunnerService()
