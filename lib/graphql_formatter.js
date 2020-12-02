import _ from 'lodash'
import graphql from 'graphql'
import { Cache } from 'backend-shared'

const { parse } = graphql

// TODO: rename to just graphql, not graphql_formatter
export default {
  // if request has a fragment that is in CACHEABLE_FRAGMENTS, cache the entire response.
  // main thing we want to use for right now is the complex org query that contains orgUser, roles, partners, etc...
  // we want that cached, but we also want to clear that cache (using categories) effectively
  async execQuery (query, context, cacheableFragments, queryFn) {
    const parsedQuery = parse(query)
    const args = _.reduce(parsedQuery.definitions[0].selectionSet.selections[0].arguments, (obj, arg) => {
      const key = arg.name.value
      const value = arg.value.value
      obj[key] = value
      return obj
    }, {})
    const fragment = _.find(parsedQuery.definitions, { kind: 'FragmentDefinition' })?.name?.value

    const cacheInfo = cacheableFragments[fragment]
    if (!cacheInfo) {
      return queryFn()
    }
    const { expireSeconds, cacheKeyFn, categoriesFn } = cacheInfo
    const cacheKey = cacheKeyFn(args, context)
    // console.log('cachekey', cacheKey)
    return Cache.preferCache(cacheKey, queryFn, { expireSeconds, categoriesFn })
  },

  fromElasticsearch ({ rows, total }) {
    return {
      totalCount: total,
      nodes: rows
    }
  },

  fromScylla (rows) {
    return {
      totalCount: rows?.length || 0,
      nodes: rows || []
    }
  }
}
