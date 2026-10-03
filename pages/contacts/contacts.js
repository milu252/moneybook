const { getContactGroups, getContacts } = require('../../data/contacts')
const { fetchRecords, loadCachedRecords } = require('../../data/records')
const { track } = require('../../utils/analytics')

const groupOrder = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')
const fallbackGroupLetter = '#'
const searchTrackDelay = 500

function compareGroupLetter(left, right) {
  const fallbackIndex = groupOrder.indexOf(fallbackGroupLetter)
  const leftIndex = groupOrder.indexOf(left)
  const rightIndex = groupOrder.indexOf(right)
  return (leftIndex === -1 ? fallbackIndex : leftIndex) - (rightIndex === -1 ? fallbackIndex : rightIndex)
}

function sortContactGroups(sourceGroups) {
  return sourceGroups
    .map((group) => ({
      ...group,
      contacts: [...group.contacts].sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
    }))
    .sort((left, right) => compareGroupLetter(left.letter, right.letter))
}

Page({
  data: {
    keyword: '',
    contactGroups: [],
    suggestions: [],
    showSuggestions: false,
    total: 0
  },

  onLoad() {
    loadCachedRecords()
    this.refreshContacts()
  },

  async onShow() {
    track('contacts_page_view')

    this.refreshContacts()
    await fetchRecords()
    this.refreshContacts()
  },

  refreshContacts() {
    const contacts = getContacts()

    this.setData({
      contactGroups: sortContactGroups(getContactGroups()),
      suggestions: this.buildSuggestions(this.data.keyword, contacts),
      total: contacts.length
    })
  },

  buildSuggestions(keyword, sourceContacts = getContacts()) {
    const value = `${keyword || ''}`.trim()
    if (!value) return []

    return sourceContacts
      .filter((contact) => (
        contact.name.includes(value) ||
        `${contact.count}`.includes(value)
      ))
      .slice(0, 6)
  },

  updateKeyword(event) {
    const keyword = event.detail.value.trim()
    const suggestions = this.buildSuggestions(keyword)

    this.setData({
      keyword,
      suggestions,
      showSuggestions: Boolean(keyword)
    })

    if (this.searchTrackTimer) clearTimeout(this.searchTrackTimer)
    if (!keyword) return

    this.searchTrackTimer = setTimeout(() => {
      track('contacts_search', {
        has_result: suggestions.length > 0
      })
    }, searchTrackDelay)
  },

  chooseSuggestion(event) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    this.setData({ showSuggestions: false })
    this.navigateContactDetail(id)
  },

  openSuggestions() {
    if (!this.data.keyword) return
    this.setData({ showSuggestions: true })
  },

  closeSuggestions() {
    if (!this.data.showSuggestions) return
    this.setData({ showSuggestions: false })
  },

  noop() {},

  goContactDetail(event) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    track('contact_detail_click')

    this.navigateContactDetail(id)
  },

  navigateContactDetail(id) {
    if (!id) return

    wx.navigateTo({
      url: `/pages/contacts/detail/detail?id=${id}`
    })
  },

  clearKeyword() {
    if (this.searchTrackTimer) clearTimeout(this.searchTrackTimer)

    this.setData({
      keyword: '',
      suggestions: [],
      showSuggestions: false
    })
  }
})
