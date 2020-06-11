{nameCase} = require '@foundernest/namecase'
toSentenceCaseWithDot = require('to-sentence-case-with-dot').default

class FormatService
  nameCase: (str) ->
    if typeof str is 'string'
      nameCase str
    else
      str
  sentenceCase: (str) ->
    if typeof str is 'string'
      toSentenceCaseWithDot str
    else
      str

module.exports = new FormatService()
