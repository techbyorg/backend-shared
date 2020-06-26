import moment from 'moment'

class TimeService {
  getScaledTimeByTimeScale (timeScale, time) {
    if (time == null) { time = moment() }
    if (timeScale === 'day') {
      return 'DAY-' + time.format('YYYY-MM-DD')
    } else if (timeScale === 'biweek') {
      return 'BIWEEK-' + time.format('GGGG') + (parseInt(time.format('GGGG-WW')) / 2)
    } else if (timeScale === 'week') {
      return 'WEEK-' + time.format('GGGG-WW')
    } else if (timeScale === 'month') {
      return 'MONTH-' + time.format('YYYY-MM')
    } else { // minute
      return time.format(time.format('YYYY-MM-DD HH:mm'))
    }
  }

  getPreviousTimeByTimeScale (timeScale, time) {
    if (time == null) { time = moment() }
    if (timeScale === 'day') {
      time.subtract(1, 'days')
      return 'DAY-' + time.format('YYYY-MM-DD')
    } else if (timeScale === 'biweek') {
      time.subtract(2, 'weeks')
      return 'BIWEEK-' + time.format('GGGG') + (parseInt(time.format('GGGG-WW')) / 2)
    } else if (timeScale === 'week') {
      time.subtract(1, 'weeks')
      return 'WEEK-' + time.format('GGGG-WW')
    } else if (timeScale === 'month') {
      time.subtract(1, 'months')
      return 'MONTH-' + time.format('YYYY-MM')
    } else {
      time.subtract(1, 'minutes')
      return time.format(time.format('YYYY-MM-DD HH:mm'))
    }
  }
}

export default new TimeService()
