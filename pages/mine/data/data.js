const { records, fetchRecords, loadCachedRecords, moveRecordsToTrash } = require('../../../data/records')
const { track } = require('../../../utils/analytics')
const { createRecordsWorkbookFile } = require('../../../utils/export-records')
const logger = require('../../../utils/logger')

Page({
  data: {
    showClearDataDialog: false,
    showExportDialog: false,
    showExportToast: false,
    clearing: false,
    exporting: false,
    exportPreparing: false,
    actions: [
      { key: 'export', label: '导出数据' },
      { key: 'logs', label: '诊断日志' },
      { key: 'clear', label: '清空数据' },
      { key: 'trash', label: '回收站' }
    ]
  },

  onLoad() {
    loadCachedRecords()
  },

  handleAction(event) {
    const key = event.currentTarget.dataset.key
    const label = event.currentTarget.dataset.label

    if (key === 'trash') {
      track('trash_entry_click')

      wx.navigateTo({
        url: '/pages/mine/data/trash'
      })
      return
    }

    if (key === 'clear') {
      this.setData({ showClearDataDialog: true })
      return
    }

    if (key === 'export') {
      if (this.data.exportPreparing || this.data.exporting) return
      track('data_export_click')
      this.openExportDialog()
      return
    }

    if (key === 'logs') {
      this.shareDiagnosticLog()
    }
  },

  shareDiagnosticLog() {
    logger.info('diagnostic_log:share_click')

    if (typeof wx.shareFileMessage !== 'function') {
      logger.warn('diagnostic_log:share_not_supported')
      wx.showToast({
        title: '当前微信版本不支持文件分享',
        icon: 'none'
      })
      return
    }

    const filePath = logger.getLogFilePath()
    const content = logger.readTodayLog()
    if (!filePath || !content) {
      logger.warn('diagnostic_log:empty')
      wx.showToast({
        title: '暂无诊断日志',
        icon: 'none'
      })
      return
    }

    wx.shareFileMessage({
      filePath,
      fileName: `moneybook-log-${Date.now()}.log`,
      success: () => {
        logger.info('diagnostic_log:share_success', { filePath })
      },
      fail: (error) => {
        logger.error('diagnostic_log:share_failed', {
          filePath,
          error
        })
        wx.showModal({
          title: '发送失败',
          content: '日志文件已生成，可稍后重试。',
          showCancel: false
        })
      }
    })
  },

  async openExportDialog() {
    clearTimeout(this.exportToastTimer)
    clearTimeout(this.exportDialogTimer)
    const requestId = Date.now()
    this.exportRequestId = requestId
    this.exportFile = null
    this.setData({
      exportPreparing: true,
      showExportToast: true,
      showExportDialog: false
    })

    try {
      const [file] = await Promise.all([
        createRecordsWorkbookFile(),
        new Promise((resolve) => {
          this.exportToastTimer = setTimeout(resolve, 1500)
        })
      ])
      if (this.exportRequestId !== requestId) return

      this.exportFile = file
      this.setData({ showExportToast: false })
      this.exportDialogTimer = setTimeout(() => {
        if (this.exportRequestId !== requestId) return
        this.setData({
          showExportDialog: true,
          exportPreparing: false
        })
      }, 120)
    } catch (error) {
      if (this.exportRequestId !== requestId) return

      console.error('export records failed', error)
      this.setData({
        showExportToast: false,
        exportPreparing: false
      })
      wx.showToast({
        title: error && error.message ? error.message : '导出失败，请重试',
        icon: 'none'
      })
    }
  },

  closeExportDialog() {
    clearTimeout(this.exportToastTimer)
    clearTimeout(this.exportDialogTimer)
    this.exportRequestId = 0
    this.setData({
      showExportDialog: false,
      showExportToast: false,
      exportPreparing: false
    })
  },

  noop() {},

  async getExportFile() {
    if (this.exportFile) return this.exportFile

    this.setData({ exporting: true })
    try {
      this.exportFile = await createRecordsWorkbookFile()
      return this.exportFile
    } finally {
      this.setData({ exporting: false })
    }
  },

  async downloadLocal() {
    if (this.data.exporting) return

    track('data_export_action_click', {
      action_type: 'download_local'
    })

    try {
      const file = await this.getExportFile()
      this.closeExportDialog()

      wx.openDocument({
        filePath: file.filePath,
        fileType: 'xlsx',
        showMenu: true,
        success: () => {},
        fail: (error) => {
          console.error('open export file failed', error)
          wx.showModal({
            title: '文件已生成',
            content: `已生成 ${file.fileName}，可通过“发送给好友”分享文件。`,
            showCancel: false
          })
        }
      })
    } catch (error) {
      console.error('export records failed', error)
      wx.showToast({
        title: error && error.message ? error.message : '导出失败，请重试',
        icon: 'none'
      })
    }
  },

  async sendToFriend() {
    if (this.data.exporting) return

    track('data_export_action_click', {
      action_type: 'share_friend'
    })

    if (typeof wx.shareFileMessage !== 'function') {
      wx.showToast({
        title: '当前微信版本不支持文件分享',
        icon: 'none'
      })
      return
    }

    try {
      const file = await this.getExportFile()
      this.closeExportDialog()
      wx.shareFileMessage({
        filePath: file.filePath,
        fileName: file.fileName,
        fail: (error) => {
          console.error('share export file failed', error)
          wx.showModal({
            title: '发送失败',
            content: '文件已生成，可先打开文件后通过右上角菜单转发。',
            showCancel: false,
            success: () => {
              wx.openDocument({
                filePath: file.filePath,
                fileType: 'xlsx',
                showMenu: true
              })
            }
          })
        }
      })
    } catch (error) {
      console.error('export records failed', error)
      wx.showToast({
        title: error && error.message ? error.message : '导出失败，请重试',
        icon: 'none'
      })
    }
  },

  closeClearDataDialog() {
    if (this.data.clearing) return
    this.setData({ showClearDataDialog: false })
  },

  async confirmClearData() {
    if (this.data.clearing) return

    loadCachedRecords()
    if (!records.length) await fetchRecords()

    const recordIds = records.map((record) => record.id)
    if (!recordIds.length) {
      wx.showToast({ title: '暂无可清空数据', icon: 'none' })
      this.setData({ showClearDataDialog: false })
      return
    }

    this.setData({ clearing: true })

    try {
      await moveRecordsToTrash(recordIds)
      wx.showToast({ title: '已清空', icon: 'none' })
      this.setData({
        showClearDataDialog: false,
        clearing: false
      })
    } catch (error) {
      console.error('clear data failed', error)
      this.setData({ clearing: false })
      wx.showToast({ title: '清空失败，请重试', icon: 'none' })
    }
  }
})
