const { fetchProfile, getProfile } = require('../../data/profile')
const { track } = require('../../utils/analytics')
const logger = require('../../utils/logger')

const initialProfile = getProfile()

Page({
  data: {
    user: {
      name: initialProfile.nickname,
      id: initialProfile.id,
      avatar: initialProfile.avatar
    },
    pendingAvatar: '',
    defaultAvatar: '/assets/icons/default-avatar.svg',
    menuItems: [
      { key: 'share', label: '分享给好友', icon: 'share', iconSrc: '/assets/icons/mine-share.svg' },
      { key: 'about', label: '关于我们', icon: 'about', iconSrc: '/assets/icons/mine-about.svg' },
      { key: 'data', label: '数据管理', icon: 'data', iconSrc: '/assets/icons/mine-data.svg' },
      { key: 'feedback', label: '意见反馈', icon: 'feedback', iconSrc: '/assets/icons/mine-feedback.svg' },
      { key: 'settings', label: '系统设置', icon: 'settings', iconSrc: '/assets/icons/mine-settings.svg' }
    ]
  },

  onLoad() {
    this.refreshProfile()
  },

  onShow() {
    track('mine_page_view')
    this.refreshProfile()
    fetchProfile()
      .then((profile) => {
        logger.info('mine:profile_fetch_success', {
          id: profile.id,
          hasNickname: !!profile.nickname,
          avatar: profile.avatar
        })
        this.refreshProfile()
      })
      .catch((error) => {
        logger.error('mine:profile_fetch_failed', error)
        console.error('fetch profile failed', error)
      })
  },

  refreshProfile() {
    const profile = getProfile()
    const nextAvatar = profile.avatar || this.data.defaultAvatar
    const currentAvatar = this.data.user.avatar || this.data.defaultAvatar
    const shouldPreloadAvatar = nextAvatar !== currentAvatar
    logger.info('mine:profile_apply', {
      id: profile.id,
      hasNickname: !!profile.nickname,
      currentAvatar,
      nextAvatar,
      shouldPreloadAvatar
    })

    this.setData({
      user: {
        name: profile.nickname,
        id: profile.id,
        avatar: shouldPreloadAvatar ? this.data.defaultAvatar : nextAvatar
      },
      pendingAvatar: shouldPreloadAvatar ? nextAvatar : ''
    })
  },

  handleAvatarError() {
    logger.warn('mine:avatar_load_failed', {
      avatar: this.data.user.avatar
    })
    this.setData({
      'user.avatar': this.data.defaultAvatar,
      pendingAvatar: ''
    })
  },

  handlePendingAvatarLoad() {
    if (!this.data.pendingAvatar) return
    logger.info('mine:pending_avatar_load_success', {
      avatar: this.data.pendingAvatar
    })

    this.setData({
      'user.avatar': this.data.pendingAvatar,
      pendingAvatar: ''
    })
  },

  handlePendingAvatarError() {
    logger.warn('mine:pending_avatar_load_failed', {
      avatar: this.data.pendingAvatar
    })
    this.setData({
      pendingAvatar: ''
    })
  },

  editProfile() {
    track('profile_entry_click')

    wx.navigateTo({
      url: '/pages/mine/profile/edit/edit'
    })
  },

  handleMenuTap(event) {
    const key = event.currentTarget.dataset.key
    const label = event.currentTarget.dataset.label

    track('mine_menu_click', {
      menu_key: key
    })

    if (key === 'share') {
      return
    }

    if (key === 'about') {
      wx.navigateTo({
        url: '/pages/mine/about/about'
      })
      return
    }

    if (key === 'data') {
      wx.navigateTo({
        url: '/pages/mine/data/data'
      })
      return
    }

    if (key === 'feedback') {
      wx.navigateTo({
        url: '/pages/mine/feedback/feedback'
      })
      return
    }

    if (key === 'settings') {
      wx.navigateTo({
        url: '/pages/mine/settings/settings'
      })
      return
    }

    wx.showToast({
      title: `${label}待接入`,
      icon: 'none'
    })
  },

  onShareAppMessage() {
    return {
      title: 'moneyBook - 记录礼金、礼物和请客往来',
      path: '/pages/index/index'
    }
  }
})
