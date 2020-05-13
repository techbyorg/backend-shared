fs = require 'fs'
path = require 'path'
_ = require 'lodash'
{gql} = require 'apollo-server';
{GraphQLJSON, GraphQLJSONObject} = require 'graphql-type-json'
BigInt = require 'graphql-bigint'
{mergeTypes, mergeResolvers} = require 'merge-graphql-schemas';

getSchema = ({directives, dirName}) ->
  graphqlFolders = _.filter fs.readdirSync('./graphql'), (file) ->
    file.indexOf('.') is -1
  typesArray = _.filter _.map graphqlFolders, (folder) ->
    try
      fs.readFileSync "./graphql/#{folder}/type.graphql", 'utf8'
    catch
      null
  typesArray = typesArray.concat '''
    type Query

    # type Mutation

    scalar BigInt
    scalar Date
    scalar JSON
    scalar JSONObject
  '''
  typeDefs = mergeTypes typesArray, {all: true}

  resolversArray = _.filter _.map graphqlFolders, (folder) ->
    try
      require path.join(dirName, "./graphql/#{folder}/resolvers")
    catch err
      console.log err
      if err.code isnt 'MODULE_NOT_FOUND'
        console.error 'error loading', folder, err
      null
  resolversArray = resolversArray.concat {
    BigInt: BigInt
    JSON: GraphQLJSON
    JSONObject: GraphQLJSONObject
  }
  resolvers = mergeResolvers resolversArray

  {
    typeDefs: gql typeDefs
    resolvers: resolvers
    schemaDirectives: directives
  }

module.exports = {getSchema}
