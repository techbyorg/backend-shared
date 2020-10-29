// TODO: this FormatService should be shared with one in frontend-shared.
// either as separated format lib or an all-shared repo
import nameCaseAll from '@foundernest/namecase'
import toSentenceCaseWithDot from 'to-sentence-case-with-dot'

const ONE_MINUTE_S = 60
const { nameCase } = nameCaseAll

class FormatService {
  nameCase (str) {
    if (typeof str === 'string') {
      return nameCase(str)
    } else {
      return str
    }
  }

  sentenceCase (str) {
    if (typeof str === 'string') {
      return toSentenceCaseWithDot.default(str)
    } else {
      return str
    }
  }

  percentage (value) {
    return `${Math.round(value * 100)}%`
  }

  unit (value, unit, type = 'text') {
    if (unit === 'second') {
      value = this.secondsToMinutes(value)
    }

    if (unit === 'percentFraction') {
      value = Math.round(10 * value * 100) / 10
    } else if (unit === 'float') {
      value = Math.round(100 * value) / 100
    } else if (unit === 'cents') {
      value = this.abbreviateDollar(value / 100)
    } else if (unit === 'dollars') {
      value = this.abbreviateDollar(value)
    } else {
      value = this.abbreviateNumber(value)
    }

    if (unit === 'second') { // already converted to min above
      value += ' min'
    }

    return value
  }

  // https://stackoverflow.com/a/32638472
  abbreviateNumber (value, fixed) {
    if (value == null) {
      return '...'
    }
    // terminate early
    if (value === 0) {
      return '0'
    }
    if (typeof value !== 'number') {
      value = Number(value)
    }
    // terminate early
    fixed = !fixed || (fixed < 0) ? 0 : fixed
    // number of decimal places to show
    const b = value.toPrecision(2).split('e')
    const k = b.length === 1 ? 0 : Math.floor(Math.min(b[1].slice(1), 14) / 3)
    const c = k < 1 ? value.toFixed(0 + fixed) : (value / Math.pow(10, (k * 3))).toFixed(1 + fixed)
    const d = c < 0 ? c : Math.abs(c)
    const e = d + [
      '',
      'K',
      'M',
      'B',
      'T'
    ][k]
    // append power
    return e
  }

  abbreviateDollar (value, fixed) {
    return `$ ${this.abbreviateNumber(value, fixed)}`
  }

  secondsToMinutes (seconds, precision = 2) {
    return (seconds / ONE_MINUTE_S).toFixed(precision)
  }
}

export default new FormatService()
