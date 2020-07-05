import moment from 'moment'

const MAX_BUCKETS = 50

class TimeService {
  getScaledTimeByTimeScale (timeScale, time) {
    if (time == null) { time = moment() }
    if (timeScale === 'all') {
      return 'ALL'
    } else if (timeScale === 'day') {
      return 'DAY:' + time.format('YYYY-MM-DD')
    } else if (timeScale === 'biweek') {
      // 1 - 26 instead of 1 - 52
      return 'BIWK:' + time.format('GGGG') + (parseInt(time.format('GGGG-WW')) / 2)
    } else if (timeScale === 'week') {
      return 'WK:' + time.format('GGGG-WW')
    } else if (timeScale === 'month') {
      return 'MON:' + time.format('YYYY-MM')
    } else if (timeScale === 'year') {
      return 'YR:' + time.format('YYYY')
    } else {
      return 'MIN:' + time.format('YYYY-MM-DD HH:mm')
    }
  }

  getPreviousTimeByTimeScale (timeScale, time) {
    if (time == null) { time = moment() }
    if (timeScale === 'all') {
      return 'ALL'
    } else if (timeScale === 'day') {
      time.subtract(1, 'days')
      return 'DAY:' + time.format('YYYY-MM-DD')
    } else if (timeScale === 'biweek') {
      time.subtract(2, 'weeks')
      return 'BIWK:' + time.format('GGGG') + (parseInt(time.format('GGGG-WW')) / 2)
    } else if (timeScale === 'week') {
      time.subtract(1, 'weeks')
      return 'WK:' + time.format('GGGG-WW')
    } else if (timeScale === 'month') {
      time.subtract(1, 'months')
      return 'MON:' + time.format('YYYY-MM')
    } else if (timeScale === 'year') {
      time.subtract(1, 'year')
      return 'YR:' + time.format('YYYY')
    } else {
      time.subtract(1, 'minutes')
      return 'MIN:' + time.format('YYYY-MM-DD HH:mm')
    }
  }

  getTimeBuckets (minScaledTime, maxScaledTime, bucketTimeScale) {
    const startTimeBucket = this.getScaledTimeByTimeScale(bucketTimeScale, minScaledTime)
    const timeBuckets = [startTimeBucket]
    let endTimeBucket = this.getScaledTimeByTimeScale(bucketTimeScale, maxScaledTime)
    let count = 0
    while (endTimeBucket !== startTimeBucket && count < MAX_BUCKETS) {
      count += 1
      timeBuckets.push(endTimeBucket)
      endTimeBucket = this.getPreviousTimeByTimeScale(bucketTimeScale, endTimeBucket)
    }
  }

  dateToUTC (date) {
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds())
  }
}

export default new TimeService()
