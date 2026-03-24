# 小说稿费记录器

一个面向中文网文/出版稿费场景的 Windows 桌面应用，用来记录每本书的每日稿费、每月稿费、年度退税，并把数据保存在本地文件中。

项目基于 `Vue 3 + Electron + sql.js`，支持 Excel 导入、WebDAV 云同步、Windows 安装包打包，适合长期本地使用。

## 主要功能

- 每日稿费录入
  - 按日期、按书记录每日稿费
  - 默认录入日期为“昨天”
  - 支持最近日期快速切换
- 每月稿费录入
  - 按书填写每月实际稿费、税后稿费
  - 自动计算税额
  - 支持年度退税录入
- 查询统计
  - 按天查询
  - 按月查询
  - 按年查询
  - 支持范围筛选与合计
- 书籍管理
  - 新增书籍
  - 修改书名
  - 删除书籍
- Excel 导入
  - 支持从既有稿费 Excel 初始化数据
  - 支持后续增量导入
  - 支持导入每日稿费和月度实际/税后稿费
- WebDAV 同步
  - 手动上传、下载
  - 自动同步
  - 可配置同步间隔
  - 同步时间按北京时间显示
- Windows 桌面体验
  - 自定义标题栏
  - 系统托盘驻留
  - 安装包支持自定义安装路径

## 界面结构

- `录入`
  - `每日稿费录入`
  - `每月稿费录入`
- `查询`
  - `按天`
  - `按月`
  - `按年`
- `设置`
  - 书籍管理
  - Excel 导入与数据库导出
  - WebDAV 配置

## 技术栈

- Vue 3
- Vite
- Electron
- sql.js
- xlsx
- dayjs

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

## 构建与打包

构建前端资源：

```bash
npm run build
```

打包 Windows 安装版：

```bash
npm run dist
```

当前默认输出目录：

- `dist-electron-107/`

说明：

- 当前默认发布的是安装版
- 安装器支持手动选择安装路径

## 数据存储

本地数据库默认保存位置：

- `AppData/Roaming/book/royalty-data.sqlite`

主要数据表：

- `books`
  - 书籍列表
- `royalty_entries`
  - 每日稿费记录
- `monthly_book_financials`
  - 每月按书的实际稿费、税后稿费、税额
- `monthly_financials`
  - 每月总汇总
- `yearly_financials`
  - 年度退税金额
- `app_meta`
  - 应用配置与元信息

## Excel 导入规则

支持导入以下内容：

- 各月份工作表中的每日稿费
- 各月份工作表右侧的按书月度汇总
  - 实际稿费
  - 税后稿费
- `全年汇总` 工作表中的月总汇总

当前导入策略：

- 重复数据按键值更新
- 不重复数据增量追加
- 手动录入优先生效
- 不会因为再次导入而清空整库

## WebDAV 同步说明

设置页需要填写：

- WebDAV 目录
- 用户名
- 密码
- 自动同步开关
- 自动同步间隔（分钟）

程序会自动使用固定数据库文件名：

- `royalty-data.sqlite`

## 项目结构

```text
src/
  App.vue
  components/
    EntryView.vue
    QueryView.vue
    SettingsView.vue
  assets/
electron/
  main.cjs
  preload.cjs
  assets/
scripts/
  afterPack.cjs
```

## 仓库约定

仓库中默认忽略：

- `node_modules/`
- `dist/`
- `dist-electron-*/`
- 本地数据库文件
- 日志与临时文件

## 许可证

MIT
