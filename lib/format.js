/* eslint-disable
    import/no-named-default,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
import { nameCase } from '@foundernest/namecase'
import { default as toSentenceCaseWithDot } from 'to-sentence-case-with-dot'

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
