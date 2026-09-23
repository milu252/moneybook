const {
  fetchTrashRecords,
  getYearGroups,
  restoreRecordsFromTrash,
  deleteTrashRecords
} = require('../../../data/records')
const { track } = require('../../../utils/analytics')

Page({
  data: {
    yearGroups: [],
    trashRecords: [],
    managing: false,
    selectedIds: [],
    allSelected: false,
    restoring: false,
    deleting: false
  },

  async onShow() {
    track('trash_page_view')
    await this.refreshTrashRecords()
  },

  async refreshTrashRecords() {
    const trashRecords = (await fetchTrashRecords())
      .sort((prev, next) => `${next.fullDate}`.localeCompare(`${prev.fullDate}`))
      .map((record) => ({
        ...record,
        selected: this.data.selectedIds.includes(record.id)
      }))
    const allSelected = trashRecords.length > 0 && trashRecords.every((r) => r.selected)

    this.setData({
      trashRecords,
      yearGroups: getYearGroups(trashRecords),
      allSelected
    })
  },

  toggleManage() {
    const managing = !this.data.managing
    if (managing) {
      track('trash_manage_click')
    }

    this.setData({
      managing,
      selectedIds: managing ? this.data.selectedIds : [],
      allSelected: false
    }, () => { this.refreshTrashRecords() })
  },

  handleSelectRecord(event) {
    const id = event.detail.id
    const selectedIds = this.data.selectedIds.includes(id)
      ? this.data.selectedIds.filter((item) => item !== id)
      : [...this.data.selectedIds, id]

    this.setData({ selectedIds }, () => { this.refreshTrashRecords() })
  },

  toggleSelectAll() {
    const selectedIds = this.data.allSelected
      ? []
      : this.data.trashRecords.map((r) => r.id)

    this.setData({ selectedIds }, () => { this.refreshTrashRecords() })
  },

  async restoreSelected() {
    if (this.data.restoring || this.data.deleting) return

    track('trash_restore_click')

    if (!this.data.selectedIds.length) {
      wx.showToast({ title: '请选择记录', icon: 'none' })
      return
    }

    this.setData({ restoring: true })

    try {
      await restoreRecordsFromTrash(this.data.selectedIds)

      wx.showToast({ title: '已恢复', icon: 'none' })
      this.setData({ managing: false, selectedIds: [], allSelected: false, restoring: false }, () => {
        this.refreshTrashRecords()
      })
    } catch (e) {
      this.setData({ restoring: false })
      wx.showToast({ title: '恢复失败', icon: 'none' })
    }
  },

  async deleteSelected() {
    if (this.data.restoring || this.data.deleting) return

    track('trash_delete_click')

    if (!this.data.selectedIds.length) {
      wx.showToast({ title: '请选择记录', icon: 'none' })
      return
    }

    this.setData({ deleting: true })

    try {
      await deleteTrashRecords(this.data.selectedIds)

      wx.showToast({ title: '已删除', icon: 'none' })
      this.setData({ managing: false, selectedIds: [], allSelected: false, deleting: false }, () => {
        this.refreshTrashRecords()
      })
    } catch (e) {
      this.setData({ deleting: false })
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  }
})
