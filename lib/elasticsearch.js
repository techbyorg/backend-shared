import elasticsearch from 'elasticsearch';
import config from './config';

const client = new elasticsearch.Client({
  host: `${config.get().ELASTICSEARCH.HOST}:9200`,
  requestTimeout: 120000 // 120 seconds
  // log: 'trace'
});

export default client;
