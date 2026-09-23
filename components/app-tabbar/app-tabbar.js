const { track } = require('../../utils/analytics')

Component({
  properties: {
    active: {
      type: String,
      value: 'index'
    }
  },

  data: {
    tabs: [
      { key: 'index', page: 'index', label: '首页', icon: 'home' },
      { key: 'stats', page: 'stats', label: '统计', icon: 'stat' },
      { key: 'create', page: 'create', label: '新建', icon: 'create' },
      { key: 'contacts', page: 'contacts', label: '联系人', icon: 'contact' },
      { key: 'mine', page: 'mine', label: '我的', icon: 'mine' }
    ]
  },

  methods: {
    switchTab(event) {
      const { key, page } = event.currentTarget.dataset
      if (!page) return

      if (key === 'index') {
        track('home_tab_click')
      }

      if (key === 'stats') {
        track('stats_tab_click')
      }

      if (key === 'create') {
        track('create_tab_click')
      }

      if (key === 'contacts') {
        track('contacts_tab_click')
      }

      if (key === 'mine') {
        track('mine_tab_click')
      }

      if (key === this.data.active || this.switching) return
      this.switching = true
      wx.redirectTo({
        url: `/pages/${page}/${page}`,
        complete: () => {
          this.switching = false
        }
      })
    }
  }
})
