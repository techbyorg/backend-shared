let RedisPersistentService;
import Redlock from 'redlock';
import Promise from 'bluebird';
import RedisService from './redis';
import PubSub from './pub_sub';
import config from './config';

if (config.get().REDIS.PERSISTENT_HOST) {
  RedisPersistentService = require('./redis_persistent');
}

const DEFAULT_CACHE_EXPIRE_SECONDS = 3600 * 24 * 30; // 30 days
const DEFAULT_LOCK_EXPIRE_SECONDS = 3600 * 24 * 40000; // 100+ years
const ONE_HOUR_SECONDS = 3600;
const ONE_MINUTE_SECONDS = 60;
const PREFER_CACHE_PUB_SUB_TIMEOUT_MS = 30 * 1000;


class CacheService {
  constructor() {
    this.getCursor = this.getCursor.bind(this);
    this.setCursor = this.setCursor.bind(this);
    this.lock = this.lock.bind(this);
    this.addCacheKeyToCategory = this.addCacheKeyToCategory.bind(this);
    this.preferCache = this.preferCache.bind(this);
    this.deleteByCategory = this.deleteByCategory.bind(this);
    this.redlock = new Redlock([RedisService], {
      driftFactor: 0.01,
      retryCount: 0
      // retryDelay:  200
    });
  }

  tempSetAdd(key, value) {
    key = config.get().REDIS.PREFIX + ':' + key;
    return RedisService.sadd(key, value);
  }

  tempSetRemove(key, value) {
    key = config.get().REDIS.PREFIX + ':' + key;
    return RedisService.srem(key, value);
  }

  tempSetGetAll(key) {
    key = config.get().REDIS.PREFIX + ':' + key;
    return RedisService.smembers(key);
  }

  setAdd(key, value) {
    key = config.REDIS.PREFIX + ':' + key;
    return RedisPersistentService.sadd(key, value);
  }

  setRemove(key, value) {
    key = config.REDIS.PREFIX + ':' + key;
    return RedisPersistentService.srem(key, value);
  }

  setGetAll(key) {
    key = config.REDIS.PREFIX + ':' + key;
    return RedisPersistentService.smembers(key);
  }

  leaderboardUpdate(setKey, member, score) {
    const key = config.REDIS.PREFIX + ':' + setKey;
    return RedisPersistentService.zadd(key, score, member);
  }

  leaderboardDelete(setKey, member) {
    const key = config.REDIS.PREFIX + ':' + setKey;
    return RedisPersistentService.zrem(key, member);
  }

  leaderboardIncrement = async (setKey, member, increment, {currentValueFn} = {}) => {
    const key = config.REDIS.PREFIX + ':' + setKey;
    const newValue = await RedisPersistentService.zincrby(key, increment, member);

    // didn't exist before, sync their xp just in case
    if (currentValueFn && (`${newValue}` === `${increment}`)) {
      currentValueFn()
      .then(currentValue => {
        if (currentValue && (`${currentValue}` !== `${newValue}`)) {
          return this.leaderboardUpdate(setKey, member, currentValue);
        }
      });
      null; // don't block
    }

    return newValue;
  };

  leaderboardGet(key, {limit, skip} = {}) {
    if (skip == null) { skip = 0; }
    if (limit == null) { limit = 50; }
    key = config.REDIS.PREFIX + ':' + key;
    return RedisPersistentService.zrevrange(key, skip, (skip + limit) - 1, 'WITHSCORES');
  }

  leaderboardTrim(key, trimLength = 10000) {
    key = config.REDIS.PREFIX + ':' + key;
    return RedisPersistentService.zremrangebyrank(key, 0, -1 * (trimLength + 1));
  }

  set(key, value, {expireSeconds} = {}) {
    key = config.get().REDIS.PREFIX + ':' + key;
    return RedisService.set(key, JSON.stringify(value))
    .then(function() {
      if (expireSeconds) {
        return RedisService.expire(key, expireSeconds);
      }
    });
  }

  get(key) {
    key = config.get().REDIS.PREFIX + ':' + key;
    return RedisService.get(key)
    .then(function(value) {
      try {
        return JSON.parse(value);
      } catch (err) {
        return value;
      }
    });
  }

  getCursor(cursor) {
    const key = `${PREFIXES.CURSOR}:${cursor}`;
    return this.get(key);
  }

  setCursor(cursor, value) {
    const key = `${PREFIXES.CURSOR}:${cursor}`;
    return this.set(key, value, {expireSeconds: ONE_HOUR_SECONDS});
  }

  lock(key, fn, {expireSeconds, unlockWhenCompleted, throwOnLocked} = {}) {
    key = config.get().REDIS.PREFIX + ':' + key;
    if (expireSeconds == null) { expireSeconds = DEFAULT_LOCK_EXPIRE_SECONDS; }
    return this.redlock.lock(key, expireSeconds * 1000)
    .then(function(lock) {
      const fnResult = fn(lock);
      if (!fnResult?.then) {
        return fnResult;
      } else {
        return fnResult.then(function(result) {
          if (unlockWhenCompleted) {
            lock.unlock();
          }
          return result;}).catch(function(err) {
          lock.unlock();
          throw {fnError: err};});
      }})
    .catch(function(err) {
      if (err.fnError) {
        throw err.fnError;
      } else if (throwOnLocked) {
        throw {isLocked: true};
      }});
  }
      // don't pass back other (redlock) errors

  addCacheKeyToCategory(key, category) {
    const categoryKey = 'category:' + category;
    return this.tempSetAdd(categoryKey, key);
  }

  // run fn that returns promise and cache result
  // if many request before result is ready, then all subscribe/wait for result
  // if we want to reduce load / network on pubsub, we could have it be
  // an option to use pubsub
  preferCache(key, fn, {expireSeconds, ignoreNull, category} = {}) {
    if (!key) {
      console.log('missing cache key');
    }
    const rawKey = key;
    key = config.get().REDIS.PREFIX + ':' + key;
    if (expireSeconds == null) { expireSeconds = DEFAULT_CACHE_EXPIRE_SECONDS; }

    if (category) {
      this.addCacheKeyToCategory(rawKey, category);
    }

    return RedisService.get(key)
    .then(value => {
      if (value != null) {
        try {
          return JSON.parse(value);
        } catch (error) {
          const err = error;
          console.log('error parsing', key, value);
          return null;
        }
      }

      const pubSubChannel = `${key}:pubsub`;

      return this.lock(`${key}:run_lock`, function() {
        try {
          return fn().then(function(value) {
            if (!rawKey) {
              console.log('missing cache key value', value);
            }
            if (((value !== null) && (value !== undefined)) || !ignoreNull) {
              RedisService.set(key, JSON.stringify(value))
              .then(() => RedisService.expire(key, expireSeconds));
            }
            setTimeout(() => PubSub.publish([pubSubChannel], value)
            , 100); // account for however long it takes for other instances to acquire / check lock / subscribe
            return value;
          });
        } catch (err) {
          console.log(err);
          throw err;
        }
      }
      , {
        unlockWhenCompleted: true, expireSeconds: ONE_MINUTE_SECONDS,
        throwOnLocked: true
      })
      .catch(function(err) {
        if (err?.isLocked) {
          return new Promise(function(resolve) {
            let unsubscribeTimeout;
            var subscription = PubSub.subscribe(pubSubChannel, function(value) {
              subscription?.unsubscribe?.();
              clearTimeout(unsubscribeTimeout);
              return resolve(value);
            });
            return unsubscribeTimeout = setTimeout(() => subscription?.unsubscribe?.()
            , PREFER_CACHE_PUB_SUB_TIMEOUT_MS);
          });

        } else {
          throw err;
        }
      });
    });
  }

  deleteByCategory(category) {
    const categoryKey = 'category:' + category;
    return this.tempSetGetAll(categoryKey)
    .then(categoryKeys => {
      return Promise.map(categoryKeys, this.deleteByKey);
  }).then(() => {
      return this.deleteByKey(categoryKey);
    });
  }

  deleteByKey(key) {
    key = config.get().REDIS.PREFIX + ':' + key;
    return RedisService.del(key);
  }
}

export default new CacheService();
