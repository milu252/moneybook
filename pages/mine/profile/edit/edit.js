const {
  fetchProfile,
  getProfile,
  updateRemoteProfile,
  uploadAvatar
} = require('../../../../data/profile')
const logger = require('../../../../utils/logger')

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
        logger.error('profile_edit:fetch_failed', error)
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
    logger.warn('profile_edit:avatar_load_failed', {
      avatar: this.data.avatar
    })
    this.setData({
      avatar: this.data.defaultAvatar
    })
  },

  chooseAvatar(event) {
    const avatarUrl = event.detail && event.detail.avatarUrl
    if (!avatarUrl) {
      logger.warn('profile_edit:choose_avatar_empty')
      return
    }
    logger.info('profile_edit:choose_avatar', {
      avatarUrl
    })
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
    logger.info('profile_edit:save_click', {
      hasNickname: !!nickname,
      nicknameLength: nickname.length,
      avatar: this.data.avatar,
      avatarIsRemote: isRemoteAvatar(this.data.avatar),
      avatarIsDefault: this.data.avatar === this.data.defaultAvatar
    })

    if (!nickname) {
      logger.warn('profile_edit:validation_blocked', {
        reason: 'missing_nickname'
      })
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
        logger.info('profile_edit:avatar_upload_needed', {
          avatar
        })
        avatar = await uploadAvatar(avatar)
      } else {
        logger.info('profile_edit:avatar_upload_skip', {
          avatar,
          reason: avatar === this.data.defaultAvatar ? 'default_avatar' : 'remote_avatar'
        })
      }

      const savedProfile = await updateRemoteProfile({
        nickname,
        avatarUrl: avatar === this.data.defaultAvatar ? '' : avatar
      })
      logger.info('profile_edit:save_success', {
        id: savedProfile.id,
        hasNickname: !!savedProfile.nickname,
        avatar: savedProfile.avatar
      })
      this.profileDirty = false
    } catch (error) {
      logger.error('profile_edit:save_failed', {
        hasNickname: !!nickname,
        avatar: this.data.avatar,
        error
      })
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
