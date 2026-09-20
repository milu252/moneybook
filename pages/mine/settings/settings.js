const { del } = require('../../../utils/request')
const { ensureToken, clearToken } = require('../../../utils/auth')
const { records } = require('../../../data/records')
const { track } = require('../../../utils/analytics')

Page({
  data: {
    showClearCacheDialog: false,
    showCancelAccountDialog: false,
    showCancelAccountSecondDialog: false,
    showCancelAccountSuccessDialog: false,
    showCancelAccountToast: false,
    cancelingAccount: false,
    sections: [
      {
        title: '缓存管理',
        items: [
          { key: 'clear-cache', label: '清除缓存' }
        ]
      },
      {
        title: '法律条款',
        items: [
          { key: 'agreement', label: '用户协议' },
          { key: 'privacy', label: '隐私政策' }
        ]
      },
      {
        title: '账号管理',
        items: [
          { key: 'cancel-account', label: '注销账号' }
        ]
      }
    ]
  },

  handleSettingTap(event) {
    const key = event.currentTarget.dataset.key
    const label = event.currentTarget.dataset.label

    if (key === 'clear-cache') {
      this.setData({ showClearCacheDialog: true })
      return
    }

    if (key === 'cancel-account') {
      track('account_delete_click')
      this.setData({ showCancelAccountDialog: true })
      return
    }

    if (key === 'agreement') {
      wx.navigateTo({
        url: '/pages/mine/settings/agreement/agreement'
      })
      return
    }

    if (key === 'privacy') {
      wx.navigateTo({
        url: '/pages/mine/settings/privacy/privacy'
      })
      return
    }

    wx.showToast({
      title: `${label}待接入`,
      icon: 'none'
    })
  },

  closeClearCacheDialog() {
    this.setData({ showClearCacheDialog: false })
  },

  confirmClearCache() {
    wx.clearStorageSync()
    this.setData({ showClearCacheDialog: false })
    wx.showToast({
      title: '缓存已清除',
      icon: 'none'
    })
  },

  closeCancelAccountDialog() {
    this.setData({ showCancelAccountDialog: false })
  },

  openCancelAccountSecondDialog() {
    track('account_delete_first_confirm_click')

    this.setData({
      showCancelAccountDialog: false,
      showCancelAccountSecondDialog: true
    })
  },

  closeCancelAccountSecondDialog() {
    if (this.data.cancelingAccount) return
    this.setData({ showCancelAccountSecondDialog: false })
  },

  async confirmCancelAccount() {
    if (this.data.cancelingAccount) return
    track('account_delete_second_confirm_click')

    this.setData({
      cancelingAccount: true,
      showCancelAccountSecondDialog: false,
      showCancelAccountToast: true
    })

    try {
      await this.deleteRemoteAccount()
      track('account_delete_success')
      this.clearAccountLocalData()

      setTimeout(() => {
        this.setData({
          showCancelAccountToast: false,
          cancelingAccount: false,
          showCancelAccountSuccessDialog: true
        })
      }, 1200)
    } catch (error) {
      console.error('cancel account failed', error)
      this.setData({
        showCancelAccountToast: false,
        cancelingAccount: false
      })
      wx.showToast({
        title: '注销失败，请重试',
        icon: 'none'
      })
    }
  },

  async deleteRemoteAccount() {
    await this.requestWithAccountRetry(() => del('/account'))
  },

  async requestWithAccountRetry(requester) {
    await ensureToken()

    try {
      return await requester()
    } catch (error) {
      if (!error || (error.statusCode !== 401 && error.statusCode !== 403)) throw error

      await ensureToken(true)
      return requester()
    }
  },

  clearAccountLocalData() {
    try {
      wx.clearStorageSync()
    } catch (error) {}

    clearToken()
    records.splice(0, records.length)
  },

  finishCancelAccount() {
    this.setData({ showCancelAccountSuccessDialog: false })
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
