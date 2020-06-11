import elasticsearch from 'elasticsearch'

// TODO: there's probably a smarter way to do this (setting host and connecting from other file)
// drawback of this is having `.client.`
class Elasticsearch {
  constructor () {
    this.setup = this.setup.bind(this)
  }

  setup (host) {
    this.client = new elasticsearch.Client({
      host: host,
      requestTimeout: 120000 // 120 seconds
      // log: 'trace'
    })
  }
}

export default new Elasticsearch()
