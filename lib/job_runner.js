// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import _ from 'lodash'

class JobRunnerService {
  listen (queues) {
    return _.forEach(queues, ({ types, queue }) => _.forEach(types, ({ fn, concurrencyPerCpu }, type) => queue.process(type, concurrencyPerCpu, function (job) {
      try {
        return fn(job.data)
          .catch(function (err) {
            console.log('queue err', err)
            throw err
          })
      } catch (error) {
        const err = error
        console.log('queue err', err)
        throw err
      }
    })))
  }
}

export default new JobRunnerService()
