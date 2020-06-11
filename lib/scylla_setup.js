/* eslint-disable
    no-constant-condition,
    no-return-assign,
    no-unused-vars,
    no-useless-escape,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
import Promise from 'bluebird'
import _ from 'lodash'
import CacheService from './cache'
import cknex from './cknex'
import cassandra from 'cassandra-driver'
import config from './config'

class ScyllaSetupService {
  constructor () {
    this.setup = this.setup.bind(this)
    this.createTableIfNotExist = this.createTableIfNotExist.bind(this)
  }

  setup (tables) {
    // TODO: use hash of tables instead of scylla_setup1
    return CacheService.lock('scylla_setup1', () => {
      const allKeyspaces = _.uniq(_.map(tables, 'keyspace'))
      return Promise.all(_.map(allKeyspaces, this.createKeyspaceIfNotExists))
        .then(() => {
          if ((config.get().ENV === config.get().ENVS.DEV) && false) {
            const createTables = _.map(_.filter(tables, ({ name }) => name.indexOf('user') !== -1)
            )
            return Promise.each(createTables, this.createTableIfNotExist)
          } else {
            return Promise.each(tables, this.createTableIfNotExist)
          }
        })
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
    let err
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
      } catch (error) {
        err = error
        return console.log(type.type, err)
      }
    } else {
      try {
        if (type === 'json') {
          type = 'text'
        }
        return q[type](key)
      } catch (error1) {
        err = error1
        console.log(key)
        throw err
      }
    }
  }

  /*
  materializedViews:
  fields or *, primaryKey, withClusteringOrderBy
  */
  createTableIfNotExist (table) {
    console.log('create', table.name)
    const primaryColumns = _.filter(
      table.primaryKey.partitionKey.concat(table.primaryKey.clusteringColumns)
    )
    const { primaryFields, normalFields } = _.reduce(table.fields, function (obj, type, key) {
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

    return q.run()
      .then(() => {
      // add any new columns
        return Promise.each(normalFields, ({ key, type }) => {
          q = cknex(table.keyspace).alterColumnFamily(table.name)
          this.addColumnToQuery(q, type, key)
          return q.run().catch(() => null)
        })
      }).then(() => {
        return Promise.all(_.map(table.materializedViews, function (view, name) {
          let keyStr, orderByStr, whereStr
          let { fields, primaryKey, withClusteringOrderBy, notNullFields } = view
          const fieldsStr = fields ? `\"${fields.join('","')}\"` : '*'
          notNullFields = _.flatten(_.map(primaryKey, arr => arr))
          if (notNullFields) {
            whereStr = 'WHERE '
            _.map(notNullFields, function (field, i) {
              whereStr += `\"${field}\" IS NOT NULL`
              if (i < (notNullFields.length - 1)) {
                return whereStr += ' AND '
              }
            })
          } else {
            whereStr = ''
          }

          if (primaryKey.clusteringColumns) {
            keyStr = `PRIMARY KEY( \
(\"${primaryKey.partitionKey.join('","')}\"), \
\"${primaryKey.clusteringColumns.join('","')}\")`
          } else {
            keyStr = `PRIMARY KEY((\"${primaryKey.partitionKey.join('","')}\"))`
          }

          if (withClusteringOrderBy && (typeof withClusteringOrderBy[0] === 'object')) {
            orderByStr = 'WITH CLUSTERING ORDER BY ('
            _.map(withClusteringOrderBy, function (orderBy, i) {
              orderByStr += `\"${orderBy[0]}\" ${orderBy[1]}`
              if (i < (withClusteringOrderBy.length - 1)) {
                return orderByStr += ', '
              }
            })
            orderByStr += ')'
          } else if (withClusteringOrderBy) {
            orderByStr = `WITH CLUSTERING ORDER BY ( \
\"${withClusteringOrderBy[0]}\" \
${withClusteringOrderBy[1]})`
          } else {
            orderByStr = ''
          }

          const query = `CREATE MATERIALIZED VIEW ${table.keyspace}.\"${name}\" AS \
SELECT ${fieldsStr} FROM ${table.keyspace}.\"${table.name}\" \
${whereStr} \
${keyStr} \
${orderByStr};`
          return cknex.getClient().execute(query)
            .catch(function (err) {
              if (err.code !== 9216) {
                throw err
              }
            })
        }
        , { concurrency: 1 }))
      })
  }
}

export default new ScyllaSetupService()
