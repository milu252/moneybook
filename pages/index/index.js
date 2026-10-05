const { records, fetchRecords, loadCachedRecords, refreshRecordDisplayNames } = require('../../data/records')
const { track } = require('../../utils/analytics')

const SHARE_TITLE = '随礼日记-记录人情往来'
const SHARE_PATH = '/pages/index/index'
const SHARE_IMAGES = [
  '/assets/share/money_book.jpg',
  '/assets/share/my_daily_note.jpg'
]

function getShareImage() {
  return SHARE_IMAGES[Math.floor(Math.random() * SHARE_IMAGES.length)]
}

function amountOf(record) {
  const value = Number.parseFloat(record.value)
  return Number.isNaN(value) ? 0 : value
}

function buildHomeSummary() {
  const summary = {
    cashReceive: 0,
    cashSend: 0,
    giftReceive: 0,
    giftSend: 0,
    mealReceive: 0,
    mealSend: 0
  }

  records.forEach((record) => {
    const isSend = record.valueClass === 'expense'

    if (record.typeKey === 'cash') {
      const amount = Math.abs(amountOf(record))
      if (isSend) {
        summary.cashSend += amount
      } else {
        summary.cashReceive += amount
      }
    } else if (record.typeKey === 'gift') {
      if (isSend) {
        summary.giftSend += 1
      } else {
        summary.giftReceive += 1
      }
    } else if (record.typeKey === 'meal') {
      if (isSend) {
        summary.mealSend += 1
      } else {
        summary.mealReceive += 1
      }
    }
  })

  return {
    cashReceive: `￥${Math.round(summary.cashReceive)}`,
    cashSend: `￥${Math.round(summary.cashSend)}`,
    giftReceive: `${summary.giftReceive}`,
    giftSend: `${summary.giftSend}`,
    mealReceive: `${summary.mealReceive}`,
    mealSend: `${summary.mealSend}`
  }
}

function sortRecordsByTime(sourceRecords) {
  return [...sourceRecords].sort((left, right) => {
    const dateCompare = `${right.fullDate || ''}`.localeCompare(`${left.fullDate || ''}`)
    if (dateCompare !== 0) return dateCompare
    return `${right.id || ''}`.localeCompare(`${left.id || ''}`)
  })
}

Page({
  data: {
    records: [],
    summary: buildHomeSummary()
  },

  onLoad() {
    if (typeof wx.showShareMenu === 'function') {
      wx.showShareMenu({
        menus: ['shareAppMessage', 'shareTimeline']
      })
    }

    // 读本地缓存，冷启动也能秒显数据
    loadCachedRecords()
    refreshRecordDisplayNames()
    this.refreshHome()
  },

  async onShow() {
    track('home_page_view')

    // 立即渲染内存中的缓存数据（避免空白等待）
    refreshRecordDisplayNames()
    this.refreshHome()
    // 后台拉取最新数据再次刷新
    await fetchRecords()
    refreshRecordDisplayNames()
    this.refreshHome()
  },

  refreshHome() {
    refreshRecordDisplayNames()
    this.setData({
      records: sortRecordsByTime(records).slice(0, 6),
      summary: buildHomeSummary()
    })
  },

  goAllRecords() {
    track('home_all_records_click')

    wx.navigateTo({
      url: '/pages/records/records'
    })
  },

  goRecordDetail(event) {
    const id = event.detail.id
    wx.navigateTo({
      url: `/pages/records/detail/detail?id=${id}&from=home`
    })
  },

  onShareAppMessage() {
    return {
      title: SHARE_TITLE,
      path: SHARE_PATH,
      imageUrl: getShareImage()
    }
  },

  onShareTimeline() {
    return {
      title: SHARE_TITLE,
      imageUrl: getShareImage()
    }
  }
})
