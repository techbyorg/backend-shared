{graphql} = require 'graphql'

module.exports = (schema) ->
  (req, res) ->
    rootValue = undefined
    context = req
    graphql schema, req.body.graphql, rootValue, context, req.body.variables
    .then ({data, errors}) ->
      if errors
        res.send {errors}
      else
        res.send {data}
