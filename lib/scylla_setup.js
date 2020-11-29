import Promise from 'bluebird'
import _ from 'lodash'

import cknex from './cknex.js'
import CacheService from './cache.js'

// NOTE: each cassandra partition should have < 100mb and < 100k rows of data
// use time bucketing if necessary

// to estimate size you can use https://cql-calculator.herokuapp.com/

class ScyllaSetupService {
  constructor () {
    this.setup = this.setup.bind(this)
    this.createTableIfNotExist = this.createTableIfNotExist.bind(this)
  }

  async setup (tables, { isDev } = {}) {
    // TODO: use hash of tables instead of scylla_setup1
    return CacheService.lock('scylla_setup0', async () => {
      const allKeyspaces = _.uniq(_.map(tables, 'keyspace'))
      await Promise.all(_.map(allKeyspaces, this.createKeyspaceIfNotExists))
      if (isDev) {
        // const createTables = _.map(_.filter(tables, ({ name }) => name.indexOf('user') !== -1))
        const createTables = tables
        return Promise.each(createTables, this.createTableIfNotExist)
      } else {
        return Promise.each(tables, this.createTableIfNotExist)
      }
    }
    , { expireSeconds: 300 })
  }

  createKeyspaceIfNotExists (keyspaceName) {
    return cknex.getClient().execute(`\
CREATE KEYSPACE IF NOT EXISTS ${keyspaceName} WITH replication = {
  'class': 'NetworkTopologyStrategy', 'datacenter1': '3'
} AND durable_writes = true;\
`
    )
  }

  addColumnToQuery (q, type, key) {
    if (typeof type === 'object') {
      try {
        if (type.type === 'json') {
          type.type = 'text'
        }
        if (type.subType2) {
          return q[type.type](key, type.subType, type.subType2)
        } else {
          return q[type.type](key, type.subType)
        }
      } catch (err) {
        console.log(type.type, err)
      }
    } else {
      try {
        if (type === 'json') {
          type = 'text'
        }
        return q[type](key)
      } catch (err) {
        console.log(key)
        throw err
      }
    }
  }

  /*
  materializedViews:
  fields or *, primaryKey, withClusteringOrderBy
  */
  async createTableIfNotExist (table) {
    console.log('create', table.name)
    const primaryColumns = _.filter(
      table.primaryKey.partitionKey.concat(table.primaryKey.clusteringColumns)
    )
    const { primaryFields, normalFields } = _.reduce(table.fields, (obj, type, key) => {
      if (primaryColumns.includes(key)) {
        obj.primaryFields.push({ key, type })
      } else {
        obj.normalFields.push({ key, type })
      }
      return obj
    }
    , { primaryFields: [], normalFields: [] })

    // add primary fields, set as primary, set order
    let q = cknex(table.keyspace).createColumnFamilyIfNotExists(table.name)

    _.map(primaryFields, ({ key, type }) => {
      return this.addColumnToQuery(q, type, key)
    })

    if (table.primaryKey.clusteringColumns) {
      q.primary(
        table.primaryKey.partitionKey, table.primaryKey.clusteringColumns
      )
    } else {
      q.primary(table.primaryKey.partitionKey)
    }

    if (table.withClusteringOrderBy) {
      if (!_.isArray(table.withClusteringOrderBy[0])) {
        table.withClusteringOrderBy = [table.withClusteringOrderBy]
      }
      _.map(table.withClusteringOrderBy, orderBy => q.withClusteringOrderBy(
        orderBy[0],
        orderBy[1]
      ))
    }

    await q.run()

    // add any new columns
    await Promise.each(normalFields, ({ key, type }) => {
      q = cknex(table.keyspace).alterColumnFamily(table.name)
      this.addColumnToQuery(q, type, key)
      return q.run().catch(() => null)
    })

    await Promise.all(_.map(table.materializedViews, (view, name) => {
      let keyStr, orderByStr, whereStr
      let { fields, primaryKey, withClusteringOrderBy, notNullFields } = view
      const fieldsStr = fields ? `"${fields.join('","')}"` : '*'
      notNullFields = _.flatten(_.map(primaryKey, arr => arr))
      if (notNullFields) {
        whereStr = 'WHERE '
        _.forEach(notNullFields, (field, i) => {
          whereStr += `"${field}" IS NOT NULL`
          if (i < (notNullFields.length - 1)) {
            whereStr += ' AND '
          }
        })
      } else {
        whereStr = ''
      }

      if (primaryKey.clusteringColumns) {
        keyStr = `PRIMARY KEY( \
("${primaryKey.partitionKey.join('","')}"), \
"${primaryKey.clusteringColumns.join('","')}")`
      } else {
        keyStr = `PRIMARY KEY(("${primaryKey.partitionKey.join('","')}"))`
      }

      if (withClusteringOrderBy && (typeof withClusteringOrderBy[0] === 'object')) {
        orderByStr = 'WITH CLUSTERING ORDER BY ('
        _.forEach(withClusteringOrderBy, (orderBy, i) => {
          orderByStr += `"${orderBy[0]}" ${orderBy[1]}`
          if (i < (withClusteringOrderBy.length - 1)) {
            orderByStr += ', '
          }
        })
        orderByStr += ')'
      } else if (withClusteringOrderBy) {
        orderByStr = `WITH CLUSTERING ORDER BY ( \
"${withClusteringOrderBy[0]}" \
${withClusteringOrderBy[1]})`
      } else {
        orderByStr = ''
      }

      const query = `CREATE MATERIALIZED VIEW ${table.keyspace}."${name}" AS \
SELECT ${fieldsStr} FROM ${table.keyspace}."${table.name}" \
${whereStr} \
${keyStr} \
${orderByStr};`
      return cknex.getClient().execute(query)
        .catch(function (err) {
          if (err.code !== 9216) {
            console.log('err1', err)
            throw err
          }
        })
    }
    , { concurrency: 1 }))
  }
}

export default new ScyllaSetupService()
