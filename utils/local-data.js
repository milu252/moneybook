const { records } = require('../data/records')

function getUserDataPath() {
  if (typeof wx === 'undefined' || !wx.env || !wx.env.USER_DATA_PATH) return ''
  return wx.env.USER_DATA_PATH
}

function removeFileSystemEntry(fileSystem, filePath) {
  return new Promise((resolve) => {
    fileSystem.stat({
      path: filePath,
      success(result) {
        const stats = result && result.stats
        if (stats && typeof stats.isDirectory === 'function' && stats.isDirectory()) {
          fileSystem.rmdir({
            dirPath: filePath,
            recursive: true,
            complete: resolve
          })
          return
        }

        fileSystem.unlink({
          filePath,
          complete: resolve
        })
      },
      fail: resolve
    })
  })
}

function clearUserDataFiles() {
  const userDataPath = getUserDataPath()
  if (!userDataPath || typeof wx.getFileSystemManager !== 'function') return Promise.resolve(0)

  const fileSystem = wx.getFileSystemManager()
  return new Promise((resolve) => {
    fileSystem.readdir({
      dirPath: userDataPath,
      success(result) {
        const files = result && Array.isArray(result.files) ? result.files : []
        Promise.all(files.map((name) => removeFileSystemEntry(fileSystem, `${userDataPath}/${name}`)))
          .then(() => resolve(files.length))
          .catch(() => resolve(0))
      },
      fail() {
        resolve(0)
      }
    })
  })
}

/**
 * 清除小程序本地生成的全部数据，不会删除服务端账户或云端记录。
 */
async function clearAllLocalData() {
  // 所有页面都共享这个数组；先清空它，避免已渲染页面继续引用旧记录。
  records.splice(0, records.length)

  try {
    wx.clearStorageSync()
  } catch (error) {}

  return clearUserDataFiles()
}

module.exports = {
  clearAllLocalData,
  clearUserDataFiles
}
