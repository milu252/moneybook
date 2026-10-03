const {
  fetchProfile,
  getProfile,
  saveProfile,
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

function getProfileValidationMessage(validation) {
  if (!validation || !validation.hasInvalid) return ''

  const messages = []
  if (validation.nicknameInvalid) {
    messages.push(validation.nicknameMessage || '昵称未通过审核')
  }
  if (validation.avatarInvalid) {
    messages.push(validation.avatarMessage || '头像未通过审核')
  }
  return messages.join('，')
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
    this.avatarChanged = false
    this.originalNickname = profile.nickname || ''

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
    this.avatarChanged = true
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
    const nicknameChanged = nickname !== `${this.originalNickname || ''}`.trim()
    logger.info('profile_edit:save_click', {
      hasNickname: !!nickname,
      nicknameLength: nickname.length,
      nicknameChanged,
      avatar: this.data.avatar,
      avatarChanged: !!this.avatarChanged,
      avatarIsRemote: isRemoteAvatar(this.data.avatar),
      avatarIsDefault: this.data.avatar === this.data.defaultAvatar
    })

    if (nicknameChanged && !nickname) {
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
      const payload = {}
      let savedProfile
      if (nicknameChanged) {
        payload.nickname = nickname
      }

      if (this.avatarChanged) {
        const avatar = this.data.avatar || this.data.defaultAvatar
        if (avatar === this.data.defaultAvatar) {
          payload.avatarUrl = ''
          logger.info('profile_edit:avatar_submit_needed', {
            type: 'clear'
          })
        } else if (isRemoteAvatar(avatar)) {
          payload.avatarUrl = avatar
          logger.info('profile_edit:avatar_submit_needed', {
            type: 'url'
          })
        } else {
          const uploadedAvatar = await uploadAvatar(avatar)
          logger.info('profile_edit:avatar_submit_needed', {
            type: 'uploaded'
          })
          if (!nicknameChanged) {
            savedProfile = {
              ...saveProfile({ avatar: uploadedAvatar }),
              validation: { hasInvalid: false }
            }
          }
        }
      } else {
        logger.info('profile_edit:avatar_submit_skip', {
          reason: 'avatar_unchanged'
        })
      }

      if (Object.keys(payload).length > 0) {
        savedProfile = await updateRemoteProfile(payload)
      }
      if (!savedProfile) {
        savedProfile = {
          ...getProfile(),
          validation: { hasInvalid: false }
        }
      }
      logger.info('profile_edit:save_success', {
        id: savedProfile.id,
        hasNickname: !!savedProfile.nickname,
        avatar: savedProfile.avatar,
        validation: savedProfile.validation
      })

      const validationMessage = getProfileValidationMessage(savedProfile.validation)
      if (validationMessage) {
        logger.warn('profile_edit:validation_rejected', {
          requestedLength: nickname.length,
          confirmedLength: `${savedProfile.nickname || ''}`.length,
          validation: savedProfile.validation
        })
        this.profileDirty = false
        this.avatarChanged = false
        this.originalNickname = savedProfile.nickname || ''
        this.setData({
          nickname: savedProfile.nickname,
          avatar: savedProfile.avatar || this.data.defaultAvatar,
          saving: false
        })
        wx.showModal({
          title: '保存未完成',
          content: validationMessage,
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }

      this.profileDirty = false
      this.avatarChanged = false
      this.originalNickname = savedProfile.nickname || nickname
    } catch (error) {
      logger.error('profile_edit:save_failed', {
        hasNickname: !!nickname,
        avatar: this.data.avatar,
        error
      })
      console.error('save profile failed', error)
      this.setData({ saving: false })
      if (error && error.isProfileValidation) {
        const profile = error.profile || {}
        this.avatarChanged = false
        this.setData({
          avatar: profile.avatar || this.data.defaultAvatar
        })
        wx.showModal({
          title: '头像未通过审核',
          content: error.message || '请更换头像后重试',
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        wx.showToast({
          title: (error && error.message) || '保存失败，请重试',
          icon: 'none'
        })
      }
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
