class Config
  constructor: ->
    @config

  set: (@config) => null

  get: => @config

module.exports = new Config()
