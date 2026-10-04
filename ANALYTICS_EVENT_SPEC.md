# 小程序埋点事件对接说明

> 本文仅根据当前前端代码（`utils/analytics.js` 与各页面、组件中的 `track()` 调用）整理，作为后端 `POST /analytics/events` 的对接依据。未读取或引用旧埋点文档。

## 1. 接口与统一报文

- **接口**：`POST /analytics/events`
- **Content-Type**：由现有 `utils/request.js` 以 JSON 请求发送。
- **发送方式**：前端触发 `track()` 时先同步写入本地待发送队列，再异步上报，不等待埋点接口返回，也不会因埋点失败阻塞业务。
- **登录与重试**：没有 token 时不会发起上报；事件会保留在本地，首次登录成功及每次回到前台时自动补发。请求失败时当前及后续事件继续保留，等待下次补发。
- **关闭场景**：`App.onHide` 的关闭事件先落盘再尝试发送。若小程序被系统回收而无法完成请求，下次启动并登录后仍会按原始 `timestamp` 补发。因此后端应按客户端事件时间分析，并允许延迟到达和少量重复事件。

请求体固定结构如下：

```json
{
  "event_name": "record_create_success",
  "timestamp": 1790000000000,
  "page_path": "pages/create/edit/edit",
  "properties": {
    "user_id": 123,
    "device_id": "device_...",
    "os_type": "android",
    "network_type": "wifi",
    "ip": "",
    "record_id": "..."
  }
}
```

### 1.1 所有事件的公共字段

| 字段 | 所在层级 | 类型 | 前端来源与含义 | 后端处理要求 |
| --- | --- | --- | --- | --- |
| `event_name` | 根对象 | string | 事件唯一名称，取值见第 3 节 | 必填；按原值保存，不应改写为中文。 |
| `timestamp` | 根对象 | number | 调用埋点时的 `Date.now()`，Unix 毫秒时间戳 | 必填；作为客户端发生时间。另记录服务端接收时间以便排查时钟偏差。 |
| `page_path` | 根对象 | string，可缺失 | 当前小程序页面的 `route`，如 `pages/index/index`；无页面上下文时不传 | 可空；用于页面归因，不含 query 参数。 |
| `properties.user_id` | properties | number 或 string 或空字符串 | 本地个人资料的 `id`；资料尚未拉取或注销后可能为空 | 可空；后端应从登录 token 解析用户并校验/补全，不应信任客户端传入的用户归属。 |
| `properties.device_id` | properties | string 或空字符串 | 首次上报生成 `device_{时间}_{随机串}` 并写入本地缓存，后续复用 | 可空；用于匿名设备去重。清缓存、重装会产生新值。 |
| `properties.os_type` | properties | string 或空字符串 | 微信 `getDeviceInfo()` 的 `platform`（兼容旧版时取系统信息） | 可空；常见值由微信运行环境决定，如 `ios`、`android`、`devtools`，不可写死枚举。 |
| `properties.network_type` | properties | string | 当前统一写入 `unknown`，避免生命周期结束时等待异步网络类型查询 | 当前值为 `unknown`；后端应兼容未来扩展为 `wifi`、`4g`、`5g`、`none` 等微信网络类型。 |
| `properties.ip` | properties | string | 当前前端固定发送空字符串 | 后端应从 HTTP 请求源解析并保存 IP；不要依赖此字段。 |

**覆盖规则**：业务事件若传入与公共字段同名的属性，会覆盖 `properties` 中的默认值；当前 49 个事件均未覆盖公共字段。`page_path` 虽可由事件属性指定，但当前事件均由运行时自动获取。

## 2. 业务字段字典

下表字段仅在对应事件中出现；未列出的事件只携带第 1.1 节公共字段。

| 字段 | 类型/取值 | 精确定义 |
| --- | --- | --- |
| `scene` | number 或 string 或空字符串 | 小程序启动参数 `options.scene`；由微信提供的进入场景值。 |
| `mini_program_duration_ms` | number | 本次进入前台至进入后台之间的毫秒数；不是一次完整会话时长。 |
| `record_id` | number 或 string | 当前记录的实际 `id`。 |
| `record_type` | `cash` / `gift` / `meal` | 记录类型：礼金 / 礼物 / 请客。 |
| `value_class` | `income` / `expense` | 来往方向：收（收入）/ 送（支出）。 |
| `record_scene` | string | 新建记录表单中的事由，可为空；快捷选项是结婚、乔迁、生日、生娃、节日，但用户可手填其他值。 |
| `has_images` | boolean | 保存成功的记录是否至少包含一张图片。 |
| `from` | string | 页面来源。当前代码可能为 `create`、`home`，也可能为空字符串；不能假定一定存在。 |
| `create_duration_ms` | number | 从用户在新建入口选择类型起，到记录保存成功为止的毫秒数；若缓存读取失败或直接进入表单，以表单加载时作为起点。 |
| `fail_reason` | `network_error` / `unauthorized` / `server_error` / `request_error` / `unknown` | 新建记录失败的前端归类：网络失败、401/403、5xx、其他4xx、其余情况。 |
| `year` | string 或 number | 统计筛选项的原值：`all`（全部年份）或具体年份；后端接收时不能只按数字解析。 |
| `has_result` | boolean | 联系人搜索延迟 500ms 后，以当次输入计算出的候选联系人是否非空；不上传搜索关键词。 |
| `menu_key` | `share` / `about` / `data` / `feedback` / `settings` | “我的”页菜单点击的功能标识。 |
| `action_type` | `download_local` / `share_friend` | 数据导出的后续操作：本地打开下载 / 发送给好友。事件代表点击，非最终成功。 |
| `record_count` | number | 用户确认清空时、调用移入回收站前待处理的记录数量。 |
| `feedback_type` | `feature` / `issue` / `complaint` / `other` | 反馈分类：功能建议、问题反馈、投诉建议、其他。 |

## 3. 事件明细（共 49 个）

### 3.1 生命周期与底部导航

| 事件名 | 代码位置 | 触发时机与含义 | 额外业务字段 |
| --- | --- | --- | --- |
| `mini_program_open` | `app.js` / `App.onShow` | 小程序每次进入前台时触发，包含首次启动和从后台切回。 | `scene` |
| `mini_program_hide` | `app.js` / `App.onHide` | 小程序进入后台时触发；仅当前台开始时间存在时发送。 | `mini_program_duration_ms` |
| `home_tab_click` | `components/app-tabbar/app-tabbar.js` | 点击底部“首页”时发送；即使首页已经是当前 tab 也会发送。 | 无 |
| `stats_tab_click` | 同上 | 点击底部“统计”时发送；即使已在统计页也会发送。 | 无 |
| `create_tab_click` | 同上 | 点击底部“新建”时发送；即使已在新建页也会发送。 | 无 |
| `contacts_tab_click` | 同上 | 点击底部“联系人”时发送；即使已在联系人页也会发送。 | 无 |
| `mine_tab_click` | 同上 | 点击底部“我的”时发送；即使已在我的页也会发送。 | 无 |

### 3.2 首页、全部记录与记录详情

| 事件名 | 代码位置 | 触发时机与含义 | 额外业务字段 |
| --- | --- | --- | --- |
| `home_page_view` | `pages/index/index.js` / `onShow` | 首页每次显示时发送，可用于 PV；前后台切换或返回首页会再次发送。 | 无 |
| `home_all_records_click` | `pages/index/index.js` / `goAllRecords` | 点击首页“全部记录”入口，跳转前发送。 | 无 |
| `records_page_view` | `pages/records/records.js` / `onShow` | 全部记录页每次显示时发送。 | 无 |
| `record_detail_view` | `pages/records/detail/detail.js` / `onShow` | 成功加载到记录详情并完成最新记录拉取后发送；记录不存在不发送。 | `record_id`、`record_type`、`from` |
| `record_edit_click` | 同上 / `editRecord` | 点击记录详情页“编辑”并准备跳转编辑页时发送。 | `record_id`、`record_type` |
| `record_delete_click` | 同上 / `openDeleteDialog` | 点击详情页删除按钮、打开删除确认弹窗时发送；不是确认删除。 | `record_id`、`record_type` |
| `record_delete_success` | 同上 / `confirmDeleteRecord` | 记录成功移入回收站后发送。 | `record_id`、`record_type` |
| `record_edit_page_view` | `pages/records/edit/edit.js` / `trackEditPageView` | 编辑页有可用记录数据时发送一次；数据异步加载完成后会补发。 | `record_id`、`record_type` |
| `record_edit_success` | 同上 / 保存逻辑 | 记录更新请求成功、获得保存后的记录后发送。 | `record_id`、`record_type` |

### 3.3 新建记录

| 事件名 | 代码位置 | 触发时机与含义 | 额外业务字段 |
| --- | --- | --- | --- |
| `create_page_view` | `pages/create/create.js` / `onShow` | 新建类型入口页每次显示时发送。 | 无 |
| `record_create_type_click` | 同上 / `goCreateEdit` | 用户点击礼金、礼物或请客类型入口后、跳转表单前发送；同时开始计时。 | `record_type` |
| `record_create_form_view` | `pages/create/edit/edit.js` / `onShow` | 新建记录表单页每次显示时发送。 | `record_type`、`from` |
| `record_create_success` | 同上 / 保存逻辑 | 创建记录的业务请求成功并取得 `savedRecord` 后发送。 | `record_id`、`record_type`、`value_class`、`record_scene`、`has_images`、`from`、`create_duration_ms` |
| `record_create_fail` | 同上 / 保存异常分支 | 用户提交保存且创建请求异常时发送；前端表单必填校验未通过不会发送。 | `record_type`、`fail_reason`、`from` |

### 3.4 统计

| 事件名 | 代码位置 | 触发时机与含义 | 额外业务字段 |
| --- | --- | --- | --- |
| `stats_page_view` | `pages/stats/stats.js` / `onShow` | 统计页每次显示时发送。 | 无 |
| `stats_year_filter_click` | 同上 / `toggleChartFilter` | 年份筛选面板从关闭变为打开时发送；关闭面板不发送。 | `record_type` |
| `stats_year_filter_option_click` | 同上 / `selectChartFilter` | 点击“全部年份”或某个年份筛选项时发送。 | `record_type`、`year` |
| `stats_records_click` | 同上 / `goStatsRecords` | 点击统计页某年/月的来往记录时间行时发送，跳详情列表前触发。 | `record_type` |
| `stats_type_switch_click` | 同上 / `switchCategory` | 切换礼金、礼物、请客统计分类时发送；点击当前已选分类不发送。 | `record_type` |
| `stats_records_page_view` | `pages/stats/records/records.js` / `onLoad` | 从统计页进入来往记录列表的页面加载时发送一次。 | `record_type` |

### 3.5 联系人

| 事件名 | 代码位置 | 触发时机与含义 | 额外业务字段 |
| --- | --- | --- | --- |
| `contacts_page_view` | `pages/contacts/contacts.js` / `onShow` | 联系人页每次显示时发送。 | 无 |
| `contacts_search` | 同上 / `updateKeyword` | 用户输入非空关键词、停止输入约 500ms 后发送；清空输入不发送；关键词本身不上传。 | `has_result` |
| `contact_detail_click` | 同上 / `goContactDetail` | 点击联系人列表中的联系人进入详情前发送。通过搜索建议直接进入详情的路径不发送本事件。 | 无 |
| `contact_detail_view` | `pages/contacts/detail/detail.js` / `onShow` | 联系人详情已刷新且联系人仍存在时发送。 | 无 |

### 3.6 我的、数据管理与回收站

| 事件名 | 代码位置 | 触发时机与含义 | 额外业务字段 |
| --- | --- | --- | --- |
| `mine_page_view` | `pages/mine/mine.js` / `onShow` | 我的页每次显示时发送。 | 无 |
| `profile_entry_click` | 同上 / `editProfile` | 点击顶部个人信息卡片、跳转个人资料编辑页前发送。 | 无 |
| `mine_menu_click` | 同上 / `handleMenuTap` | 点击“分享给好友、关于我们、数据管理、意见反馈、系统设置”任一菜单时发送；分享入口即使暂未跳转也会发送。 | `menu_key` |
| `data_export_click` | `pages/mine/data/data.js` / `handleAction` | 点击“导出数据”、开始准备导出文件前发送；准备中重复点击不发送。 | 无 |
| `data_export_action_click` | 同上 / `downloadLocal`、`sendToFriend` | 在导出弹窗中点击“本地下载”或“发送给好友”时发送；仅代表点击，文件生成/打开/分享失败仍可能已上报。 | `action_type` |
| `data_clear_click` | 同上 / `handleAction` | 点击“清空数据”并打开确认弹窗时发送；不是实际清空成功。 | 无 |
| `data_clear_success` | 同上 / `confirmClearData` | 至少有一条记录且全部成功移入回收站后发送；无记录或操作失败不发送。 | `record_count` |
| `trash_entry_click` | 同上 / `handleAction` | 点击“回收站”、跳转前发送。 | 无 |
| `trash_page_view` | `pages/mine/data/trash.js` / `onShow` | 回收站页每次显示时发送。 | 无 |
| `trash_manage_click` | 同上 / `toggleManage` | 回收站从普通模式切到管理模式时发送；退出管理模式不发送。 | 无 |
| `trash_restore_click` | 同上 / `restoreSelected` | 点击恢复按钮时发送，即使尚未选择记录、随后提示“请选择记录”也会发送；不表示恢复成功。 | 无 |
| `trash_delete_click` | 同上 / `deleteSelected` | 点击永久删除按钮时发送，即使尚未选择记录或删除失败也会发送；不表示删除成功。 | 无 |

### 3.7 意见反馈与账号注销

| 事件名 | 代码位置 | 触发时机与含义 | 额外业务字段 |
| --- | --- | --- | --- |
| `feedback_page_view` | `pages/mine/feedback/feedback.js` / `onShow` | 意见反馈页每次显示时发送。 | 无 |
| `feedback_submit_success` | 同上 / `submitFeedback` | `POST /feedback` 请求成功后发送；缺少分类/内容、校验失败或请求失败不发送。 | `feedback_type` |
| `account_delete_click` | `pages/mine/settings/settings.js` / `handleSettingTap` | 点击“注销账号”并打开首次确认弹窗时发送。 | 无 |
| `account_delete_first_confirm_click` | 同上 / `openCancelAccountSecondDialog` | 在首次注销确认弹窗中点击确认、打开二次确认弹窗时发送。 | 无 |
| `account_delete_second_confirm_click` | 同上 / `confirmCancelAccount` | 在二次确认弹窗中点击确认、发起账号删除请求前发送。 | 无 |
| `account_delete_success` | 同上 / `confirmCancelAccount` | `DELETE /account` 成功返回后、前端清除本地账号数据前发送。由于该时刻用户仍存在于会话中，事件应能带上原 `user_id`。 | 无 |

## 4. 后端落库与校验建议

1. 将根字段与 `properties` 原样保留（推荐 `properties` 使用 JSON/JSONB），同时将 `event_name`、客户端/服务端时间、认证用户 ID、设备 ID 建索引，满足漏斗、PV/UV、设备去重查询。
2. 认证后的 `user_id` 以 token 解析结果为准；客户端值只作诊断比对。账号注销成功事件需先接收再执行或保留事件审计记录，避免因级联删除用户导致事件丢失。
3. 不记录用户搜索关键词、反馈正文、记录金额、礼物内容、姓名、图片 URL 等业务敏感内容；现有前端埋点也未上传这些数据。后端不要通过扩展字段要求前端补传。
4. 对未知 `event_name`、新增字段和公共字段空值保持兼容并记录监控，不要让单条埋点返回 4xx 后影响前端业务。
5. `timestamp` 为客户端时间，分析时优先服务端接收时间做分区与延迟监控；产品行为时间可使用客户端时间，并处理异常时钟。
