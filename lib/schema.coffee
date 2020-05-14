fs = require 'fs'
path = require 'path'
_ = require 'lodash'
{gql} = require 'apollo-server';
{GraphQLJSON, GraphQLJSONObject} = require 'graphql-type-json'
BigInt = require 'graphql-bigint'
{mergeTypes, mergeResolvers} = require 'merge-graphql-schemas';

getSchema = ({directives, typeDefs, dirName}) ->
  graphqlFolders = _.filter fs.readdirSync('./graphql'), (file) ->
    file.indexOf('.') is -1

  resolversArray = _.filter _.map graphqlFolders, (folder) ->
    try
      require path.join(dirName, "./graphql/#{folder}/resolvers")
    catch err
      if err.code isnt 'MODULE_NOT_FOUND'
        console.error 'error loading', folder, err
      else
        err
      null
  resolversArray = resolversArray.concat {
    BigInt: BigInt
    JSON: GraphQLJSON
    JSONObject: GraphQLJSONObject
  }
  resolvers = mergeResolvers resolversArray

  typesArray = _.filter _.map graphqlFolders, (folder) ->
    try
      fs.readFileSync "./graphql/#{folder}/type.graphql", 'utf8'
    catch
      null

  typesArray = typesArray.concat '''
    type Query

    scalar BigInt
    scalar Date
    scalar JSON
    scalar JSONObject
  '''
  if typeDefs
    typesArray = typesArray.concat typeDefs
  if resolvers.Mutation
    typesArray = typesArray.concat 'type Mutation'

  typeDefs = mergeTypes typesArray, {all: true}

  {
    typeDefs: gql typeDefs
    resolvers: resolvers
    schemaDirectives: directives
  }

module.exports = {getSchema}
