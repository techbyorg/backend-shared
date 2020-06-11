class Config {
  constructor () {
    this.set = this.set.bind(this)
    this.get = this.get.bind(this)
  }

  set (config) { this.config = config; return null }

  get () { return this.config }
}

export default new Config()
