import crypto from 'crypto'
import * as Impact from '@techby/impact'

export { init as initImpact } from '@techby/impact'

export function incrementMetric (...args) {
  Impact.incrementMetric(...args)
    .catch((err) => {
      console.log('impact sdk err', err)
      throw err
    })
}

export function incrementUnique (...args) {
  Impact.incrementUnique(...args)
    .catch((err) => {
      console.log('impact sdk err', err)
      throw err
    })
}

export function hashUserId (userId) {
  return crypto.createHash('sha256').update(userId).digest('base64')
}
