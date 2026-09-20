const { ensureToken } = require('./utils/auth')
const { track } = require('./utils/analytics')
const logger = require('./utils/logger')

App({
  onLaunch(options) {
    logger.init()

    track('mini_program_launch_uv', {
      scene: options && options.scene ? options.scene : ''
    })

    ensureToken().catch((error) => {
      logger.error('auth:initial_login_failed', error)
      console.error('initial login failed', error)
    })
  },

  onHide() {
    track('mini_program_end')
  }
})
