const {
  records,
  findRecordById,
  updateRecord,
  recordTypes,
  loadCachedRecords,
  fetchRecords,
  refreshRecordDisplayNames
} = require('../../../data/records')
const { getContactRecordById, getContacts } = require('../../../data/contacts')
const { track } = require('../../../utils/analytics')
const { processRecordImages } = require('../../../utils/record-image')
const logger = require('../../../utils/logger')

const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
const yearOptions = Array.from({ length: 21 }, (_, index) => new Date().getFullYear() - 10 + index)
const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1)
const sceneOptions = ['结婚', '乔迁', '生日', '生娃', '节日']
const numericFields = ['amount', 'estimatedValue', 'cost']
const remarkMaxLength = 200

function pad(value) {
  return `${value}`.padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseRecordDate(fullDate) {
  const parts = `${fullDate || ''}`.split('-').map((item) => Number(item))
  if (parts.length !== 3 || parts.some((item) => Number.isNaN(item))) {
    return new Date()
  }
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function cleanAmount(value) {
  return `${value || ''}`.replace(/^[+-]/, '')
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value

  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '-')
    const matched = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (matched) {
      const [, year, month, day] = matched
      return new Date(Number(year), Number(month) - 1, Number(day))
    }
  }

  return new Date()
}

function resolveSelectedDate(formDate, selectedDate) {
  if (formDate) {
    const normalized = `${formDate}`.replace(/\./g, '-')
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
      return normalizeDate(formDate)
    }
  }

  return normalizeDate(selectedDate)
}

function buildValue(typeKey, giftType, form) {
  const config = recordTypes[typeKey] || recordTypes.cash
  const rawValue = `${form[config.valueField] || ''}`.trim()

  if (typeKey !== 'cash') return rawValue

  if (!rawValue) return ''

  const sign = giftType === 'send' ? '-' : '+'
  const amount = Number.parseFloat(rawValue)
  const amountText = Number.isNaN(amount) ? rawValue : amount.toFixed(2)
  return `${sign}${amountText}`
}

function getEmptyValueToast(typeKey) {
  if (typeKey === 'gift') return '请输入礼物'
  if (typeKey === 'meal') return '请输入请客'
  return '请输入金额'
}

function getSaveErrorMessage(error) {
  if (!error) return '保存失败，请重试'
  if (error.statusCode === 0) return '网络异常，请稍后重试'
  if (error.statusCode === 401 || error.statusCode === 403) return '登录过期，请重试'
  if (error.statusCode >= 500) return '服务器开小差了'
  if (error.message && !/^request:/.test(error.message)) return error.message
  return '保存失败，请重试'
}

function normalizeAmountInput(value) {
  const normalized = `${value || ''}`
    .replace(/[^\d.]/g, '')
    .replace(/\.{2,}/g, '.')
  const parts = normalized.split('.')

  if (parts.length <= 1) {
    return normalized
  }

  return `${parts[0]}.${parts.slice(1).join('')}`
}

function buildNameSuggestions(keyword) {
  const value = `${keyword || ''}`.trim()
  if (!value) return []

  return getContacts()
    .filter((contact) => contact.name.includes(value))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
}

function getNameSuggestionHeight(suggestions) {
  return Math.min(suggestions.length, 5) * 72
}

function buildCalendar(year, month, selectedDate) {
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const gridStart = new Date(year, month, 1 - startOffset)
  const today = new Date()
  const todayKey = dateKey(today)
  const selectedKey = dateKey(selectedDate)
  const days = []

  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    const key = dateKey(current)
    days.push({
      key,
      day: current.getDate(),
      muted: current.getMonth() !== month,
      selected: key === selectedKey,
      today: key === todayKey,
      year: current.getFullYear(),
      month: current.getMonth(),
      date: current.getDate()
    })
  }

  return days
}

function buildCalendarPickerValue(year, month) {
  const yearIndex = Math.max(0, yearOptions.indexOf(year))
  return [yearIndex, month]
}

function clampDateToMonth(year, month, prevDate) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(prevDate.getDate(), lastDay)
  return new Date(year, month, day)
}

function buildForm(record) {
  const form = {
    name: record.name || '',
    date: formatDate(parseRecordDate(record.fullDate)),
    amount: '',
    gift: '',
    estimatedValue: record.estimatedValue || '',
    mealContent: '',
    cost: record.cost || '',
    scene: record.scene || '',
    remark: record.remark || ''
  }

  if (record.typeKey === 'cash') {
    form.amount = cleanAmount(record.value)
  }

  if (record.typeKey === 'gift') {
    form.gift = record.value || ''
  }

  if (record.typeKey === 'meal') {
    form.mealContent = record.value || record.scene || ''
  }

  return form
}

Page({
  data: {
    record: null,
    sceneOptions,
    activeType: 'cash',
    giftType: 'receive',
    selectedSceneTag: '',
    form: {
      name: '',
      date: formatDate(new Date()),
      amount: '',
      gift: '',
      estimatedValue: '',
      mealContent: '',
      cost: '',
      scene: '',
      remark: ''
    },
    saving: false,
    choosingImage: false,
    images: [],
    calendarVisible: false,
    calendarPickerVisible: false,
    calendarPickerValue: buildCalendarPickerValue(new Date().getFullYear(), new Date().getMonth()),
    pendingCalendarPickerValue: buildCalendarPickerValue(new Date().getFullYear(), new Date().getMonth()),
    pickerYearIntoView: `year-option-${buildCalendarPickerValue(new Date().getFullYear(), new Date().getMonth())[0]}`,
    pickerMonthIntoView: `month-option-${buildCalendarPickerValue(new Date().getFullYear(), new Date().getMonth())[1]}`,
    yearOptions,
    monthOptions,
    weekLabels,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    selectedDate: new Date(),
    calendarDays: buildCalendar(new Date().getFullYear(), new Date().getMonth(), new Date()),
    nameSuggestions: [],
    nameSuggestionHeight: 0
  },

  async onLoad(options) {
    this.recordId = options.id
    this.from = options.from || ''
    loadCachedRecords()
    if (!records.length) await fetchRecords()
    refreshRecordDisplayNames()

    const record = findRecordById(this.recordId) || getContactRecordById(this.recordId)
    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }

    const selectedDate = parseRecordDate(record.fullDate)
    const calendarPickerValue = buildCalendarPickerValue(selectedDate.getFullYear(), selectedDate.getMonth())

    this.setData({
      record,
      activeType: record.typeKey || 'cash',
      giftType: record.valueClass === 'expense' ? 'send' : 'receive',
      selectedSceneTag: sceneOptions.includes(record.scene) ? record.scene : '',
      form: buildForm(record),
      images: record.images || [],
      calendarPickerValue,
      pendingCalendarPickerValue: calendarPickerValue,
      pickerYearIntoView: `year-option-${calendarPickerValue[0]}`,
      pickerMonthIntoView: `month-option-${calendarPickerValue[1]}`,
      calendarYear: selectedDate.getFullYear(),
      calendarMonth: selectedDate.getMonth(),
      selectedDate,
      calendarDays: buildCalendar(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate)
    }, () => {
      if (this.pendingEditPageViewTrack) {
        this.pendingEditPageViewTrack = false
        this.trackEditPageView()
      }
    })
  },

  onShow() {
    if (!this.data.record) {
      this.pendingEditPageViewTrack = true
      return
    }
    this.trackEditPageView()
  },

  trackEditPageView() {
    if (!this.data.record) return
    track('record_edit_page_view', {
      record_id: this.data.record.id,
      record_type: this.data.record.typeKey,
      from: this.from || ''
    })
  },

  chooseGiftType(event) {
    this.setData({ giftType: event.currentTarget.dataset.type })
  },

  chooseSceneTag(event) {
    const scene = event.currentTarget.dataset.scene
    if (!scene) return

    this.setData({
      selectedSceneTag: scene,
      'form.scene': scene
    })
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field
    let value = numericFields.includes(field) ? normalizeAmountInput(event.detail.value) : event.detail.value
    if (field === 'remark' && `${value || ''}`.length > remarkMaxLength) {
      wx.showToast({
        title: '请将内容控制在200字以内哦~',
        icon: 'none'
      })
      value = `${value || ''}`.slice(0, remarkMaxLength)
    }

    const nextData = {
      [`form.${field}`]: value
    }

    if (field === 'scene') {
      nextData.selectedSceneTag = value === this.data.selectedSceneTag ? this.data.selectedSceneTag : ''
    }

    if (field === 'name') {
      const suggestions = buildNameSuggestions(value)
      nextData.nameSuggestions = suggestions
      nextData.nameSuggestionHeight = getNameSuggestionHeight(suggestions)
    } else {
      nextData.nameSuggestions = []
      nextData.nameSuggestionHeight = 0
    }

    this.setData(nextData)
    return value
  },

  chooseNameSuggestion(event) {
    const name = event.currentTarget.dataset.name
    if (!name) return

    this.setData({
      'form.name': name,
      nameSuggestions: [],
      nameSuggestionHeight: 0
    })
  },

  goBack() {
    wx.navigateBack()
  },

  openCalendar() {
    const date = normalizeDate(this.data.form.date)
    const year = date.getFullYear()
    const month = date.getMonth()
    const pickerValue = buildCalendarPickerValue(year, month)
    this.setData({
      calendarVisible: true,
      calendarPickerVisible: false,
      calendarYear: year,
      calendarMonth: month,
      selectedDate: date,
      calendarDays: buildCalendar(year, month, date),
      calendarPickerValue: pickerValue,
      pendingCalendarPickerValue: pickerValue
    })
  },

  closeCalendar() {
    this.setData({
      calendarVisible: false,
      calendarPickerVisible: false
    })
  },

  refreshCalendar(year, month, selectedDate = this.data.selectedDate) {
    this.setData({
      calendarYear: year,
      calendarMonth: month,
      calendarPickerValue: buildCalendarPickerValue(year, month),
      selectedDate,
      calendarDays: buildCalendar(year, month, selectedDate)
    })
  },

  toggleCalendarPicker() {
    const pickerValue = buildCalendarPickerValue(this.data.calendarYear, this.data.calendarMonth)
    this.setData({
      calendarPickerVisible: true,
      calendarPickerValue: pickerValue,
      pendingCalendarPickerValue: pickerValue,
      pickerYearIntoView: `year-option-${pickerValue[0]}`,
      pickerMonthIntoView: `month-option-${pickerValue[1]}`
    })
  },

  changeCalendarPicker(event) {
    this.setData({
      pendingCalendarPickerValue: event.detail.value
    })
  },

  chooseCalendarYear(event) {
    const index = Number(event.currentTarget.dataset.index)
    const [, monthIndex = 0] = this.data.pendingCalendarPickerValue

    this.setData({
      pendingCalendarPickerValue: [index, monthIndex],
      pickerYearIntoView: `year-option-${index}`
    })
  },

  chooseCalendarMonth(event) {
    const index = Number(event.currentTarget.dataset.index)
    const [yearIndex = 0] = this.data.pendingCalendarPickerValue

    this.setData({
      pendingCalendarPickerValue: [yearIndex, index],
      pickerMonthIntoView: `month-option-${index}`
    })
  },

  confirmCalendarPicker() {
    const [yearIndex = 0, monthIndex = 0] = this.data.pendingCalendarPickerValue
    const year = yearOptions[yearIndex] || this.data.calendarYear
    const month = monthIndex
    const selectedDate = clampDateToMonth(year, month, this.data.selectedDate)
    this.refreshCalendar(year, month, selectedDate)
    this.setData({ calendarPickerVisible: false })
  },

  cancelCalendarPicker() {
    this.setData({
      calendarPickerVisible: false,
      calendarPickerValue: buildCalendarPickerValue(this.data.calendarYear, this.data.calendarMonth),
      pendingCalendarPickerValue: buildCalendarPickerValue(this.data.calendarYear, this.data.calendarMonth)
    })
  },

  prevMonth() {
    const year = this.data.calendarMonth === 0 ? this.data.calendarYear - 1 : this.data.calendarYear
    const month = this.data.calendarMonth === 0 ? 11 : this.data.calendarMonth - 1
    const selectedDate = clampDateToMonth(year, month, this.data.selectedDate)
    this.setData({ calendarPickerVisible: false })
    this.refreshCalendar(year, month, selectedDate)
  },

  nextMonth() {
    const year = this.data.calendarMonth === 11 ? this.data.calendarYear + 1 : this.data.calendarYear
    const month = this.data.calendarMonth === 11 ? 0 : this.data.calendarMonth + 1
    const selectedDate = clampDateToMonth(year, month, this.data.selectedDate)
    this.setData({ calendarPickerVisible: false })
    this.refreshCalendar(year, month, selectedDate)
  },

  chooseDate(event) {
    const { year, month, date } = event.currentTarget.dataset
    const selectedDate = new Date(Number(year), Number(month), Number(date))
    this.refreshCalendar(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate)
  },

  goToday() {
    const today = new Date()
    this.refreshCalendar(today.getFullYear(), today.getMonth(), today)
  },

  confirmDate() {
    this.setData({
      'form.date': formatDate(this.data.selectedDate),
      calendarVisible: false,
      calendarPickerVisible: false
    })
  },

  noop() {},

  chooseImage() {
    if (this.data.choosingImage) return

    const remain = 3 - this.data.images.length
    if (remain <= 0) return

    this.setData({ choosingImage: true })

    const onSuccess = async (files) => {
      try {
        const result = await processRecordImages(files)
        if (result.rejectedCount > 0) {
          wx.showToast({
            title: '图片不能超过5MB',
            icon: 'none'
          })
        } else if (result.compressFailedCount > 0) {
          wx.showToast({
            title: '部分图片压缩失败，已使用原图',
            icon: 'none'
          })
        }

        this.setData({
          images: this.data.images.concat(result.paths).slice(0, 3)
        })
      } finally {
        this.setData({ choosingImage: false })
      }
    }

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => onSuccess(res.tempFiles),
        fail: () => this.setData({ choosingImage: false })
      })
      return
    }

    wx.chooseImage({
      count: remain,
      sourceType: ['album', 'camera'],
      success: (res) => onSuccess(res.tempFilePaths),
      fail: () => this.setData({ choosingImage: false })
    })
  },

  removeImage(event) {
    const index = event.currentTarget.dataset.index
    this.setData({
      images: this.data.images.filter((_, itemIndex) => itemIndex !== index)
    })
  },

  async saveRecord() {
    if (this.data.saving || !this.data.record) return
    track('record_edit_save_click', {
      record_id: this.data.record.id,
      record_type: this.data.record.typeKey
    })

    const scene = this.data.selectedSceneTag || this.data.form.scene.trim()
    const typeConfig = recordTypes[this.data.activeType] || recordTypes.cash
    const value = buildValue(this.data.activeType, this.data.giftType, this.data.form)
    const selectedDate = resolveSelectedDate(this.data.form.date, this.data.selectedDate)
    logger.info('record_edit:save_click', {
      recordId: this.data.record && this.data.record.id,
      recordType: this.data.activeType,
      valueClass: this.data.giftType === 'send' ? 'expense' : 'income',
      fullDate: dateKey(selectedDate),
      hasScene: !!scene,
      hasName: !!this.data.form.name.trim(),
      hasValue: !!value,
      imageCount: this.data.images.length,
      remarkLength: `${this.data.form.remark || ''}`.length
    })

    if (!scene) {
      logger.warn('record_edit:validation_blocked', {
        recordId: this.data.record && this.data.record.id,
        reason: 'missing_scene'
      })
      wx.showToast({ title: '请选择或输入事由', icon: 'none' })
      return
    }

    if (!this.data.form.name.trim()) {
      logger.warn('record_edit:validation_blocked', {
        recordId: this.data.record && this.data.record.id,
        reason: 'missing_name'
      })
      wx.showToast({ title: '请输入对方姓名', icon: 'none' })
      return
    }

    if (!value) {
      logger.warn('record_edit:validation_blocked', {
        recordId: this.data.record && this.data.record.id,
        reason: 'missing_value'
      })
      wx.showToast({
        title: getEmptyValueToast(this.data.activeType),
        icon: 'none'
      })
      return
    }

    if (`${this.data.form.remark || ''}`.length > remarkMaxLength) {
      logger.warn('record_edit:validation_blocked', {
        recordId: this.data.record && this.data.record.id,
        reason: 'remark_too_long'
      })
      wx.showToast({
        title: '请将内容控制在200字以内哦~',
        icon: 'none'
      })
      return
    }

    this.setData({ saving: true })

    try {
      const savedRecord = await updateRecord(this.data.record.id, {
        type: typeConfig.type,
        typeKey: this.data.activeType,
        name: this.data.form.name.trim(),
        date: `${selectedDate.getMonth() + 1}.${selectedDate.getDate()}`,
        fullDate: dateKey(selectedDate),
        dateLabel: `${selectedDate.getMonth() + 1}.${selectedDate.getDate()}`,
        year: `${selectedDate.getFullYear()}`,
        scene,
        value,
        valueClass: this.data.giftType === 'send' ? 'expense' : 'income',
        amountLabel: typeConfig.amountLabel[this.data.giftType],
        estimatedValue: this.data.form.estimatedValue.trim(),
        cost: this.data.form.cost.trim(),
        remark: this.data.form.remark.trim(),
        images: this.data.images
      })

      track('record_edit_success', {
        record_id: savedRecord.id,
        record_type: savedRecord.typeKey
      })
      logger.info('record_edit:save_success', {
        recordId: savedRecord.id,
        recordType: savedRecord.typeKey,
        imageCount: Array.isArray(savedRecord.images) ? savedRecord.images.length : 0
      })
    } catch (error) {
      logger.error('record_edit:save_failed', {
        recordId: this.data.record && this.data.record.id,
        recordType: this.data.activeType,
        imageCount: this.data.images.length,
        error
      })
      console.error('update record failed', error)
      this.setData({ saving: false })
      wx.showToast({
        title: getSaveErrorMessage(error),
        icon: 'none'
      })
      return
    }

    wx.showToast({
      title: '保存成功',
      icon: 'success'
    })

    setTimeout(() => {
      wx.navigateBack()
    }, 800)
  }
})
