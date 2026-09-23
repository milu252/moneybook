const { post } = require('../../../utils/request')
const { track } = require('../../../utils/analytics')

Page({
  data: {
    email: '2523369515@qq.com',
    feedbackTypes: [
      { key: 'feature', label: '功能建议' },
      { key: 'issue', label: '问题反馈' },
      { key: 'complaint', label: '投诉建议' },
      { key: 'other', label: '其他' }
    ],
    selectedType: '',
    bouncingType: '',
    content: '',
    contentCount: 0,
    showRequiredDialog: false,
    submitting: false
  },

  onShow() {
    track('feedback_page_view')
  },

  copyEmail() {
    wx.setClipboardData({
      data: this.data.email
    })
  },

  selectType(event) {
    const { key } = event.currentTarget.dataset
    this.setData({
      selectedType: this.data.selectedType === key ? '' : key,
      bouncingType: key
    })

    clearTimeout(this.typeBounceTimer)
    this.typeBounceTimer = setTimeout(() => {
      this.setData({ bouncingType: '' })
    }, 320)
  },

  updateContent(event) {
    const value = event.detail.value || ''

    if (value.length > 500) {
      wx.showToast({
        title: '请将内容控制在500字以内哦~',
        icon: 'none'
      })
      const content = value.slice(0, 500)
      this.setData({
        content,
        contentCount: content.length
      })
      return
    }

    this.setData({
      content: value,
      contentCount: value.length
    })
  },

  async submitFeedback() {
    if (this.data.submitting) return

    if (!this.data.selectedType || !this.data.content.trim()) {
      this.setData({ showRequiredDialog: true })
      return
    }

    this.setData({ submitting: true })

    try {
      await post('/feedback', {
        category: this.data.selectedType,
        content: this.data.content.trim()
      })
      track('feedback_submit_success', {
        feedback_type: this.data.selectedType
      })

      wx.showToast({ title: '提交反馈成功', icon: 'none', duration: 1500 })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  },

  closeRequiredDialog() {
    this.setData({ showRequiredDialog: false })
  }
})
