import _ from 'lodash'

export default (function (object) {
  var getDeepUndefinedKeys = function (object, prefix) {
    if (prefix == null) { prefix = '' }
    return _.reduce(object, function (missing, val, key) {
      if (val === undefined) {
        return missing.concat(prefix + key)
      } else if (_.isPlainObject(val)) {
        return missing.concat(getDeepUndefinedKeys(val, key + '.'))
      } else {
        return missing
      }
    }
    , [])
  }

  const missing = getDeepUndefinedKeys(object)
  if (!_.isEmpty(missing)) {
    throw new Error(`missing values for: ${missing.join(', ')}`)
  }
})
