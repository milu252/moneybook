const { getContactDetail } = require('../../../data/contacts')
const { fetchRecords, loadCachedRecords } = require('../../../data/records')
const { track } = require('../../../utils/analytics')

const CREATE_START_TIME_STORAGE_KEY = 'record_create_start_time'

function truncateText(value, limit) {
  const text = `${value || ''}`
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function formatContactDetail(contact) {
  if (!contact) return contact

  return {
    ...contact,
    records: (contact.records || []).map((record) => ({
      ...record,
      displayScene: truncateText(record.scene, 7),
      // 联系人主页右侧的礼物/请客内容保留 8 个字，第 9 个字开始省略。
      displayValue: truncateText(record.value, 8)
    }))
  }
}

Page({
  data: {
    contact: null
  },

  onLoad(options) {
    this.contactId = options.id
    this.hadContactRecords = false
    loadCachedRecords()
    this.refreshContact()
    // onShow 会接管后续的网络刷新
  },

  async onShow() {
    this.refreshContact()
    await fetchRecords()
    const contact = this.refreshContact()
    if (this.shouldBackAfterEmptyContact(contact)) return
    track('contact_detail_view')
  },

  refreshContact() {
    const contact = formatContactDetail(getContactDetail(this.contactId))
    if (contact && (contact.records || []).length > 0) {
      this.hadContactRecords = true
    }

    this.setData({
      contact
    })

    return contact
  },

  shouldBackAfterEmptyContact(contact) {
    if (!this.hadContactRecords) return false
    if (contact && (contact.records || []).length > 0) return false

    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return true
    }

    wx.redirectTo({
      url: '/pages/contacts/contacts'
    })
    return true
  },

  goRecordDetail(event) {
    const id = event.currentTarget.dataset.id
    const recordCount = this.data.contact && Array.isArray(this.data.contact.records)
      ? this.data.contact.records.length
      : 0
    wx.navigateTo({
      url: `/pages/records/detail/detail?id=${id}&from=contact_detail&contact_record_count=${recordCount}`
    })
  },

  editContact() {
    if (!this.data.contact) return

    wx.navigateTo({
      url: `/pages/contacts/edit/edit?id=${this.data.contact.id}`
    })
  },

  addRecord() {
    if (!this.data.contact) return

    try {
      wx.setStorageSync(CREATE_START_TIME_STORAGE_KEY, Date.now())
    } catch (error) {}

    wx.navigateTo({
      url: `/pages/create/edit/edit?from=contact&name=${encodeURIComponent(this.data.contact.name)}`
    })
  }
})
