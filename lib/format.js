import nameCase from '@foundernest/namecase'
import toSentenceCaseWithDot from 'to-sentence-case-with-dot'

console.log('nc', nameCase)

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
      return toSentenceCaseWithDot(str)
    } else {
      return str
    }
  }
}

export default new FormatService()
