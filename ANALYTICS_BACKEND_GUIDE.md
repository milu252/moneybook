# 小程序埋点后端对接指引

本文档用于后端接收、存储和统计小程序埋点数据。

## 上报接口

- Method: `POST`
- Path: `/analytics/events`
- Content-Type: `application/json`

## 上报结构

```json
{
  "event_name": "record_create_success",
  "timestamp": 1798450000000,
  "page_path": "pages/create/edit/edit",
  "properties": {
    "user_id": "1234567",
    "device_id": "device_1798450000000_abcd1234",
    "os_type": "ios",
    "network_type": "wifi",
    "record_id": "2026-09-23_xxx_cash",
    "record_type": "cash"
  }
}
```

## 全局字段

| 字段 | 位置 | 类型 | 说明 |
|---|---|---|---|
| `event_name` | 顶层 | string | 事件名 |
| `timestamp` | 顶层 | int | 事件触发时间，毫秒时间戳 |
| `page_path` | 顶层 | string | 当前页面路径，部分全局事件可能为空 |
| `properties` | 顶层 | object | 全局公共属性和事件业务参数 |
| `user_id` | properties | string | 用户 ID |
| `device_id` | properties | string | 匿名设备 ID，本地生成并缓存 |
| `os_type` | properties | string | 系统类型，例如 `ios`、`android`、`devtools` |
| `network_type` | properties | string | 网络类型，例如 `wifi`、`4g`、`5g`、`none`、`unknown` |

## 事件清单

### 小程序全局

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 打开小程序 | `mini_program_open` | 小程序进入前台，包括首次打开和从后台切回 | `scene` |
| 小程序进入后台 | `mini_program_hide` | 用户关闭小程序、切到后台或切到其他 App | `mini_program_duration_ms` |

### 首页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 点击首页 tab | `home_tab_click` | 点击底部导航“首页”tab | 无 |
| 首页 pv、uv | `home_page_view` | 用户进入首页 | 无 |
| 点击全部记录按钮 | `home_all_records_click` | 点击首页“全部记录”入口 | 无 |
| 全部记录页 pv、uv | `records_page_view` | 用户进入全部记录页 | 无 |

### 记录详情页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 记录详情页 pv、uv | `record_detail_view` | 用户进入记录详情页 | `record_id`、`record_type`、`from` |
| 点击删除记录按钮 | `record_delete_click` | 点击删除记录按钮 | `record_id`、`record_type` |
| 成功删除记录 | `record_delete_success` | 删除记录且后端返回成功 | `record_id`、`record_type` |
| 点击编辑记录按钮 | `record_edit_click` | 点击编辑记录按钮 | `record_id`、`record_type` |

### 编辑页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 编辑页 pv、uv | `record_edit_page_view` | 用户进入编辑页 | `record_id`、`record_type` |
| 编辑保存成功 | `record_edit_success` | 点击保存且后端返回成功 | `record_id`、`record_type` |

### 新建页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 点击新建页 tab | `create_tab_click` | 点击底部导航“新建”tab | 无 |
| 新建类型入口页 pv、uv | `create_page_view` | 用户进入新建类型入口页 | 无 |
| 点击新建类型入口 | `record_create_type_click` | 点击礼金/礼物/请客类型入口 | `record_type` |
| 新建表单页 pv、uv | `record_create_form_view` | 用户进入新建表单页 | `record_type`、`from` |
| 新增记录保存成功 | `record_create_success` | 点击保存且后端返回成功 | `record_id`、`record_type`、`value_class`、`has_images`、`record_scene`、`from`、`create_duration_ms` |
| 新建记录保存失败 | `record_create_fail` | 点击保存，后端返回失败或请求失败 | `record_type`、`fail_reason`、`from` |

### 统计页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 点击统计页 tab | `stats_tab_click` | 点击底部导航“统计”tab | 无 |
| 统计页 pv、uv | `stats_page_view` | 用户进入统计页 | 无 |
| 点击类型标签切换组件 | `stats_type_switch_click` | 点击礼金/礼物/请客切换组件 | `record_type` |
| 点击筛选按钮 | `stats_year_filter_click` | 点击筛选按钮 | `record_type` |
| 点击筛选弹窗选项 | `stats_year_filter_option_click` | 点击全部年份或具体年份选项 | `record_type`、`year` |
| 点击来往记录模块时间行 | `stats_records_click` | 点击来往记录模块的时间行 | `record_type` |
| 记录列表页 pv、uv | `stats_records_page_view` | 从统计页进入来往记录列表页 | `record_type` |

### 联系人页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 点击联系人页 tab | `contacts_tab_click` | 点击底部导航“联系人”tab | 无 |
| 联系人页 pv、uv | `contacts_page_view` | 用户进入联系人页 | 无 |
| 点击联系人 | `contact_detail_click` | 点击联系人列表模块中的联系人 | 无 |
| 联系人详情页 pv、uv | `contact_detail_view` | 用户进入联系人详情页 | 无 |
| 点击搜索 | `contacts_search` | 在搜索框输入关键词并触发搜索 | `has_result` |

### 我的页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 点击我的页 tab | `mine_tab_click` | 点击底部导航“我的”tab | 无 |
| 我的页 pv、uv | `mine_page_view` | 用户进入我的页 | 无 |
| 点击个人信息卡片 | `profile_entry_click` | 点击顶部个人信息卡片 | 无 |
| 点击功能菜单卡片 | `mine_menu_click` | 点击分享给好友/关于我们/数据管理/意见反馈/系统设置 | `menu_key` |

### 数据管理页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 点击导出数据 | `data_export_click` | 点击导出数据按钮 | 无 |
| 点击导出数据后操作 | `data_export_action_click` | 点击本地下载或分享给好友 | `action_type` |
| 点击清空数据 | `data_clear_click` | 点击清空数据按钮 | 无 |
| 清空数据成功 | `data_clear_success` | 点击确认按钮且后端返回成功 | `record_count` |
| 点击回收站 | `trash_entry_click` | 点击回收站按钮 | 无 |
| 回收站 pv、uv | `trash_page_view` | 用户进入回收站页 | 无 |
| 点击回收站管理按钮 | `trash_manage_click` | 点击管理按钮进入管理态 | 无 |
| 点击回收站恢复按钮 | `trash_restore_click` | 点击恢复按钮 | 无 |
| 点击回收站删除按钮 | `trash_delete_click` | 点击删除按钮 | 无 |

### 意见反馈页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 意见反馈 pv、uv | `feedback_page_view` | 用户进入意见反馈页面 | 无 |
| 意见反馈成功 | `feedback_submit_success` | 点击提交反馈且后端返回成功 | `feedback_type` |

### 系统设置页

| 事件中文名 | 事件名 | 触发时机 | 额外参数 |
|---|---|---|---|
| 点击注销账号按钮 | `account_delete_click` | 点击注销账号按钮 | 无 |
| 点击首次弹窗确定按钮 | `account_delete_first_confirm_click` | 第一次注销确认弹窗中点击确定 | 无 |
| 点击二次弹窗确定按钮 | `account_delete_second_confirm_click` | 第二次注销确认弹窗中点击确定 | 无 |
| 注销账号成功 | `account_delete_success` | 后端注销账号成功返回后 | 无 |

## 业务参数类型

| 参数名 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `scene` | string | 小程序打开场景 | `"1007"` |
| `mini_program_duration_ms` | int | 小程序本次前台使用时长，毫秒 | `125000` |
| `record_id` | string | 记录 ID | `"2026-09-23_xxx_cash"` |
| `record_type` | string | 记录类型 | `"cash"` / `"gift"` / `"meal"` |
| `from` | string | 入口来源 | `"create"` / `"contact"` / `"home"` |
| `value_class` | string | 收支方向 | `"income"` / `"expense"` |
| `has_images` | boolean | 是否有图片 | `true` / `false` |
| `record_scene` | string | 记录事由 | `"结婚"` |
| `create_duration_ms` | int | 新建记录成功耗时，毫秒 | `35000` |
| `fail_reason` | string | 失败原因 | `"network_error"` |
| `year` | string | 年份筛选值 | `"all"` / `"2026"` |
| `has_result` | boolean | 搜索是否有结果 | `true` / `false` |
| `menu_key` | string | 我的页菜单 key | `"share"` / `"about"` / `"data"` / `"feedback"` / `"settings"` |
| `action_type` | string | 导出操作类型 | `"download_local"` / `"share_friend"` |
| `record_count` | int | 清空记录数量 | `12` |
| `feedback_type` | string | 反馈类型 | `"feature"` / `"issue"` / `"complaint"` / `"other"` |

## 建议后端存储字段

建议至少存储：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string / bigint | 服务端事件 ID |
| `event_name` | string | 事件名 |
| `event_time` | datetime | 由 `timestamp` 转换 |
| `timestamp` | bigint | 客户端毫秒时间戳 |
| `user_id` | string | 用户 ID |
| `device_id` | string | 设备 ID |
| `page_path` | string | 页面路径 |
| `os_type` | string | 系统类型 |
| `network_type` | string | 网络类型 |
| `properties` | json | 完整业务参数 |
| `created_at` | datetime | 服务端接收时间 |

## 指标计算口径

| 指标 | 计算方式 |
|---|---|
| 打开次数 / 访问次数 | 按天统计 `mini_program_open` 事件总次数 |
| DAU | 按天统计 `mini_program_open`，按 `user_id` 去重 |
| 每日新增用户 | 找到每个 `user_id` 首次触发 `mini_program_open` 的日期，再按天统计 |
| 每周新增用户 | 找到每个 `user_id` 首次触发 `mini_program_open` 的日期，再按周统计 |
| 每月新增用户 | 找到每个 `user_id` 首次触发 `mini_program_open` 的日期，再按月统计 |
| 次日留存 | 某天新增用户中，第二天再次触发 `mini_program_open` 的去重用户数 / 某天新增用户数 |
| 平均使用时长 | `sum(mini_program_duration_ms)` / `mini_program_hide` 事件次数 |
| 人均使用时长 | `sum(mini_program_duration_ms)` / 去重 `user_id` 数 |
| 页面 PV | 某个页面 view 事件总次数 |
| 页面 UV | 某个页面 view 事件按 `user_id` 去重 |
| 新建成功率 | `record_create_success` / `record_create_type_click` |
| 新建失败率 | `record_create_fail` / (`record_create_success` + `record_create_fail`) |
| 礼金/礼物/请客创建比例 | 统计 `record_create_success` 中不同 `record_type` 的占比 |
| 平均新建耗时 | `avg(create_duration_ms)`，基于 `record_create_success` |

## 注意事项

- `user_id` 是主要用户去重字段；如果存在未登录或空 `user_id`，可用 `device_id` 作为兜底。
- `timestamp` 是客户端时间，后端建议同时记录服务端接收时间 `created_at`。
- `properties` 中的文本字段不应包含用户输入的敏感长文本；当前意见反馈只上报 `feedback_type`，不上报反馈内容。
- `mini_program_open` 表示进入前台，不只包括冷启动，也包括从后台切回。
- `mini_program_hide` 表示进入后台，不等同于用户真正关闭小程序。
