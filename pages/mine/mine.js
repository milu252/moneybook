const { getProfile } = require('../../data/profile')
const { track } = require('../../utils/analytics')
const logger = require('../../utils/logger')

const initialProfile = getProfile()
const DEFAULT_SHARE_TITLE = '随礼日记-记录人情往来'
const DEFAULT_SHARE_PATH = '/pages/index/index'
const DEFAULT_SHARE_IMAGES = [
  '/assets/share/money_book.jpg',
  '/assets/share/my_daily_note.jpg'
]

function buildShareMessage() {
  const imageCandidates = DEFAULT_SHARE_IMAGES
    .filter((imageUrl, index, source) => imageUrl && source.indexOf(imageUrl) === index)
  const message = {
    title: DEFAULT_SHARE_TITLE,
    path: DEFAULT_SHARE_PATH
  }

  if (imageCandidates.length) {
    message.imageUrl = imageCandidates[Math.floor(Math.random() * imageCandidates.length)]
  }

  return message
}

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
    return buildShareMessage()
  }
})
