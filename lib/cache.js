Redlock = require 'redlock'
Promise = require 'bluebird'

RedisService = require './redis'
PubSub = require './pub_sub'
config = require './config'

if config.get().REDIS.PERSISTENT_HOST
  RedisPersistentService = require './redis_persistent'

DEFAULT_CACHE_EXPIRE_SECONDS = 3600 * 24 * 30 # 30 days
DEFAULT_LOCK_EXPIRE_SECONDS = 3600 * 24 * 40000 # 100+ years
ONE_HOUR_SECONDS = 3600
ONE_MINUTE_SECONDS = 60
PREFER_CACHE_PUB_SUB_TIMEOUT_MS = 30 * 1000


class CacheService
  constructor: ->
    @redlock = new Redlock [RedisService], {
      driftFactor: 0.01
      retryCount: 0
      # retryDelay:  200
    }

  tempSetAdd: (key, value) ->
    key = config.get().REDIS.PREFIX + ':' + key
    RedisService.sadd key, value

  tempSetRemove: (key, value) ->
    key = config.get().REDIS.PREFIX + ':' + key
    RedisService.srem key, value

  tempSetGetAll: (key) ->
    key = config.get().REDIS.PREFIX + ':' + key
    RedisService.smembers key

  setAdd: (key, value) ->
    key = config.REDIS.PREFIX + ':' + key
    RedisPersistentService.sadd key, value

  setRemove: (key, value) ->
    key = config.REDIS.PREFIX + ':' + key
    RedisPersistentService.srem key, value

  setGetAll: (key) ->
    key = config.REDIS.PREFIX + ':' + key
    RedisPersistentService.smembers key

  leaderboardUpdate: (setKey, member, score) ->
    key = config.REDIS.PREFIX + ':' + setKey
    RedisPersistentService.zadd key, score, member

  leaderboardDelete: (setKey, member) ->
    key = config.REDIS.PREFIX + ':' + setKey
    RedisPersistentService.zrem key, member

  leaderboardIncrement: (setKey, member, increment, {currentValueFn} = {}) =>
    key = config.REDIS.PREFIX + ':' + setKey
    newValue = await RedisPersistentService.zincrby key, increment, member

    # didn't exist before, sync their xp just in case
    if currentValueFn and "#{newValue}" is "#{increment}"
      currentValueFn()
      .then (currentValue) =>
        if currentValue and "#{currentValue}" isnt "#{newValue}"
          @leaderboardUpdate setKey, member, currentValue
      null # don't block

    newValue

  leaderboardGet: (key, {limit, skip} = {}) ->
    skip ?= 0
    limit ?= 50
    key = config.REDIS.PREFIX + ':' + key
    RedisPersistentService.zrevrange key, skip, skip + limit - 1, 'WITHSCORES'

  leaderboardTrim: (key, trimLength = 10000) ->
    key = config.REDIS.PREFIX + ':' + key
    RedisPersistentService.zremrangebyrank key, 0, -1 * (trimLength + 1)

  set: (key, value, {expireSeconds} = {}) ->
    key = config.get().REDIS.PREFIX + ':' + key
    RedisService.set key, JSON.stringify value
    .then ->
      if expireSeconds
        RedisService.expire key, expireSeconds

  get: (key) ->
    key = config.get().REDIS.PREFIX + ':' + key
    RedisService.get key
    .then (value) ->
      try
        JSON.parse value
      catch err
        value

  getCursor: (cursor) =>
    key = "#{PREFIXES.CURSOR}:#{cursor}"
    @get key

  setCursor: (cursor, value) =>
    key = "#{PREFIXES.CURSOR}:#{cursor}"
    @set key, value, {expireSeconds: ONE_HOUR_SECONDS}

  lock: (key, fn, {expireSeconds, unlockWhenCompleted, throwOnLocked} = {}) =>
    key = config.get().REDIS.PREFIX + ':' + key
    expireSeconds ?= DEFAULT_LOCK_EXPIRE_SECONDS
    @redlock.lock key, expireSeconds * 1000
    .then (lock) ->
      fnResult = fn(lock)
      if not fnResult?.then
        return fnResult
      else
        fnResult.then (result) ->
          if unlockWhenCompleted
            lock.unlock()
          result
        .catch (err) ->
          lock.unlock()
          throw {fnError: err}
    .catch (err) ->
      if err.fnError
        throw err.fnError
      else if throwOnLocked
        throw {isLocked: true}
      # don't pass back other (redlock) errors

  addCacheKeyToCategory: (key, category) =>
    categoryKey = 'category:' + category
    @tempSetAdd categoryKey, key

  # run fn that returns promise and cache result
  # if many request before result is ready, then all subscribe/wait for result
  # if we want to reduce load / network on pubsub, we could have it be
  # an option to use pubsub
  preferCache: (key, fn, {expireSeconds, ignoreNull, category} = {}) =>
    unless key
      console.log 'missing cache key'
    rawKey = key
    key = config.get().REDIS.PREFIX + ':' + key
    expireSeconds ?= DEFAULT_CACHE_EXPIRE_SECONDS

    if category
      @addCacheKeyToCategory rawKey, category

    RedisService.get key
    .then (value) =>
      if value?
        try
          return JSON.parse value
        catch err
          console.log 'error parsing', key, value
          return null

      pubSubChannel = "#{key}:pubsub"

      @lock "#{key}:run_lock", ->
        try
          fn().then (value) ->
            unless rawKey
              console.log 'missing cache key value', value
            if (value isnt null and value isnt undefined) or not ignoreNull
              RedisService.set key, JSON.stringify value
              .then ->
                RedisService.expire key, expireSeconds
            setTimeout ->
              PubSub.publish [pubSubChannel], value
            , 100 # account for however long it takes for other instances to acquire / check lock / subscribe
            return value
        catch err
          console.log err
          throw err
      , {
        unlockWhenCompleted: true, expireSeconds: ONE_MINUTE_SECONDS
        throwOnLocked: true
      }
      .catch (err) ->
        if err?.isLocked
          new Promise (resolve) ->
            subscription = PubSub.subscribe pubSubChannel, (value) ->
              subscription?.unsubscribe?()
              clearTimeout unsubscribeTimeout
              resolve value
            unsubscribeTimeout = setTimeout ->
              subscription?.unsubscribe?()
            , PREFER_CACHE_PUB_SUB_TIMEOUT_MS

        else
          throw err

  deleteByCategory: (category) =>
    categoryKey = 'category:' + category
    @tempSetGetAll categoryKey
    .then (categoryKeys) =>
      Promise.map categoryKeys, @deleteByKey
    .then =>
      @deleteByKey categoryKey

  deleteByKey: (key) ->
    key = config.get().REDIS.PREFIX + ':' + key
    RedisService.del key

module.exports = new CacheService()
