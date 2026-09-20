const { ensureToken } = require('./utils/auth')
const { fetchProfile } = require('./data/profile')
const { get, buildUrl } = require('./utils/request')
const { track } = require('./utils/analytics')
const logger = require('./utils/logger')

const SHARE_STORAGE_KEY = 'moneybook_share_config'
const DEFAULT_SHARE_TITLE = '随礼日记-记录人情往来'
const DEFAULT_SHARE_PATH = '/pages/index/index'

function normalizeShareConfig(config) {
  const imageUrl = config && (config.image_url || config.imageUrl)

  return {
    title: config && config.title ? config.title : DEFAULT_SHARE_TITLE,
    path: config && config.path ? config.path : DEFAULT_SHARE_PATH,
    imageUrl: imageUrl ? buildUrl(imageUrl) : ''
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

App({
  onLaunch(options) {
    logger.init()

    track('mini_program_launch_uv', {
      scene: options && options.scene ? options.scene : ''
    })

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

  onHide() {
    track('mini_program_end')
  }
})
