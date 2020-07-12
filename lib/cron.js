import cron from 'cron'
import _ from 'lodash'

import CacheService from './cache.js'

const { CronJob } = cron

const THIRTY_SECONDS = 30

export default class Cron {
  constructor () {
    this.addCron = this.addCron.bind(this)
    this.start = this.start.bind(this)
    this.crons = []
  }
  // Promise.map allOrganizations, (organization) ->
  //   Organization.upsert _.cloneDeep organization

  addCron (key, time, fn) {
    return this.crons.push(new CronJob({
      cronTime: time,
      onTick () {
        return CacheService.lock(key, fn, {
          // if server times get offset by >= 30 seconds, crons get run twice...
          // so this is not guaranteed to run just once
          expireSeconds: THIRTY_SECONDS
        })
      },
      start: false,
      timeZone: 'America/Los_Angeles'
    }))
  }

  start () {
    return _.map(this.crons, cron => cron.start())
  }
}
