const { get, patch, post, buildUrl } = require('../utils/request')
const { ensureToken } = require('../utils/auth')
const logger = require('../utils/logger')

const PROFILE_STORAGE_KEY = 'moneybook_profile'

const defaultProfile = {
  nickname: '微信用户',
  id: '00000000',
  avatar: '/assets/icons/default-avatar.svg'
}

function hasOwn(source, key) {
  return !!source && Object.prototype.hasOwnProperty.call(source, key)
}

function getStoredProfile() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return {}

  try {
    const profile = wx.getStorageSync(PROFILE_STORAGE_KEY)
    return profile && typeof profile === 'object' ? profile : {}
  } catch (error) {
    return {}
  }
}

function getProfile() {
  const profile = {
    ...defaultProfile,
    ...getStoredProfile()
  }
  if (profile.nickname === '我微信用户') profile.nickname = defaultProfile.nickname
  return profile
}

function saveProfile(profile) {
  const nextProfile = {
    ...getProfile(),
    ...profile
  }
  delete nextProfile.phone

  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync(PROFILE_STORAGE_KEY, nextProfile)
  }

  return nextProfile
}

function normalizeRemoteProfile(profile) {
  const fallback = getProfile()
  const source = profile && profile.profile ? profile.profile : profile
  return {
    id: source && source.id ? String(source.id) : fallback.id,
    nickname: source && source.nickname ? source.nickname : fallback.nickname,
    avatar: hasOwn(source, 'avatar_url')
      ? (source.avatar_url ? buildUrl(source.avatar_url) : defaultProfile.avatar)
      : fallback.avatar
  }
}

function getFieldMessage(source, fieldNames) {
  if (!source || typeof source !== 'object') return ''

  const containers = [
    source.invalid_fields,
    source.errors,
    source.field_errors,
    source.validation_errors
  ]

  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i]
    if (!container) continue

    if (Array.isArray(container)) {
      const matched = container.find((item) => fieldNames.indexOf(item) !== -1)
      if (matched) return ''
      continue
    }

    if (typeof container === 'object') {
      for (let j = 0; j < fieldNames.length; j += 1) {
        const value = container[fieldNames[j]]
        if (value) return Array.isArray(value) ? value.join('，') : `${value}`
      }
    }
  }

  for (let i = 0; i < fieldNames.length; i += 1) {
    const field = fieldNames[i]
    const message = source[`${field}_error`] || source[`${field}_message`]
    if (message) return `${message}`
  }

  return ''
}

function getResponseMessage(source) {
  if (!source || typeof source !== 'object') return ''
  const message = source.message || source.error
  return typeof message === 'string' ? message : ''
}

function hasInvalidField(source, fieldNames) {
  if (!source || typeof source !== 'object') return false

  const invalidFields = source.invalid_fields
  if (Array.isArray(invalidFields)) {
    return fieldNames.some((field) => invalidFields.indexOf(field) !== -1)
  }
  if (invalidFields && typeof invalidFields === 'object') {
    return fieldNames.some((field) => hasOwn(invalidFields, field))
  }

  return fieldNames.some((field) => {
    const camelField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    return source[`${field}_valid`] === false ||
      source[`${camelField}Valid`] === false ||
      !!source[`${field}_illegal`] ||
      !!source[`${camelField}Illegal`] ||
      !!source[`invalid_${field}`]
  })
}

function normalizeProfileUpdateResult(response) {
  const source = response && response.profile ? response.profile : response
  const profile = normalizeRemoteProfile(source)
  const validation = {
    nicknameInvalid: hasInvalidField(response, ['nickname']) || hasInvalidField(source, ['nickname']),
    avatarInvalid: hasInvalidField(response, ['avatar_url', 'avatar', 'avatar_file']) ||
      hasInvalidField(source, ['avatar_url', 'avatar', 'avatar_file']),
    nicknameMessage: getFieldMessage(response, ['nickname']) || getFieldMessage(source, ['nickname']),
    avatarMessage: getFieldMessage(response, ['avatar_url', 'avatar', 'avatar_file']) ||
      getFieldMessage(source, ['avatar_url', 'avatar', 'avatar_file'])
  }

  validation.hasInvalid = validation.nicknameInvalid || validation.avatarInvalid
  return {
    ...profile,
    validation
  }
}

function buildAvatarUploadPayload(filePath) {
  const fileSystem = wx.getFileSystemManager()
  const data = fileSystem.readFileSync(filePath, 'base64')
  const lowerPath = `${filePath || ''}`.toLowerCase()
  const contentType = lowerPath.endsWith('.png')
    ? 'image/png'
    : lowerPath.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg'

  return {
    filename: `${filePath || ''}`.split(/[\\/]/).pop() || 'avatar.jpg',
    content_type: contentType,
    data
  }
}

function createAvatarValidationError(response) {
  const source = response && response.profile ? response.profile : response
  const message = getFieldMessage(response, ['avatar_url', 'avatar', 'avatar_file']) ||
    getFieldMessage(source, ['avatar_url', 'avatar', 'avatar_file']) ||
    getResponseMessage(response) ||
    getResponseMessage(source) ||
    '头像未通过审核'
  const error = new Error(message)
  error.isProfileValidation = true
  error.profile = normalizeRemoteProfile(source)
  return error
}

async function fetchProfile() {
  await ensureToken()
  const remoteProfile = await get('/account/profile')
  const profile = normalizeRemoteProfile(remoteProfile)
  logger.info('profile:fetch_success', {
    responseKeys: remoteProfile ? Object.keys(remoteProfile) : [],
    id: profile.id,
    hasNickname: !!profile.nickname,
    avatar: profile.avatar
  })
  saveProfile(profile)
  return profile
}

async function updateRemoteProfile(profile) {
  await ensureToken()
  const payload = {}
  if (hasOwn(profile, 'nickname')) {
    payload.nickname = profile.nickname
  }
  if (hasOwn(profile, 'avatarUrl')) {
    payload.avatar_url = profile.avatarUrl || ''
  } else if (hasOwn(profile, 'avatar')) {
    payload.avatar_url = profile.avatar || ''
  }
  logger.info('profile:update_request_ready', {
    hasNickname: !!payload.nickname,
    nicknameLength: `${payload.nickname || ''}`.length,
    hasAvatarUrl: hasOwn(payload, 'avatar_url'),
    avatarUrl: payload.avatar_url || ''
  })
  let remoteProfile
  try {
    remoteProfile = await patch('/account/profile', payload)
  } catch (error) {
    if (!error || !error.data || typeof error.data !== 'object') throw error

    const failedResult = normalizeProfileUpdateResult(error.data)
    if (!failedResult.validation.hasInvalid) throw error

    logger.warn('profile:update_validation_failed', {
      statusCode: error.statusCode,
      responseKeys: Object.keys(error.data),
      validation: failedResult.validation
    })
    saveProfile({
      id: failedResult.id,
      nickname: failedResult.nickname,
      avatar: failedResult.avatar
    })
    return failedResult
  }

  const normalized = normalizeProfileUpdateResult(remoteProfile)
  logger.info('profile:update_response_received', {
    responseKeys: remoteProfile ? Object.keys(remoteProfile) : [],
    id: normalized.id,
    hasNickname: !!normalized.nickname,
    avatar: normalized.avatar,
    validation: normalized.validation
  })

  saveProfile({
    id: normalized.id,
    nickname: normalized.nickname,
    avatar: normalized.avatar
  })
  return normalized
}

async function uploadAvatar(filePath) {
  await ensureToken()

  const payload = buildAvatarUploadPayload(filePath)
  logger.info('profile_avatar:upload_start', {
    filename: payload.filename,
    contentType: payload.content_type
  })

  let result
  try {
    result = await post('/account/avatar', payload)
  } catch (error) {
    const response = error && error.data
    if (response && typeof response === 'object' &&
      (hasInvalidField(response, ['avatar_url', 'avatar', 'avatar_file']) ||
        getFieldMessage(response, ['avatar_url', 'avatar', 'avatar_file']) ||
        error.statusCode === 400 || error.statusCode === 422)) {
      throw createAvatarValidationError(response)
    }
    throw error
  }

  const source = result && result.profile ? result.profile : result
  if (hasInvalidField(result, ['avatar_url', 'avatar', 'avatar_file']) ||
    hasInvalidField(source, ['avatar_url', 'avatar', 'avatar_file']) ||
    getFieldMessage(result, ['avatar_url', 'avatar', 'avatar_file']) ||
    getFieldMessage(source, ['avatar_url', 'avatar', 'avatar_file']) ||
    (result && result.success === false)) {
    throw createAvatarValidationError(result)
  }

  const avatarUrl = source && source.avatar_url ? buildUrl(source.avatar_url) : ''
  if (!avatarUrl) {
    throw new Error('头像上传失败，请重试')
  }

  logger.info('profile_avatar:upload_success', {
    filename: payload.filename,
    avatarUrl,
    responseKeys: result ? Object.keys(result) : []
  })
  return avatarUrl
}

module.exports = {
  getProfile,
  saveProfile,
  fetchProfile,
  updateRemoteProfile,
  uploadAvatar
}
