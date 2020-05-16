elasticsearch = require 'elasticsearch'

config = require './config'

client = new elasticsearch.Client {
  host: "#{config.get().ELASTICSEARCH.HOST}:9200"
  requestTimeout: 120000 # 120 seconds
  # log: 'trace'
}

module.exports = client
