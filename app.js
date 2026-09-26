const { ensureToken } = require('./utils/auth')
const { fetchProfile } = require('./data/profile')
const { track } = require('./utils/analytics')
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
