// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import Redis from 'ioredis'
import _ from 'lodash'
import config from './config'

const client = new Redis({
  port: config.get().REDIS.PORT,
  host: config.get().REDIS.CACHE_HOST
})

const events = ['connect', 'ready', 'error', 'close', 'reconnecting', 'end']
_.map(events, event => client.on(event, () => console.log(`redislog ${event}`, config.get().REDIS.CACHE_HOST)))

export default client