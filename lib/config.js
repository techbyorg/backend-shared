/* eslint-disable
    no-unused-expressions,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
class Config {
  constructor () {
    this.set = this.set.bind(this)
    this.get = this.get.bind(this)
    this.config
  }

  set (config) { this.config = config; return null }

  get () { return this.config }
}

export default new Config()
