const {
  fetchProfile,
  getProfile,
  updateRemoteProfile,
  uploadAvatar
} = require('../../../../data/profile')

function isRemoteAvatar(avatar) {
  const value = `${avatar || ''}`.trim()
  if (!/^https?:\/\//.test(value)) return false

  // 微信头像选择器可能返回 http://tmp/... 之类的临时路径，不能当成可持久展示的远程地址。
  return !/^https?:\/\/tmp\//.test(value) && !/^https?:\/\/usr\//.test(value)
}

const initialProfile = getProfile()
const defaultAvatar = '/assets/icons/default-avatar.svg'

Page({
  data: {
    avatar: initialProfile.avatar || defaultAvatar,
    defaultAvatar,
    nickname: initialProfile.nickname,
    saving: false
  },

  onLoad() {
    this.refreshProfile()
  },

  onShow() {
    fetchProfile()
      .then((profile) => this.applyProfile(profile))
      .catch((error) => {
        console.error('fetch profile failed', error)
      })
  },

  refreshProfile() {
    const profile = getProfile()
    this.applyProfile(profile)
  },

  applyProfile(profile) {
    if (this.profileDirty) return

    this.setData({
      avatar: profile.avatar || this.data.defaultAvatar,
      nickname: profile.nickname
    })
  },

  handleAvatarError() {
    this.setData({
      avatar: this.data.defaultAvatar
    })
  },

  chooseAvatar(event) {
    const avatarUrl = event.detail && event.detail.avatarUrl
    if (!avatarUrl) return
    this.profileDirty = true
    this.setData({ avatar: avatarUrl })
  },

  updateNickname(event) {
    this.profileDirty = true
    this.setData({
      nickname: event.detail.value
    })
  },

  async saveProfile() {
    if (this.data.saving) return

    const nickname = this.data.nickname.trim()

    if (!nickname) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      })
      return
    }

    this.setData({ saving: true })

    try {
      let avatar = this.data.avatar || this.data.defaultAvatar
      if (avatar && avatar !== this.data.defaultAvatar && !isRemoteAvatar(avatar)) {
        avatar = await uploadAvatar(avatar)
      }

      await updateRemoteProfile({
        nickname,
        avatarUrl: avatar === this.data.defaultAvatar ? '' : avatar
      })
      this.profileDirty = false
    } catch (error) {
      console.error('save profile failed', error)
      this.setData({ saving: false })
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      })
      return
    }

    wx.showToast({
      title: '保存成功',
      icon: 'success'
    })

    setTimeout(() => {
      wx.navigateBack()
    }, 800)
  }
})
