const { records, getYearGroups, fetchRecords, loadCachedRecords } = require('../../../data/records')
const { track } = require('../../../utils/analytics')

const categories = {
  cash: '礼金',
  gift: '礼物',
  meal: '请客'
}

function sortByDateDesc(sourceRecords) {
  return sourceRecords
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const dateCompare = right.record.fullDate.localeCompare(left.record.fullDate)
      return dateCompare || left.index - right.index
    })
    .map((item) => item.record)
}

function filterRecords(type, period) {
  return records.filter((record) => {
    if (record.typeKey !== type) return false
    if (period.length === 7) return record.fullDate.slice(0, 7) === period
    return record.year === period
  })
}

Page({
  data: {
    yearGroups: []
  },

  async onLoad(options) {
    const type = categories[options.type] ? options.type : 'cash'
    const period = options.period || ''
    this._filterType = type
    this._filterPeriod = period
    track('stats_records_page_view', {
      record_type: type
    })
    loadCachedRecords()
    this.refreshList()

    await fetchRecords()
    this.refreshList()
  },

  async onShow() {
    if (!this._filterType || !this._filterPeriod) return
    if (!this._hasShownOnce) {
      this._hasShownOnce = true
      return
    }

    this.refreshList()
    await fetchRecords()
    this.refreshList()
  },

  refreshList() {
    const filteredRecords = sortByDateDesc(filterRecords(this._filterType, this._filterPeriod))
    this.setData({ yearGroups: getYearGroups(filteredRecords) })
  },

  goRecordDetail(event) {
    const id = event.detail.id
    wx.navigateTo({
      url: `/pages/records/detail/detail?id=${id}&from=stats_records`
    })
  }
})
