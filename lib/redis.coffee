Redis = require 'ioredis'
_ = require 'lodash'

config = require './config'

client = new Redis {
  port: config.get().REDIS.PORT
  host: config.get().REDIS.CACHE_HOST
}

events = ['connect', 'ready', 'error', 'close', 'reconnecting', 'end']
_.map events, (event) ->
  client.on event, ->
    console.log "redislog #{event}", config.get().REDIS.CACHE_HOST

module.exports = client
