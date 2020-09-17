import fs from 'fs'
import path from 'path'
import _ from 'lodash'
import Promise from 'bluebird'
import ApolloServer from 'apollo-server'
import GraphQLTypeJSON from 'graphql-type-json'
import BigInt from 'graphql-bigint'
import MergeGraphQLSchemas from 'merge-graphql-schemas'

const { GraphQLJSON, GraphQLJSONObject } = GraphQLTypeJSON
const { gql } = ApolloServer
const { mergeTypes, mergeResolvers } = MergeGraphQLSchemas

function importFile (file) {
  return import(file)
    .then((module) => module.default)
    .catch((err) => {
      if (err.code !== 'ERR_MODULE_NOT_FOUND' || (err.message.indexOf("resolvers.js' imported") === -1 && err.message.indexOf("mutations.js' imported") === -1)) {
        console.error('error loading', file, err.message)
      }
      return null
    })
}

async function getSchema ({ directives = [], typeDefs = [], dirName }) {
  const graphqlFolders = _.filter(fs.readdirSync('./graphql'), (file) =>
    file.indexOf('.') === -1
  )

  let resolversArray = _.filter(await Promise.map(graphqlFolders, async (folder) => {
    return importFile(path.join(dirName, `./graphql/${folder}/resolvers.js`))
  })).concat()
  const mutationsArray = _.filter(await Promise.map(graphqlFolders, async (folder) => {
    return importFile(path.join(dirName, `./graphql/${folder}/mutations.js`))
  }))

  resolversArray = resolversArray.concat(mutationsArray, {
    BigInt,
    // ESQuery: todo
    JSON: GraphQLJSON,
    JSONObject: GraphQLJSONObject
  })
  const resolvers = mergeResolvers(resolversArray)

  let typesArray = _.filter(_.map(graphqlFolders, (folder) => {
    try {
      return fs.readFileSync(`./graphql/${folder}/type.graphql`, 'utf8')
    } catch (error) {
      return null
    }
  }))

  typesArray = typesArray.concat(`\
type Query

scalar BigInt
scalar Date
scalar JSON
scalar JSONObject

"""
[ElasticSearch query](https://medium.com/elasticsearch/introduction-to-elasticsearch-queries-b5ea254bf455)
"""
scalar ESQuery\
`
  )
  if (typeDefs) {
    typesArray = typesArray.concat(typeDefs)
  }
  if (resolvers.Mutation) {
    typesArray = typesArray.concat('type Mutation')
  }

  typeDefs = mergeTypes(typesArray, { all: true })

  return {
    typeDefs: gql(typeDefs),
    resolvers,
    schemaDirectives: directives
  }
}

export default { getSchema }
