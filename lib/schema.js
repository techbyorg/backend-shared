import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { gql } from 'apollo-server';
import { GraphQLJSON, GraphQLJSONObject } from 'graphql-type-json';
import BigInt from 'graphql-bigint';
import { mergeTypes, mergeResolvers } from 'merge-graphql-schemas';

const getSchema = function({directives, typeDefs, dirName}) {
  const graphqlFolders = _.filter(fs.readdirSync('./graphql'), file => file.indexOf('.') === -1);

  let resolversArray = _.filter(_.map(graphqlFolders, function(folder) {
    try {
      return require(path.join(dirName, `./graphql/${folder}/resolvers`));
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        console.error('error loading', folder, err);
      } else {
        err;
      }
      return null;
    }
  })
  );
  resolversArray = resolversArray.concat({
    BigInt,
    JSON: GraphQLJSON,
    // ESQuery: todo
    JSONObject: GraphQLJSONObject
  });
  const resolvers = mergeResolvers(resolversArray);

  let typesArray = _.filter(_.map(graphqlFolders, function(folder) {
    try {
      return fs.readFileSync(`./graphql/${folder}/type.graphql`, 'utf8');
    } catch (error) {
      return null;
    }
  })
  );

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
  );
  if (typeDefs) {
    typesArray = typesArray.concat(typeDefs);
  }
  if (resolvers.Mutation) {
    typesArray = typesArray.concat('type Mutation');
  }

  typeDefs = mergeTypes(typesArray, {all: true});

  return {
    typeDefs: gql(typeDefs),
    resolvers,
    schemaDirectives: directives
  };
};

export { getSchema };
