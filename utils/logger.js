const LOG_DIR_NAME = 'logs'
const LOG_RETENTION_DAYS = 7
const MAX_LOG_FILE_SIZE = 512 * 1024
const MAX_SERIALIZED_LENGTH = 2000
const SENSITIVE_KEYS = ['token', 'authorization', 'openid', 'session_key', 'password']

let initialized = false
let fileSystem = null
let logDir = ''
let realtimeLogger = null

function getFileSystem() {
  if (typeof wx === 'undefined' || typeof wx.getFileSystemManager !== 'function') return null
  if (!fileSystem) fileSystem = wx.getFileSystemManager()
  return fileSystem
}

function getLogDir() {
  if (logDir) return logDir
  if (typeof wx === 'undefined' || !wx.env || !wx.env.USER_DATA_PATH) return ''
  logDir = `${wx.env.USER_DATA_PATH}/${LOG_DIR_NAME}`
  return logDir
}

function pad(value) {
  return `${value}`.padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getLogFilePath(date = new Date()) {
  const dir = getLogDir()
  return dir ? `${dir}/${formatDate(date)}.log` : ''
}

function ensureLogDir() {
  const fs = getFileSystem()
  const dir = getLogDir()
  if (!fs || !dir) return false

  try {
    fs.accessSync(dir)
    return true
  } catch (error) {}

  try {
    fs.mkdirSync(dir, true)
    return true
  } catch (error) {
    try {
      fs.mkdirSync(dir)
      return true
    } catch (innerError) {
      console.error('[logger] create log dir failed', innerError)
      return false
    }
  }
}

function safeStringify(value) {
  const seen = []

  try {
    const text = JSON.stringify(value, (key, currentValue) => {
      if (SENSITIVE_KEYS.includes(`${key}`.toLowerCase())) {
        return '[redacted]'
      }

      if (`${key}`.toLowerCase() === 'data' && typeof currentValue === 'string') {
        return '[data omitted]'
      }

      if (currentValue instanceof Error) {
        return normalizeError(currentValue)
      }

      if (typeof currentValue === 'string' && currentValue.length > MAX_SERIALIZED_LENGTH) {
        return `${currentValue.slice(0, MAX_SERIALIZED_LENGTH)}...[truncated]`
      }

      if (currentValue && typeof currentValue === 'object') {
        if (seen.includes(currentValue)) return '[circular]'
        seen.push(currentValue)
      }

      return currentValue
    })
    return text || ''
  } catch (error) {
    return JSON.stringify({
      serialization_error: error && error.message ? error.message : 'serialize failed'
    })
  }
}

function normalizeError(error) {
  if (!error) return error
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }
  return error
}

function buildEntry(level, event, data) {
  return {
    time: new Date().toISOString(),
    level,
    event,
    data: normalizeError(data)
  }
}

function consoleOutput(level, event, data) {
  if (typeof console === 'undefined') return
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
  const output = console && console[method] ? console[method] : console.log
  output.call(console, `[${level}] ${event}`, data)
}

function getRealtimeLogger() {
  if (realtimeLogger) return realtimeLogger
  if (typeof wx === 'undefined' || typeof wx.getRealtimeLogManager !== 'function') return null

  try {
    realtimeLogger = wx.getRealtimeLogManager()
    return realtimeLogger
  } catch (error) {
    return null
  }
}

function writeRealtime(level, event, data) {
  if (level !== 'error' && level !== 'warn') return

  const manager = getRealtimeLogger()
  if (!manager || typeof manager[level] !== 'function') return

  try {
    manager[level](event, data)
  } catch (error) {}
}

function rotateIfNeeded(path) {
  const fs = getFileSystem()
  if (!fs || !path) return

  try {
    const stat = fs.statSync(path)
    if (!stat || stat.size < MAX_LOG_FILE_SIZE) return

    const rotatedPath = `${path}.1`
    try { fs.unlinkSync(rotatedPath) } catch (error) {}
    fs.renameSync(path, rotatedPath)
  } catch (error) {}
}

function appendEntry(entry) {
  const fs = getFileSystem()
  const path = getLogFilePath()
  if (!fs || !path || !ensureLogDir()) return

  try {
    rotateIfNeeded(path)
    fs.appendFileSync(path, `${safeStringify(entry)}\n`, 'utf8')
  } catch (error) {
    console.error('[logger] append log failed', error)
  }
}

function listLogFiles() {
  const fs = getFileSystem()
  const dir = getLogDir()
  if (!fs || !dir) return []

  try {
    return fs.readdirSync(dir).map((name) => `${dir}/${name}`)
  } catch (error) {
    return []
  }
}

function clearOldLogs() {
  const fs = getFileSystem()
  if (!fs || !ensureLogDir()) return

  const now = Date.now()
  const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  listLogFiles().forEach((path) => {
    try {
      const stat = fs.statSync(path)
      const modifiedTime = stat && (stat.lastModifiedTime || stat.lastAccessedTime || stat.createTime)
      if (modifiedTime && now - modifiedTime > maxAge) {
        fs.unlinkSync(path)
      }
    } catch (error) {}
  })
}

function log(level, event, data) {
  const entry = buildEntry(level, event, data)
  consoleOutput(level, event, data)
  appendEntry(entry)
  writeRealtime(level, event, data)
  return entry
}

function init() {
  if (initialized) return
  initialized = true
  ensureLogDir()
  clearOldLogs()
  log('info', 'logger:init', {
    retentionDays: LOG_RETENTION_DAYS,
    maxLogFileSize: MAX_LOG_FILE_SIZE
  })
}

function debug(event, data) {
  return log('debug', event, data)
}

function info(event, data) {
  return log('info', event, data)
}

function warn(event, data) {
  return log('warn', event, data)
}

function error(event, data) {
  return log('error', event, data)
}

function readTodayLog() {
  const fs = getFileSystem()
  const path = getLogFilePath()
  if (!fs || !path) return ''

  try {
    return fs.readFileSync(path, 'utf8')
  } catch (error) {
    return ''
  }
}

module.exports = {
  init,
  debug,
  info,
  warn,
  error,
  getLogFilePath,
  listLogFiles,
  readTodayLog,
  clearOldLogs
}
