import nameCaseAll from '@foundernest/namecase'
import toSentenceCaseWithDot from 'to-sentence-case-with-dot'

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
}

export default new FormatService()
