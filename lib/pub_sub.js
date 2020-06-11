/* eslint-disable
    no-return-assign,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
import Promise from 'bluebird'
import uuid from 'node-uuid'
import _ from 'lodash'
import Redis from 'ioredis'
import config from './config'

class PubSubService {
  constructor () {
    this.publish = this.publish.bind(this)
    this.subscribe = this.subscribe.bind(this)
    this.subscriptions = {}
    this.redisPub = new Redis({
      port: config.get().REDIS.PORT,
      host: config.get().REDIS.PUB_SUB_HOST
    })
    this.redisSub = new Redis({
      port: config.get().REDIS.PORT,
      host: config.get().REDIS.PUB_SUB_HOST
    })

    this.redisSub.on('message', (channelWithPrefix, message) => {
      const channel = channelWithPrefix.replace(`${config.get().REDIS.PUB_SUB_PREFIX}:`, '')
      message = (() => {
        try {
          return JSON.parse(message)
        } catch (err) {
          console.log('redis json parse error', channelWithPrefix)
          return {}
        }
      })()
      return _.forEach(this.subscriptions[channel], ({ fn }) => fn(message))
    })
  }

  publish (channels, message) {
    if (typeof channels === 'string') {
      channels = [channels]
    }

    return _.forEach(channels, channel => {
      const channelWithPrefix = `${config.get().REDIS.PUB_SUB_PREFIX}:${channel}`
      return this.redisPub.publish(channelWithPrefix, JSON.stringify(message))
    })
  }

  subscribe (channel, fn) {
    const channelWithPrefix = `${config.get().REDIS.PUB_SUB_PREFIX}:${channel}`

    if (!this.subscriptions[channel]) {
      this.redisSub.subscribe((channelWithPrefix))
      if (this.subscriptions[channel] == null) { this.subscriptions[channel] = {} }
    }

    const id = uuid.v4()
    return this.subscriptions[channel][id] = {
      fn,
      unsubscribe: () => {
        if (this.subscriptions[channel]) {
          delete this.subscriptions[channel][id]
        }
        const count = _.keys(this.subscriptions[channel]).length
        if (!count) {
          this.redisSub.unsubscribe(channelWithPrefix)
          return delete this.subscriptions[channel]
        }
      }
    }
  }
}

export default new PubSubService()
