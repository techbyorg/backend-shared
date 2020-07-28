import uuid from 'node-uuid'
import _ from 'lodash'
// import Redis from 'ioredis'

class PubSubService {
  constructor () {
    this.publish = this.publish.bind(this)
    this.subscribe = this.subscribe.bind(this)
    this.subscriptions = {}
  }

  setup (host, port, prefix) {
    // disabled for now (not using for anything yet)
    console.log('redis pubsub disabled')
    // this.redisPub = new Redis({ host, port })
    // this.redisSub = new Redis({ host, port })

    // this.redisSub.on('message', (channelWithPrefix, message) => {
    //   const channel = channelWithPrefix.replace(`${this.prefix}:`, '')
    //   message = (() => {
    //     try {
    //       return JSON.parse(message)
    //     } catch (err) {
    //       console.log('redis json parse error', channelWithPrefix)
    //       return {}
    //     }
    //   })()
    //   return _.forEach(this.subscriptions[channel], ({ fn }) => fn(message))
    // })
  }

  publish (channels, message) {
    if (typeof channels === 'string') {
      channels = [channels]
    }

    return _.forEach(channels, channel => {
      const channelWithPrefix = `${this.prefix}:${channel}`
      return this.redisPub.publish(channelWithPrefix, JSON.stringify(message))
    })
  }

  subscribe (channel, fn) {
    const channelWithPrefix = `${this.prefix}:${channel}`

    if (!this.subscriptions[channel]) {
      this.redisSub.subscribe((channelWithPrefix))
      if (this.subscriptions[channel] == null) { this.subscriptions[channel] = {} }
    }

    const id = uuid.v4()
    this.subscriptions[channel][id] = {
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
    return this.subscriptions[channel][id]
  }
}

export default new PubSubService()
