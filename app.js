const { ensureToken } = require('./utils/auth')
const { fetchProfile } = require('./data/profile')
const { track, flushAnalytics } = require('./utils/analytics')
const logger = require('./utils/logger')

function syncLoginData() {
  return fetchProfile().catch((error) => {
    logger.error('profile:login_fetch_failed', error)
    console.error('fetch login profile failed', error)
  })
}

let foregroundStartTime = 0

App({
  onLaunch() {
    logger.init()

    ensureToken()
      .then((hasLoggedIn) => {
        // 首次启动时 onShow 会先触发，登录完成后再补发此前暂存的埋点。
        if (hasLoggedIn) {
          flushAnalytics()
          return syncLoginData()
        }
        flushAnalytics()
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
    // 网络失败或上次关闭时未发出的事件，会在重新回到前台后补发。
    flushAnalytics()
  },

  onHide() {
    if (!foregroundStartTime) return

    track('mini_program_hide', {
      mini_program_duration_ms: Date.now() - foregroundStartTime
    })
    foregroundStartTime = 0
  }
})
