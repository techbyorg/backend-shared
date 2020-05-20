{nameCase} = require '@foundernest/namecase'
toSentenceCaseWithDot = require('to-sentence-case-with-dot').default

class FormatService
  nameCase: nameCase
  sentenceCase: toSentenceCaseWithDot

module.exports = new FormatService()
