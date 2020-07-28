import Redlock from 'redlock'
import Promise from 'bluebird'
import Redis from 'ioredis'
import autoBind from 'auto-bind'
import _ from 'lodash'

import PubSub from './pub_sub.js'

const DEFAULT_CACHE_EXPIRE_SECONDS = 3600 * 24 * 30 // 30 days
const DEFAULT_LOCK_EXPIRE_SECONDS = 3600 * 24 * 40000 // 100+ years
const ONE_MINUTE_SECONDS = 60
const PREFER_CACHE_PUB_SUB_TIMEOUT_MS = 30 * 1000

function connectRedis (host, port) {
  const client = new Redis({
    host: host,
    port: port
  })

  const events = ['connect', 'ready', 'error', 'close', 'reconnecting', 'end']
  _.map(events, (event) => {
    client.on(event, () => {
      return console.log(`redislog ${host}, ${event}`)
    })
  })

  return client
}

class CacheService {
  constructor () {
    autoBind(this)
    this.prefix = 'defaultPrefix'
  }

  setup ({ prefix, port, persistentHost, cacheHost }) {
    this.prefix = prefix
    this.cacheRedis = connectRedis(cacheHost, port)
    // disabled for now (not using for anything yet)
    console.log('redis persistent disabled')
    // this.persistentRedis = connectRedis(persistentHost, port)

    this.redlock = new Redlock([this.cacheRedis], {
      driftFactor: 0.01,
      retryCount: 0
      // retryDelay:  200
    })
  }

  tempSetAdd (key, value) {
    key = this.prefix + ':' + key
    return this.cacheRedis.sadd(key, value)
  }

  tempSetRemove (key, value) {
    key = this.prefix + ':' + key
    return this.cacheRedis.srem(key, value)
  }

  tempSetGetAll (key) {
    key = this.prefix + ':' + key
    return this.cacheRedis.smembers(key)
  }

  setAdd (key, value) {
    key = this.prefix + ':' + key
    return this.persistentRedis.sadd(key, value)
  }

  setRemove (key, value) {
    key = this.prefix + ':' + key
    return this.persistentRedis.srem(key, value)
  }

  setGetAll (key) {
    key = this.prefix + ':' + key
    return this.persistentRedis.smembers(key)
  }

  leaderboardUpdate (setKey, member, score) {
    const key = this.prefix + ':' + setKey
    return this.persistentRedis.zadd(key, score, member)
  }

  leaderboardDelete (setKey, member) {
    const key = this.prefix + ':' + setKey
    return this.persistentRedis.zrem(key, member)
  }

  async leaderboardIncrement (setKey, member, increment, { currentValueFn } = {}) {
    const key = this.prefix + ':' + setKey
    const newValue = await this.persistentRedis.zincrby(key, increment, member)

    // didn't exist before, sync their xp just in case
    if (currentValueFn && (`${newValue}` === `${increment}`)) {
      currentValueFn()
        .then(currentValue => {
          if (currentValue && (`${currentValue}` !== `${newValue}`)) {
            return this.leaderboardUpdate(setKey, member, currentValue)
          }
        })
    }

    return newValue
  };

  leaderboardGet (key, { limit, skip } = {}) {
    if (skip == null) { skip = 0 }
    if (limit == null) { limit = 50 }
    key = this.prefix + ':' + key
    return this.persistentRedis.zrevrange(key, skip, (skip + limit) - 1, 'WITHSCORES')
  }

  leaderboardTrim (key, trimLength = 10000) {
    key = this.prefix + ':' + key
    return this.persistentRedis.zremrangebyrank(key, 0, -1 * (trimLength + 1))
  }

  set (key, value, { expireSeconds } = {}) {
    key = this.prefix + ':' + key
    return this.cacheRedis.set(key, JSON.stringify(value))
      .then(function () {
        if (expireSeconds) {
          return this.cacheRedis.expire(key, expireSeconds)
        }
      })
  }

  get (key) {
    key = this.prefix + ':' + key
    return this.cacheRedis.get(key)
      .then(function (value) {
        try {
          return JSON.parse(value)
        } catch (err) {
          return value
        }
      })
  }

  // FIXME: PREFIXES aren't in this file
  // getCursor (cursor) {
  //   const key = `${PREFIXES.CURSOR}:${cursor}`
  //   return this.get(key)
  // }

  // setCursor (cursor, value) {
  //   const key = `${PREFIXES.CURSOR}:${cursor}`
  //   return this.set(key, value, { expireSeconds: ONE_HOUR_SECONDS })
  // }

  async lock (key, fn, options = {}) {
    const { expireSeconds = DEFAULT_LOCK_EXPIRE_SECONDS, unlockWhenCompleted, throwOnLocked } = options
    key = this.prefix + ':' + key
    try {
      const lock = await this.redlock.lock(key, expireSeconds * 1000)
      const fnResult = fn(lock)
      if (!fnResult?.then) {
        return fnResult
      }
      try {
        const result = await fnResult
        if (unlockWhenCompleted) {
          lock.unlock()
        }
        return result
      } catch (err) {
        lock.unlock()
        err.isFnError = true
        throw err
      }
    } catch (err) {
      if (err.isFnError) {
        throw err.isFnError
      } else if (throwOnLocked) {
        err.isLocked = true
        throw err
      }
    }
  }
  // don't pass back other (redlock) errors

  addCacheKeyToCategory (key, category) {
    const categoryKey = 'category:' + category
    return this.tempSetAdd(categoryKey, key)
  }

  // run fn that returns promise and cache result
  // if many request before result is ready, then all subscribe/wait for result
  // if we want to reduce load / network on pubsub, we could have it be
  // an option to use pubsub
  preferCache (key, fn, { expireSeconds, ignoreNull, category } = {}) {
    if (!key) {
      console.log('missing cache key')
    }
    const rawKey = key
    key = this.prefix + ':' + key
    if (expireSeconds == null) { expireSeconds = DEFAULT_CACHE_EXPIRE_SECONDS }

    if (category) {
      this.addCacheKeyToCategory(rawKey, category)
    }

    return this.cacheRedis.get(key)
      .then(value => {
        if (value != null) {
          try {
            return JSON.parse(value)
          } catch (error) {
            console.log('error parsing', key, value)
            return null
          }
        }

        const pubSubChannel = `${key}:pubsub`

        return this.lock(`${key}:run_lock`, function () {
          try {
            return fn().then(function (value) {
              if (!rawKey) {
                console.log('missing cache key value', value)
              }
              if (((value !== null) && (value !== undefined)) || !ignoreNull) {
                this.cacheRedis.set(key, JSON.stringify(value))
                  .then(() => this.cacheRedis.expire(key, expireSeconds))
              }
              setTimeout(() => PubSub.publish([pubSubChannel], value)
                , 100) // account for however long it takes for other instances to acquire / check lock / subscribe
              return value
            })
          } catch (err) {
            console.log(err)
            throw err
          }
        }
        , {
          unlockWhenCompleted: true,
          expireSeconds: ONE_MINUTE_SECONDS,
          throwOnLocked: true
        })
          .catch(function (err) {
            if (err?.isLocked) {
              return new Promise((resolve) => {
                const subscription = PubSub.subscribe(pubSubChannel, (value) => {
                  subscription && subscription.unsubscribe()
                  clearTimeout(unsubscribeTimeout)
                  resolve(value)
                })
                const unsubscribeTimeout = setTimeout(() => {
                  subscription && subscription.unsubscribe()
                }, PREFER_CACHE_PUB_SUB_TIMEOUT_MS)
              })
            } else {
              throw err
            }
          })
      })
  }

  deleteByCategory (category) {
    const categoryKey = 'category:' + category
    return this.tempSetGetAll(categoryKey)
      .then(categoryKeys => {
        return Promise.map(categoryKeys, this.deleteByKey)
      }).then(() => {
        return this.deleteByKey(categoryKey)
      })
  }

  deleteByKey (key) {
    key = this.prefix + ':' + key
    return this.cacheRedis.del(key)
  }
}

export default new CacheService()
