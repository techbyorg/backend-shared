import _ from 'lodash'
import Promise from 'bluebird'

import cknex from './cknex.js'
import elasticsearch from './elasticsearch.js'

// try to prevent error "xxxx requests are in-flight on a single connection"
// and "Server timeout during write query at consistency LOCAL_ONE (0 peer(s) acknowledged the write over 1 required)"
const BATCH_UPSERT_MAX_CONCURRENCY = 100

/*
when setting materialized views, don't include any view primary keys that can be
changed (eg username, email) in the main table's primary keys...
*/

export default class Base {
  constructor () {
    this.refreshESIndex = this.refreshESIndex.bind(this)
    this.batchIndex = this.batchIndex.bind(this)
    this.upsertByRow = this.upsertByRow.bind(this)
    this.getESIndexQuery = this.getESIndexQuery.bind(this)
    this.index = this.index.bind(this)
    this.getByRow = this.getByRow.bind(this)
    this.getESIdByRow = this.getESIdByRow.bind(this)
    this.deleteESById = this.deleteESById.bind(this)
    this.defaultInput = this.defaultInput.bind(this)
    this.defaultOutput = this.defaultOutput.bind(this)
    this.defaultESInput = this.defaultESInput.bind(this)
    this.fieldsWithType = _.reduce(this.getScyllaTables(), function (obj, table) {
      if (table.ignoreUpsert) {
        return obj
      }
      _.forEach(table.fields, (value, key) => {
        obj[key] = {
          type: value?.type || value,
          defaultFn: value?.defaultFn
        }
      })
      return obj
    }
    , {})

    this.fieldsWithDefaultFn = _.pickBy(this.fieldsWithType, ({ type, defaultFn }, key) => defaultFn || ((key === 'id') && ['uuid', 'timeuuid'].includes(type)))
  }

  refreshESIndex () {
    return elasticsearch.indices.refresh({ index: this.getElasticSearchIndices?.()[0].name })
  }

  batchUpsert = async (rows, { ESIndex, ESRefresh } = {}) => {
    const ESRows = await Promise.map(rows, row => {
      return this.upsert(row, { isBatch: true })
    }
    , { concurrency: BATCH_UPSERT_MAX_CONCURRENCY })
    return this.batchIndex(ESRows, { index: ESIndex, refresh: ESRefresh })
  };

  batchIndex (rows, { index, refresh } = {}) {
    if (_.isEmpty(this.getElasticSearchIndices?.())) {
      return Promise.resolve()
    } else {
      return elasticsearch.bulk({
        refresh,
        index: this.getElasticSearchIndices?.()[0].name,
        body: _.flatten(_.map(rows, row => {
          row = this.defaultESInput(row)
          const {
            id
          } = row
          row = _.pick(row, _.keys(this.getElasticSearchIndices?.()[0].mappings))
          if (index) {
            return [{ index: { _id: id } }, row]
          } else {
            return [{ update: { _id: id } }, { doc_as_upsert: true, doc: row }]
          }
        }))
      })
        .then(function (response) {
          if (response.errors) {
            console.log('elasticsearch errors')
          }
          return response
        })
    }
  }

  upsertByRow (row, diff, options = {}) {
    const keyColumns = _.filter(_.uniq(_.flatten(_.map(this.getScyllaTables(), table => table.primaryKey.partitionKey.concat(
      table.primaryKey.clusteringColumns
    ))
    )
    )
    )
    const primaryKeyValues = _.pick(row, keyColumns)

    return this.upsert(
      _.defaults(diff, primaryKeyValues),
      _.defaults(options, { skipAdditions: Boolean(row) })
    )
  }

  // TODO: cleanup isBatch part of this
  // if batching, we skip the ES index, and spit that back so it can be done bulk
  upsert = async (row, options = {}) => {
    let res
    const { prepareFn, isUpdate, skipAdditions, isBatch } = options

    let scyllaRow = this.defaultInput(row, { skipAdditions })
    const ESRow = _.defaults({ id: scyllaRow.id }, row)

    await Promise.all(_.filter(_.map(this.getScyllaTables(), table => {
      if (table.ignoreUpsert) {
        return
      }
      return this._upsertScyllaRowByTableAndRow(table, scyllaRow, options)
    }).concat([
      !isBatch
        ? this.index(ESRow) : undefined
    ])))

    await this.clearCacheByRow?.(scyllaRow)

    if (this.streamChannelKey) {
      if (prepareFn) {
        scyllaRow = await prepareFn(scyllaRow)
      }

      if (!isUpdate) {
        this.streamCreate(scyllaRow)
      }
      res = this.defaultOutput(scyllaRow)
    } else {
      res = this.defaultOutput(scyllaRow)
    }

    if (isBatch) {
      return ESRow
    } else {
      return res
    }
  };

  _upsertScyllaRowByTableAndRow (table, scyllaRow, options = {}) {
    const { ttl, add, remove } = options

    const scyllaTableRow = _.pick(scyllaRow, _.keys(table.fields))

    const keyColumns = _.filter(table.primaryKey.partitionKey.concat(
      table.primaryKey.clusteringColumns
    )
    )

    const missing = _.find(keyColumns, column => !scyllaTableRow[column])
    if (missing) {
      return console.log(`missing ${missing} in ${table.name} upsert`)
    }

    const set = _.omit(scyllaTableRow, keyColumns)

    let q
    if (_.isEmpty(set)) {
      q = cknex().insert(scyllaTableRow)
        .into(table.name)
    } else {
      q = cknex().update(table.name)
        .set(set)
      _.forEach(keyColumns, column => q.andWhere(column, '=', scyllaTableRow[column]))
    }
    if (ttl) {
      q.usingTTL(ttl)
    }
    if (add) {
      q.add(add)
    }
    if (remove) {
      q.remove(remove)
    }
    return q.run()
  }

  getESIndexQuery (row) {
    row = this.defaultESInput(row)
    return {
      index: this.getElasticSearchIndices?.()[0].name,
      id: row.id,
      body: {
        doc:
          _.pick(row, _.keys(this.getElasticSearchIndices?.()[0].mappings)),
        doc_as_upsert: true
      }
    }
  }

  index (row) {
    const query = this.getESIndexQuery(row)
    if (_.isEmpty(this.getElasticSearchIndices?.()) || _.isEmpty(query.body.doc)) {
      return Promise.resolve()
    } else {
      return elasticsearch.update(query)
        .catch(err => {
        // console.log 'elastic err', @getElasticSearchIndices?()[0].name, err
          throw err
        })
    }
  }

  search = async ({ query, sort, limit, trackTotalHits, isRandomized }) => {
    if (limit == null) { limit = 50 }

    const { hits } = await elasticsearch.search({
      index: this.getElasticSearchIndices()[0].name,
      body: {
        track_total_hits: trackTotalHits, // get accurate "total"
        query:
          isRandomized ? {
            // random ordering so they don't clump on map
            function_score: {
              query,
              boost_mode: 'replace'
            }
          }
            : query,
        sort,
        from: 0,
        // it'd be nice to have these distributed more evently
        // grab ~2,000 and get random 250?
        // is this fast/efficient enough?
        size: limit
      }
    })

    const total = hits.total?.value
    return {
      total,
      rows: _.map(hits.hits, ({ _id, _source }) => {
        return this.defaultESOutput(_.defaults(_source, { id: _id }))
      })
    }
  };

  // parts of row -> full row
  getByRow (row) {
    const scyllaRow = this.defaultInput(row)
    const table = this.getScyllaTables()[0]
    const keyColumns = _.filter(table.primaryKey.partitionKey.concat(
      table.primaryKey.clusteringColumns
    )
    )
    const q = cknex().select('*')
      .from(table.name)
    _.forEach(keyColumns, column => q.andWhere(column, '=', scyllaRow[column]))
    return q.run({ isSingle: true })
  }

  // returns row that was deleted
  _deleteScyllaRowByTableAndRow = async (table, row) => {
    const scyllaRow = this.defaultInput(row)

    const keyColumns = _.filter(table.primaryKey.partitionKey.concat(
      table.primaryKey.clusteringColumns
    )
    )
    let q = cknex().select('*')
      .from(table.name)
    _.forEach(keyColumns, column => q.andWhere(column, '=', scyllaRow[column]))
    const response = await q.run({ isSingle: true })

    q = cknex().delete()
      .from(table.name)
    _.forEach(keyColumns, column => q.andWhere(column, '=', scyllaRow[column]))
    await q.run()

    return response
  };

  // to prevent dupe upserts, elasticsearch id needs to be combination of all
  // of scylla primary key values
  getESIdByRow (row) {
    const scyllaTable = _.find(this.getScyllaTables(), ({ ignoreUpsert }) => !ignoreUpsert)
    const keyColumns = _.filter(scyllaTable.primaryKey.partitionKey.concat(
      scyllaTable.primaryKey.clusteringColumns
    )
    )
    return _.map(keyColumns, column => row[column]).join('|').substr(0, 512) // 512b max limit
  }

  deleteByRow = async row => {
    await Promise.all(_.filter(_.map(this.getScyllaTables(), table => {
      if (table.ignoreUpsert) {
        return
      }
      return this._deleteScyllaRowByTableAndRow(table, row)
    }).concat([this.deleteESById(this.getESIdByRow(row))])))

    await this.clearCacheByRow?.(row)

    if (this.streamChannelKey) {
      this.streamDeleteById(row.id, row)
    }
    return null
  };

  deleteESById (id) {
    if (_.isEmpty(this.getElasticSearchIndices?.())) {
      return Promise.resolve()
    } else {
      return elasticsearch.delete({
        index: this.getElasticSearchIndices?.()[0].name,
        id: `${id}`
      })
        .catch(err => console.log('elastic err', err))
    }
  }

  defaultInput (row, { skipAdditions } = {}) {
    if (!skipAdditions) {
      _.map(this.fieldsWithDefaultFn, function (field, key) {
        const value = row[key]
        if (!value && !skipAdditions && field.defaultFn) {
          row[key] = field.defaultFn()
        } else if (!value && !skipAdditions && (field.type === 'uuid')) {
          row[key] = cknex.getUuid()
        } else if (!value && !skipAdditions && (field.type === 'timeuuid')) {
          row[key] = cknex.getTimeUuid()
        }
        return row[key]
      })
    }
    return _.mapValues(row, (value, key) => {
      const { type } = this.fieldsWithType[key] || {}

      if (type === 'json') {
        return JSON.stringify(value)
      // else if type is 'timeuuid' and typeof value is 'string'
      //   row[key] = cknex.getTimeUuidFromString(value)
      // else if type is 'uuid' and typeof value is 'string'
      //   row[key] = cknex.getUuidFromString(value)
      } else {
        return value
      }
    })
  }

  defaultOutput (row) {
    if (row == null) {
      return null
    }

    return _.mapValues(row, (value, key) => {
      const { type, defaultFn, defaultOutputFn } = this.fieldsWithType[key] || {}
      if ((type === 'json') && value && (typeof value === 'object')) {
        return value
      } else if ((type === 'json') && value) {
        try {
          return JSON.parse(value)
        } catch (error) {
          return defaultFn?.() || defaultOutputFn?.() || {}
        }
      } else if (type === 'json') {
        return defaultFn?.() || defaultOutputFn?.() || {}
      } else if (type === 'counter') {
        return parseInt(value)
      } else if (value && ['uuid', 'timeuuid'].includes(type)) {
        return `${value}`
      } else {
        return value
      }
    })
  }

  defaultESInput (row) {
    const id = this.getESIdByRow(row)
    if (row.id && (id !== row.id)) {
      row.scyllaId = `${row.id}`
    }
    row.id = id
    return _.mapValues(row, (value, key) => {
      const { type } = this.fieldsWithType[key] || {}

      if ((type === 'json') && (typeof value === 'string')) {
        return JSON.parse(value)
      } else {
        return value
      }
    })
  }

  defaultESOutput (row) { return row }
}
