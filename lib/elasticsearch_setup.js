import Promise from 'bluebird';
import _ from 'lodash';
import CacheService from './cache';
import elasticsearch from './elasticsearch';

/*
to migrate tables
post http://localhost:9200/_reindex
{
	"source": {"index": "campgrounds", "type": "_doc"}, "dest": {"index": "campgrounds_new", "type": "_doc"},
	  "script": {
	    "inline": "ctx._source.remove('forecast')",
	    "lang": "painless"
	  }
}

{
	"dest": {"index": "campgrounds", "type": "_doc"}, "source": {"index": "campgrounds_new", "type": "_doc"},
	  "script": {
	    "inline": "ctx._source.remove('forecast')",
	    "lang": "painless"
	  }
}


*/

class ElasticsearchSetupService {
  constructor() {
    this.setup = this.setup.bind(this);
  }

  setup(indices) {
    return CacheService.lock('elasticsearch_setup9', () => {
      return Promise.each(indices, this.createIndexIfNotExist);
    }
    , {expireSeconds: 300});
  }

  createIndexIfNotExist(index) {
    console.log('create index', index);
    return elasticsearch.indices.create({
      index: index.name,
      body: {
        mappings: {
          properties:
            index.mappings
        },
        settings: {
          number_of_shards: 3,
          number_of_replicas: 2
        }
      }
      })
      .catch(err => // console.log 'caught', err
    // add any new mappings
    Promise.all(_.map(index.mappings, (value, key) => elasticsearch.indices.putMapping({
      index: index.name,
      body: {
        properties: {
          [key]: value
        }
      }
    })))
    .catch(() => null));
  }
}
// Promise.resolve null

export default new ElasticsearchSetupService();
