import Redis from 'ioredis';
import _ from 'lodash';
import config from './config';

// separated from redis_cache since i expect that one to go oom more easily

const client = new Redis({
  port: config.get().REDIS.PORT,
  host: config.get().REDIS.PERSISTENT_HOST
});

const events = ['connect', 'ready', 'error', 'close', 'reconnecting', 'end'];
_.map(events, event => client.on(event, function() {
  console.log(config.get().REDIS.PERSISTENT_HOST);
  return console.log(`redislog persistent ${event}`);
}));

export default client;
