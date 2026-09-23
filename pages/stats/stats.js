const { records, fetchRecords, loadCachedRecords } = require('../../data/records')
const { track } = require('../../utils/analytics')

const categories = [
  { key: 'cash', name: '礼金', receiveLabel: '收到礼金', sendLabel: '送出礼金', balanceLabel: '结余', unit: 'money' },
  { key: 'gift', name: '礼物', receiveLabel: '收到礼物', sendLabel: '送出礼物', balanceLabel: '结余', unit: 'count' },
  { key: 'meal', name: '请客', receiveLabel: '收到请客', sendLabel: '送出请客', balanceLabel: '结余', unit: 'count' }
]

function amountOf(record) {
  const value = Number.parseFloat(record.value)
  return Number.isNaN(value) ? 0 : value
}

function formatValue(value, unit, withSign = false) {
  if (unit === 'money') {
    const absValue = Math.abs(Math.round(value))
    const prefix = withSign && value < 0 ? '-¥' : '¥'
    return `${prefix}${absValue}`
  }
  const prefix = withSign && value < 0 ? '-' : ''
  return `${prefix}${Math.abs(value)}`
}

function createEmptyPeriod(label) {
  return {
    label,
    key: label,
    receive: 0,
    send: 0
  }
}

function addRecordToPeriod(period, record, category) {
  if (category.unit === 'money') {
    const amount = amountOf(record)
    if (amount >= 0) {
      period.receive += amount
    } else {
      period.send += Math.abs(amount)
    }
    return
  }

  if (record.valueClass === 'expense') {
    period.send += 1
  } else {
    period.receive += 1
  }
}

function formatPeriodStats(periods, category) {
  return periods.map((item) => {
    const balance = item.receive - item.send
    return {
      ...item,
      balance,
      receiveText: formatValue(item.receive, category.unit),
      sendText: formatValue(item.send, category.unit),
      balanceText: formatValue(balance, category.unit, true),
      balanceClass: balance < 0 ? 'expense' : 'orange'
    }
  })
}

function getNiceChartMax(maxValue, unit) {
  if (unit !== 'money') {
    return Math.max(4, Math.ceil(maxValue))
  }

  if (maxValue <= 0) return 500

  const roughStep = maxValue / 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const normalized = roughStep / magnitude
  let niceStep = 10

  if (normalized <= 1) {
    niceStep = 1
  } else if (normalized <= 2) {
    niceStep = 2
  } else if (normalized <= 5) {
    niceStep = 5
  }

  return niceStep * magnitude * 4
}

function buildPeriods(filtered, category, selectedYear) {
  const periodMap = {}
  const useMonth = selectedYear !== 'all'

  filtered.forEach((record) => {
    if (useMonth && record.year !== selectedYear) return

    const periodKey = useMonth ? record.fullDate.slice(0, 7) : record.year
    const periodLabel = useMonth ? record.fullDate.slice(0, 7).replace('-', '.') : record.year

    if (!periodMap[periodKey]) {
      periodMap[periodKey] = createEmptyPeriod(periodLabel)
      periodMap[periodKey].key = periodKey
    }

    addRecordToPeriod(periodMap[periodKey], record, category)
  })

  return Object.keys(periodMap)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => periodMap[key])
}

function buildChartStats(periods, category, selectedYear) {
  const chartHeight = 300
  const chartGroupWidth = 132
  const chartVisibleCount = Math.min(4, Math.max(1, periods.length))
  const maxValue = Math.max(1, ...periods.flatMap((item) => [item.receive, item.send]))
  const chartMax = getNiceChartMax(maxValue, category.unit)
  const yLabels = [4, 3, 2, 1, 0].map((step) => ({
    label: `${Math.round((chartMax / 4) * step)}`,
    top: Math.round(chartHeight - (chartHeight / 4) * step)
  }))
  const chartData = periods.map((item) => ({
    label: item.label,
    hasReceive: item.receive > 0,
    hasSend: item.send > 0,
    receiveHeight: item.receive > 0 ? Math.max(4, Math.round((item.receive / chartMax) * chartHeight)) : 0,
    sendHeight: item.send > 0 ? Math.max(4, Math.round((item.send / chartMax) * chartHeight)) : 0
  }))
  const chartScrollable = chartData.length > 4

  return {
    yLabels,
    chartData,
    chartScrollable,
    chartCountClass: `count-${chartData.length}`,
    chartGroupWidth,
    chartViewportWidth: chartVisibleCount * chartGroupWidth,
    chartScrollWidth: Math.max(chartVisibleCount * chartGroupWidth, chartData.length * chartGroupWidth)
  }
}

function buildYearFilterOptions(filtered) {
  const years = Array.from(new Set(filtered.map((record) => record.year))).sort((a, b) => a.localeCompare(b))
  return [
    { label: '全部年份', value: 'all' },
    ...years.map((year) => ({ label: year, value: year }))
  ]
}

function buildStats(activeKey, selectedYear = 'all') {
  const category = categories.find((item) => item.key === activeKey) || categories[0]
  const filtered = records.filter((record) => record.typeKey === category.key)
  const yearMap = {}
  const people = new Set()

  filtered.forEach((record) => {
    if (!yearMap[record.year]) {
      yearMap[record.year] = {
        year: record.year,
        receive: 0,
        send: 0
      }
    }

    people.add(record.name)
    addRecordToPeriod(yearMap[record.year], record, category)
  })

  const yearStats = formatPeriodStats(
    Object.keys(yearMap).sort((a, b) => a.localeCompare(b)).map((key) => yearMap[key]),
    category
  )

  const receiveTotal = yearStats.reduce((sum, item) => sum + item.receive, 0)
  const sendTotal = yearStats.reduce((sum, item) => sum + item.send, 0)
  const balanceTotal = receiveTotal - sendTotal
  const periodStats = formatPeriodStats(buildPeriods(filtered, category, selectedYear), category)
  const chartStats = buildChartStats(periodStats, category, selectedYear)

  return {
    category,
    chartFilterOptions: buildYearFilterOptions(filtered),
    selectedYearLabel: selectedYear === 'all' ? '全部年份' : selectedYear,
    recordTableFirstColumn: selectedYear === 'all' ? '年份' : '月份',
    summary: {
      receiveText: formatValue(receiveTotal, category.unit),
      sendText: formatValue(sendTotal, category.unit),
      balanceText: formatValue(balanceTotal, category.unit, true),
      balanceClass: balanceTotal < 0 ? 'expense' : 'orange',
      countText: `${filtered.length}`,
      peopleText: `${people.size}`
    },
    yLabels: chartStats.yLabels,
    chartData: chartStats.chartData,
    chartScrollable: chartStats.chartScrollable,
    chartCountClass: chartStats.chartCountClass,
    chartGroupWidth: chartStats.chartGroupWidth,
    chartViewportWidth: chartStats.chartViewportWidth,
    chartScrollWidth: chartStats.chartScrollWidth,
    periodStats
  }
}

Page({
  data: {
    categories,
    activeCategory: 'cash',
    selectedYear: 'all',
    chartFilterOpen: false,
    stats: buildStats('cash', 'all')
  },

  onLoad(options) {
    loadCachedRecords()
    const activeCategory = categories.some((item) => item.key === options.type) ? options.type : 'cash'
    this.setData({
      activeCategory,
      selectedYear: 'all',
      stats: buildStats(activeCategory, 'all')
    })
  },

  async onShow() {
    track('stats_page_view')

    this.setData({ stats: buildStats(this.data.activeCategory, this.data.selectedYear) })
    await fetchRecords()
    this.setData({ stats: buildStats(this.data.activeCategory, this.data.selectedYear) })
  },

  toggleChartFilter() {
    const willOpen = !this.data.chartFilterOpen
    if (willOpen) {
      track('stats_year_filter_click', {
        record_type: this.data.activeCategory
      })
    }

    this.setData({
      chartFilterOpen: willOpen
    })
  },

  closeChartFilter() {
    if (!this.data.chartFilterOpen) return
    this.setData({
      chartFilterOpen: false
    })
  },

  selectChartFilter(event) {
    const value = event.currentTarget.dataset.value
    track('stats_year_filter_option_click', {
      record_type: this.data.activeCategory,
      year: value
    })

    this.setData({
      selectedYear: value,
      chartFilterOpen: false,
      stats: buildStats(this.data.activeCategory, value)
    })
  },

  goStatsRecords(event) {
    const period = event.currentTarget.dataset.period
    if (!period) return
    track('stats_records_click', {
      record_type: this.data.activeCategory
    })

    wx.navigateTo({
      url: `/pages/stats/records/records?type=${this.data.activeCategory}&period=${period}`
    })
  },

  switchCategory(event) {
    const key = event.currentTarget.dataset.key
    if (!key || key === this.data.activeCategory) return
    track('stats_type_switch_click', {
      record_type: key
    })

    this.setData({
      activeCategory: key,
      selectedYear: 'all',
      chartFilterOpen: false,
      stats: buildStats(key, 'all')
    })
  }
})
