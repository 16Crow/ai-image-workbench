# AI 图像处理工作台

这是一个基于 `Vue 3 + Vite` 前端、`Express` 后端的本地工具，用来上传图片、框选主体区域，并调用外部图像编辑接口完成图片处理。

当前前端已经改为“快捷功能”模式，用户不再手填提示词，现阶段内置两个功能：

- `提取印花`
- `转高清`

## 项目结构

```text
ai-image-workbench/
├─ client/                 # 前端界面（Vue 3 + Vite + Element Plus）
├─ server/                 # 后端接口（Express）
├─ docs/                   # 项目文档
└─ README.md
```

## 当前处理流程

1. 用户上传图片，并可先框选主体区域。
2. 用户选择快捷功能，例如 `提取印花` 或 `转高清`。
3. 前端通过 `POST /api/upload` 把图片、功能信息和内置 prompt 发给后端。
4. 后端调用外部 `images/edits` 风格接口。
5. 后端把返回结果保存到 `server/outputs/`。
6. 前端轮询任务状态，展示原图、结果图、对比和下载。

## 运行前提

### 1. 安装 Node.js

建议使用 `Node.js 20+`。

### 2. 配置后端环境变量

后端使用 `server/.env.local` 读取本地配置。最少需要配置接口密钥：

```env
IMAGE_API_KEY=你的密钥
PORT=3001
```

常用完整示例：

```env
IMAGE_API_KEY=你的密钥
IMAGE_EDIT_API_URL=https://aibibo.com/v1/images/edits
IMAGE_MODEL=gpt-image-2
IMAGE_FIELD_NAME=image[]
IMAGE_RESPONSE_FORMAT=b64_json
PORT=3001
```

说明：

- `IMAGE_API_KEY`：外部图像接口密钥
- `IMAGE_EDIT_API_URL`：外部图像编辑接口地址
- `IMAGE_MODEL`：默认模型名
- `IMAGE_FIELD_NAME`：上传图片字段名，默认是 `image[]`
- `IMAGE_RESPONSE_FORMAT`：如果服务兼容 `b64_json`，可以显式设置
- `PORT`：后端端口，当前项目默认使用 `3001`

## 安装依赖

分别安装前后端依赖：

```powershell
cd server
npm install
```

```powershell
cd client
npm install
```

## 启动项目

### 启动后端

```powershell
cd server
npm run dev
```

后端默认地址：

```text
http://localhost:3001
```

### 启动前端

```powershell
cd client
npm run dev
```

前端默认地址：

```text
http://localhost:5173
```

前端通过 Vite 代理把 `/api`、`/uploads`、`/outputs` 请求转发到后端 `3001` 端口。

## 使用方式

1. 打开 `http://localhost:5173`
2. 上传图片并按需框选主体区域
3. 选择快捷功能
4. 点击“开始处理”
5. 等待任务状态从 `pending/processing` 变成 `success`
6. 查看结果图、原图大图、对比图并下载

## 主要接口

- `POST /api/upload`：上传图片并创建任务，支持 `image`、`prompt`、`model`、`featureKey`、`featureLabel`
- `GET /api/task/:taskId`：查询单个任务状态
- `GET /api/tasks`：获取任务列表
- `GET /api/download/:taskId`：下载处理结果
- `GET /api/health`：查看服务状态和外部接口配置状态

静态资源目录：

- `/uploads/*`：原始上传图片
- `/outputs/*`：处理后的结果图片

## 常见问题

### 上传时报“未配置外部图像接口密钥”

说明后端缺少 `IMAGE_API_KEY`，先检查 `server/.env.local` 后再重启服务。

### 上传后任务失败

优先检查：

1. `IMAGE_EDIT_API_URL` 是否正确。
2. `IMAGE_API_KEY` 是否可用。
3. `IMAGE_MODEL` 是否是服务支持的模型名。
4. 服务要求的图片字段名是否真的是 `image[]`，如果不是，改 `IMAGE_FIELD_NAME`。

### 页面打不开结果图

先确认：

1. 后端是否已经启动在 `3001`。
2. 前端是否已经重启并使用最新代理配置。
3. `server/outputs/` 下是否已经生成结果文件。

## 开发说明

- 前端入口：`client/src/App.vue`
- 上传与快捷功能：`client/src/components/UploadWorkbench.vue`
- 任务列表：`client/src/components/TaskListPanel.vue`
- 前端接口封装：`client/src/api.ts`
- 后端入口：`server/index.js`
- 外部图像接口封装：`server/imageProvider.js`

## 新人文档

新人第一次接手项目，优先看：

- `docs/新人启动指南.md`
