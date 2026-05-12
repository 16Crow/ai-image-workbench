# AI 图像处理工作台

这是一个基于 `Vue 3 + Vite` 前端、`Express` 后端的本地工具，用来上传图片、输入处理指令，并由后端转调外部图像编辑模型完成 AI 图片处理。

## 项目结构

```text
ai-image-workbench/
├─ client/                 # 前端界面（Vue 3 + Vite + Element Plus）
├─ server/                 # 后端接口（Express）
└─ comfyui/                # 旧版本地工作流目录，当前主流程已不再依赖
```

## 当前处理流程

1. 用户在前端上传图片，并可先框选主要处理区域。
2. 用户输入自然语言处理指令，例如“改成白底电商图，保留花纹”。
3. 前端通过 `POST /api/upload` 把图片和 prompt 一起发给后端。
4. 后端调用外部 `images/edits` 风格接口。
5. 后端把返回结果保存到 `server/outputs/`。
6. 前端轮询任务状态，展示结果图并支持下载。

## 运行前提

### 1. 安装 Node.js

建议使用 `Node.js 18+`，更稳妥建议 `Node.js 20+`。

### 2. 配置外部图像接口

后端默认按类似下面这种接口格式调用：

```text
POST https://aibibo.com/v1/images/edits
Authorization: Bearer <your_key>
multipart/form-data:
  model=gpt-image-2
  prompt=...
  image[]=@your_file
```

推荐通过环境变量配置：

```powershell
$env:IMAGE_EDIT_API_URL="https://aibibo.com/v1/images/edits"
$env:IMAGE_API_KEY="你的密钥"
$env:IMAGE_MODEL="gpt-image-2"
```

可选配置：

```powershell
$env:IMAGE_FIELD_NAME="image[]"
$env:IMAGE_RESPONSE_FORMAT="b64_json"
$env:IMAGE_DEFAULT_PROMPT="请根据这张图片完成高质量图像编辑"
```

说明：

- `IMAGE_EDIT_API_URL`：外部图像编辑接口地址
- `IMAGE_API_KEY`：接口密钥
- `IMAGE_MODEL`：默认模型名
- `IMAGE_FIELD_NAME`：上传图片字段名，默认是 `image[]`
- `IMAGE_RESPONSE_FORMAT`：如果服务兼容 `b64_json`，可以显式设置
- `IMAGE_DEFAULT_PROMPT`：前端未传 prompt 时的兜底文案

## 安装依赖

如果你想重新安装依赖，分别执行：

```powershell
cd server
npm install
```

```powershell
cd client
npm install
```

## 怎么启动

### 第一步：启动后端

```powershell
cd server
npm run dev
```

或生产方式：

```powershell
cd server
npm start
```

后端默认地址：

```text
http://localhost:3000
```

### 第二步：启动前端

```powershell
cd client
npm run dev
```

前端默认地址：

```text
http://localhost:5173
```

前端通过 Vite 代理把 `/api`、`/uploads`、`/outputs` 请求转发到后端。

## 使用方式

1. 打开 `http://localhost:5173`
2. 上传图片并按需框选主体区域
3. 输入处理指令
4. 点击“开始处理”
5. 等待任务状态从 `pending/processing` 变成 `success`
6. 查看结果图并下载

## 主要接口

- `POST /api/upload`：上传图片并创建任务，支持 `image`、`prompt`、`model`
- `GET /api/task/:taskId`：查询单个任务状态
- `GET /api/tasks`：获取任务列表
- `GET /api/download/:taskId`：下载处理结果
- `GET /api/health`：查看服务状态和外部接口配置状态

静态资源目录：

- `/uploads/*`：原始上传图片
- `/outputs/*`：处理后的结果图片

## 常见问题

### 上传时报“未配置外部图像接口密钥”

说明后端缺少 `IMAGE_API_KEY`，先设置环境变量再启动服务。

### 上传后任务失败

优先检查：

1. `IMAGE_EDIT_API_URL` 是否正确。
2. `IMAGE_API_KEY` 是否可用。
3. `IMAGE_MODEL` 是否是服务支持的模型名。
4. 服务要求的图片字段名是否真的是 `image[]`，如果不是，改 `IMAGE_FIELD_NAME`。

### 接口成功了，但页面没有结果图

当前后端支持两种常见返回格式：

- `data[0].url`
- `data[0].b64_json`

如果你的服务返回结构不同，需要按真实响应格式调整 `server/imageProvider.js`。

## 开发说明

- 前端入口：`client/src/App.vue`
- 上传与 prompt：`client/src/components/UploadWorkbench.vue`
- 前端接口封装：`client/src/api.ts`
- 后端入口：`server/index.js`
- 外部图像接口封装：`server/imageProvider.js`

## 当前默认端口

- 前端：`5173`
- 后端：`3000`
