# 小说稿费记录器

一个基于 `Vue 3 + Electron + sql.js` 的本地桌面应用，用来记录每本书的每日稿费、每月稿费，并支持本地数据库保存、Excel 导入、WebDAV 同步和 Windows 安装包打包。

## 功能说明

- 每日稿费录入
  - 按日期记录每本书当天稿费
  - 支持查看最近日期并快速切换
- 每月稿费录入
  - 按书填写每月实际稿费、税后稿费
  - 自动计算税额
- 查询
  - 按天查询
  - 按月查询
  - 按年查询
- 书籍管理
  - 新增书籍
  - 修改书名
  - 删除书籍
- Excel 导入
  - 支持从稿费 Excel 初始化和增量导入
  - 会导入每日稿费，以及每月的实际稿费、税后稿费
- WebDAV 同步
  - 支持手动上传、下载
  - 支持自动同步
  - 自动同步间隔可配置
  - 同步时间按北京时间显示
- Windows 打包
  - 安装版
  - 便携版

## 技术栈

- Vue 3
- Vite
- Electron
- sql.js
- xlsx

## 本地开发

安装依赖：

```bash
npm install
```

启动开发模式：

```bash
npm run dev
```

## 构建

构建前端：

```bash
npm run build
```

## 打包

打包 Windows 安装版：

```bash
npm run dist
```

打包 Windows 便携版：

```bash
npm run dist:portable
```

默认打包输出目录在：

- `dist-electron-105/`
- `dist-electron-105-portable/`

## 数据说明

本地数据库默认保存在用户目录下：

- `AppData/Roaming/book/royalty-data.sqlite`

主要表说明：

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
  - 应用配置和元信息

## Excel 导入说明

项目支持导入带有以下内容的 Excel：

- 每月工作表中的每日稿费
- 每月工作表右侧的每本书月度汇总
  - 实际稿费
  - 税后稿费
- `全年汇总` 工作表中的月汇总

导入策略为：

- 重复数据按键值更新
- 新数据增量追加
- 手动录入数据优先生效

## WebDAV 配置说明

设置页只需要填写：

- WebDAV 目录
- 用户名
- 密码
- 自动同步开关
- 自动同步间隔（分钟）

程序会自动使用固定数据库文件名：

- `royalty-data.sqlite`

## 仓库说明

仓库中已忽略以下内容：

- `node_modules/`
- `dist/`
- `dist-electron-*/`
- 本地数据库文件

## 许可证

MIT
