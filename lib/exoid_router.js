import _ from 'lodash'
import Joi from 'joi'
import Promise from 'bluebird'

var thrower = function ({ status, info, ignoreLog }) {
  if (status == null) { status = 400 }

  const error = new Error(info)
  Error.captureStackTrace(error, thrower)

  error.status = status
  error.info = info
  error.ignoreLog = ignoreLog
  error._exoid = true

  throw error
}

var assert = function (obj, schema) {
  const valid = Joi.validate(obj, schema, { presence: 'required', convert: false })

  if (valid.error) {
    try {
      return thrower({ info: valid.error.message })
    } catch (error) {
      Error.captureStackTrace(error, assert)
      throw error
    }
  }
}

const BATCH_CHUNK_TIMEOUT_MS = 30
const BATCH_CHUNK_TIMEOUT_BACKOFF_MS = 50
const MAX_BATCH_CHUNK_TIMEOUT_MS = 15000

class ExoidRouter {
  static initClass () {
    this.prototype.throw = thrower
    this.prototype.assert = assert
  }

  constructor (state = {}) {
    this.bind = this.bind.bind(this)
    this.on = this.on.bind(this)
    this.resolve = this.resolve.bind(this)
    this.setMiddleware = this.setMiddleware.bind(this)
    this.setDisconnect = this.setDisconnect.bind(this)
    this.onConnection = this.onConnection.bind(this)
    this.state = state
  }

  bind (transform) {
    return new ExoidRouter(transform(this.state))
  }

  on (path, handler) {
    return this.bind(state => _.defaultsDeep({
      paths: { [path]: handler }
    }, state))
  }

  resolve (path, body, req, io) {
    return new Promise(resolve => {
      const handler = this.state.paths[path]

      if (!handler) {
        this.throw({ status: 400, info: `Handler not found for path: ${path}` })
      }

      return resolve(handler(body, req, io))
    }).then(result => ({
      result,
      error: null
    }))
      .catch(function (error) {
        if (!error.ignoreLog) {
          console.error(error)
        }
        const errObj = error._exoid
          ? { status: error.status, info: error.info }
          : { status: 500 }

        return { result: null, error: errObj }
      })
  }

  setMiddleware (middlewareFn) { this.middlewareFn = middlewareFn; return null }

  setDisconnect (disconnectFn) { this.disconnectFn = disconnectFn; return null }

  onConnection (socket) {
    socket.on('disconnect', () => {
      return this.disconnectFn?.(socket)
    })

    return socket.on('exoid', body => {
      const requests = body?.requests
      let isComplete = false

      const emitBatchChunk = responses => socket.emit(body.batchId, responses)

      let responseChunk = {}
      let timeoutMs = BATCH_CHUNK_TIMEOUT_MS
      var emitBatchChunkFn = function () {
        timeoutMs += BATCH_CHUNK_TIMEOUT_BACKOFF_MS
        if (!_.isEmpty(responseChunk)) {
          emitBatchChunk(responseChunk)
          responseChunk = {}
        }
        if ((timeoutMs < MAX_BATCH_CHUNK_TIMEOUT_MS) && !isComplete) {
          return setTimeout(emitBatchChunkFn, timeoutMs)
        }
      }

      setTimeout(emitBatchChunkFn, timeoutMs)

      return this.middlewareFn(body, socket.request)
        .then(req => {
          try {
            this.assert(requests, Joi.array().items(Joi.object().keys({
              path: Joi.string(),
              body: Joi.any().optional(),
              streamId: Joi.string().optional()
            })
            )
            )
          } catch (error) {
            isComplete = true
            responseChunk = {
              isError: true,
              status: error.status,
              info: error.info
            }
          }

          return Promise.map(requests, request => {
            const emitRequest = response => socket.emit(request.streamId, response)
            return this.resolve(request.path, request.body, socket.request, {
              emit: emitRequest,
              route: request.path,
              socket
            })
              .then(response => {
                responseChunk[request.streamId] = response
              }).catch(err => console.log('caught exoid error', err))
          }).then(() => { isComplete = true })
        }).catch(err => console.log(err))
    })
  }
}
ExoidRouter.initClass()

export default new ExoidRouter()
