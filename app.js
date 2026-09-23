const { ensureToken } = require('./utils/auth')
const { fetchProfile } = require('./data/profile')
const { get, buildUrl } = require('./utils/request')
const { track } = require('./utils/analytics')
const logger = require('./utils/logger')

const SHARE_STORAGE_KEY = 'moneybook_share_config'
const DEFAULT_SHARE_TITLE = '随礼日记-记录人情往来'
const DEFAULT_SHARE_PATH = '/pages/index/index'

function normalizeShareConfig(config) {
  const imageUrls = []
  const remoteImageUrls = config && (config.image_urls || config.imageUrls)
  const remoteImageUrl = config && (config.image_url || config.imageUrl)

  if (Array.isArray(remoteImageUrls)) {
    remoteImageUrls.forEach((url) => {
      if (url) imageUrls.push(buildUrl(url))
    })
  }

  if (remoteImageUrl) {
    imageUrls.push(buildUrl(remoteImageUrl))
  }

  return {
    title: config && config.title ? config.title : DEFAULT_SHARE_TITLE,
    path: config && config.path ? config.path : DEFAULT_SHARE_PATH,
    imageUrl: imageUrls[0] || '',
    imageUrls
  }
}

function saveShareConfig(config) {
  wx.setStorageSync(SHARE_STORAGE_KEY, normalizeShareConfig(config))
}

function fetchShareConfig() {
  return get('/share/config').then((config) => {
    saveShareConfig(config)
    logger.info('share:config_fetch_success', {
      responseKeys: config ? Object.keys(config) : []
    })
  })
}

function syncLoginData() {
  return Promise.all([
    fetchProfile().catch((error) => {
      logger.error('profile:login_fetch_failed', error)
      console.error('fetch login profile failed', error)
    }),
    fetchShareConfig().catch((error) => {
      logger.warn('share:login_config_fetch_failed', error)
      console.error('fetch login share config failed', error)
    })
  ])
}

let foregroundStartTime = 0

App({
  onLaunch() {
    logger.init()

    ensureToken()
      .then((hasLoggedIn) => {
        if (hasLoggedIn) return syncLoginData()
        return null
      })
      .catch((error) => {
        logger.error('auth:initial_login_failed', error)
        console.error('initial login failed', error)
      })
  },

  onShow(options) {
    foregroundStartTime = Date.now()

    track('mini_program_open', {
      scene: options && options.scene ? options.scene : ''
    })
  },

  onHide() {
    if (!foregroundStartTime) return

    track('mini_program_hide', {
      mini_program_duration_ms: Date.now() - foregroundStartTime
    })
    foregroundStartTime = 0
  }
})
