import cassanknex from 'cassanknex'
import cassandra from 'cassandra-driver'
import Promise from 'bluebird'
import moment from 'moment'
import _ from 'lodash'

let cassanknexInstance, ready
let errorsEnabled = false
let defaultKeyspace = null

function cknex (keyspace) {
  if (keyspace == null) { keyspace = defaultKeyspace }
  const instance = cassanknexInstance(keyspace)
  instance.run = function (options = {}) { // skinny arrow on purpose
    // cid = callerId.getData()
    const self = this
    return ready.then(() => new Promise((resolve, reject) => // console.log cid
    // console.log self._columnFamily, self._statements
    // console.log ''
    // console.log '----------'
    // console.log ''
      self.exec(options, function (err, result) {
        if (result && !_.isEmpty(result.rows)) {
          result.rows = _.map(result.rows, function (row) {
          // https://github.com/datastax/nodejs-driver/pull/243
          // (.values, .forEach, .keys, .get getting added)
            const plainRow = {}
            for (const key in row) {
              const value = row[key]
              // eslint-disable-next-line no-prototype-builtins
              if (row.hasOwnProperty(key)) {
                plainRow[key] = value
              }
            }
            return plainRow
          })
        }
        // queryCount += 1
        if (err) {
          if (errorsEnabled) {
            console.log('scylla err', self._columnFamily, err, self._statements)
          }
          return reject(err)
        } else if (options.returnPageState) {
          return resolve(result)
        } else if (options.isSingle) {
          return resolve(result.rows?.[0])
        } else {
          return resolve(result.rows)
        }
      })))
  }
  return instance
}

cknex.setup = function (keyspace, contactPoints) {
  defaultKeyspace = keyspace

  const {
    distance
  } = cassandra.types

  cassanknexInstance = cassanknex({
    connection: {
      contactPoints,
      pooling: {
        maxRequestsPerConnection: 32768,
        coreConnectionsPerHost: {
          [distance.local]: 2,
          [distance.remote]: 1
        }
      }
    },
    exec: {
      prepare: true
    }
  })
  // queryCount = 0
  // setInterval ->
  //   if queryCount
  //     console.log 'qps', queryCount
  //   queryCount = 0

  ready = new Promise((resolve, reject) => cassanknexInstance.on('ready', function (err, res) {
    console.log('cassandra', err, res)
    if (err) {
      return reject(err)
    } else {
      return resolve(res)
    }
  }))
}

cknex.getClient = () => cassanknexInstance.getClient()

cknex.enableErrors = () => { errorsEnabled = true }

cknex.getTimeUuidStr = function (time) {
  if (time) {
    if (!(time instanceof Date)) {
      time = moment(time).toDate()
    }
    // for some reason cassandra throws an error if we pass in timeuuid obj, so return string instead
    return `${cassandra.types.TimeUuid.fromDate(time)}`
  } else {
    return `${cassandra.types.TimeUuid.now()}`
  }
}

cknex.getUuid = () => cassandra.types.Uuid.random()

cknex.Long = cassandra.types.Long

cknex.getTimeUuidFromString = timeUuidStr => cassandra.types.TimeUuid.fromString(timeUuidStr)

cknex.getUuidFromString = uuidStr => cassandra.types.Uuid.fromString(uuidStr)

cknex.getDateFromTimeUuid = function (timeuuid) {
  timeuuid = typeof timeuuid === 'string'
    ? cknex.getTimeUuidFromString(timeuuid)
    : timeuuid
  return timeuuid.getDate()
}

cknex.getTime = function (time) {
  if (time) {
    if (!(time instanceof Date)) {
      time = moment(time).toDate()
    }
    return time
  } else {
    return new Date()
  }
}

// cknex.chunkForBatchByPartition = (rows, partitionKey) ->
//

// FIXME FIXME: chunk all by partition. batching with mult partitions is slow/bad
// change maxChunkSize to 5kb (recommended. 30kb is probably fine though)?
cknex.chunkForBatch = function (rows) {
  // batch accepts max 50kb
  const chunks = []
  let chunkSize = 0
  let chunkIndex = 0
  const maxChunkSize = 30 * 1024 // 30kb. for some reason need big buffer from 50kb max
  _.forEach(rows, function (row) {
    const prevChunkSize = chunkSize
    chunkSize += JSON.stringify(row).length
    if (prevChunkSize && (chunkSize > maxChunkSize)) {
      chunkSize = 0
      chunkIndex += 1
      chunks[chunkIndex] = []
    } else if (chunkIndex === 0) {
      if (chunks[chunkIndex] == null) { chunks[chunkIndex] = [] }
    }
    return chunks[chunkIndex].push(row)
  })
  return chunks
}

// batching supposedly shouldn't be used much. 50kb limit and:
// https://docs.datastax.com/en/cql/3.1/cql/cql_using/useBatch.html
// but indiv queries take long and seem to use more cpu
cknex.batchRun = function (queries) {
  if (_.isEmpty(queries)) {
    return Promise.resolve(null)
  }
  // queryCount += queries.length
  return ready.then(() => new Promise((resolve, reject) => cassanknexInstance()
    .batch({ prepare: true, logged: false }, queries, function (err, result) {
      if (err) {
        console.log('batch scylla err', err)
        return reject(err)
      } else {
        return resolve(result)
      }
    })))
}

export default cknex
