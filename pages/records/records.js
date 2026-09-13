const { records, getYearGroups, fetchRecords, loadCachedRecords } = require('../../data/records')
const { track } = require('../../utils/analytics')

const typeOptions = [
  { label: '全部', value: 'all' },
  { label: '礼金', value: 'cash' },
  { label: '礼物', value: 'gift' },
  { label: '请客', value: 'meal' }
]

const sortOptions = [
  { label: '正序', value: 'asc', displayLabel: '正序' },
  { label: '倒序', value: 'desc', displayLabel: '倒序' }
]

function sortByDate(sourceRecords, direction) {
  return sourceRecords
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const dateCompare = direction === 'asc'
        ? left.record.fullDate.localeCompare(right.record.fullDate)
        : right.record.fullDate.localeCompare(left.record.fullDate)
      if (dateCompare !== 0) return dateCompare

      const timeCompare = compareRecordCreateTime(left.record, right.record, direction)
      return timeCompare || left.index - right.index
    })
    .map((item) => item.record)
}

function getRecordCreateTime(record) {
  const timeValue = record.createdAt || record.created_at || record.createTime || record.create_time || ''
  const timestamp = Date.parse(timeValue)
  if (!Number.isNaN(timestamp)) return timestamp

  const numericId = Number(record.id)
  if (!Number.isNaN(numericId)) return numericId

  return `${record.id || ''}`
}

function compareRecordCreateTime(leftRecord, rightRecord, direction) {
  const leftTime = getRecordCreateTime(leftRecord)
  const rightTime = getRecordCreateTime(rightRecord)
  const compare = typeof leftTime === 'number' && typeof rightTime === 'number'
    ? leftTime - rightTime
    : `${leftTime}`.localeCompare(`${rightTime}`)

  return direction === 'asc' ? compare : -compare
}

Page({
  data: {
    typeOptions,
    sortOptions,
    selectedType: 'all',
    selectedTypeLabel: '全部',
    typeDropdownOpen: false,
    selectedSort: 'desc',
    sortDropdownOpen: false,
    sortLabel: '倒序',
    yearGroups: []
  },

  onLoad() {
    loadCachedRecords()
    this.refreshRecords()
  },

  async onShow() {
    track('records_page_view')

    this.refreshRecords()
    await fetchRecords()
    this.refreshRecords()
  },

  getSourceRecords() {
    return records
  },

  refreshRecords() {
    const sourceRecords = this.getSourceRecords()
    const filteredRecords = this.data.selectedType === 'all'
      ? sourceRecords
      : sourceRecords.filter((record) => record.typeKey === this.data.selectedType)
    const sortedRecords = sortByDate(filteredRecords, this.data.selectedSort)

    this.setData({
      yearGroups: getYearGroups(sortedRecords)
    })
  },

  toggleTypeDropdown() {
    this.setData({
      typeDropdownOpen: !this.data.typeDropdownOpen,
      sortDropdownOpen: false
    })
  },

  toggleSortDropdown() {
    this.setData({
      sortDropdownOpen: !this.data.sortDropdownOpen,
      typeDropdownOpen: false
    })
  },

  closeTypeDropdown() {
    if (!this.data.typeDropdownOpen && !this.data.sortDropdownOpen) return
    this.setData({
      typeDropdownOpen: false,
      sortDropdownOpen: false
    })
  },

  noop() {},

  selectType(event) {
    const value = event.detail.value
    const selectedOption = typeOptions.find((item) => item.value === value) || typeOptions[0]

    this.setData({
      selectedType: value,
      selectedTypeLabel: selectedOption.label,
      typeDropdownOpen: false,
      sortDropdownOpen: false
    }, () => {
      this.refreshRecords()
    })
  },

  selectSort(event) {
    const value = event.detail.value
    const selectedOption = sortOptions.find((item) => item.value === value) || sortOptions[1]

    this.setData({
      selectedSort: selectedOption.value,
      sortLabel: selectedOption.displayLabel,
      typeDropdownOpen: false,
      sortDropdownOpen: false
    }, () => {
      this.refreshRecords()
    })
  },

  goRecordDetail(event) {
    const id = event.detail.id
    wx.navigateTo({
      url: `/pages/records/detail/detail?id=${id}&from=records`
    })
  }
})
