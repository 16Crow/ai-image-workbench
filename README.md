# AI 图像处理工作台

这是一个基于 `Vue 3 + Vite` 前端、`Express` 后端、`ComfyUI` 推理服务的本地工具，用来做 AI 生图处理与图案提取。

## 项目结构

```text
ai-image-workbench/
├─ client/                 # 前端界面（Vue 3 + Vite + Element Plus）
├─ server/                 # 后端接口（Express）
└─ comfyui/
   └─ workflow-print-extract.json   # 提交给 ComfyUI 的工作流
```

## 这是个什么项目

用户在前端上传一张衣服图片后，后端会：

1. 接收并保存上传图片。
2. 把图片上传到本地运行中的 `ComfyUI`。
3. 使用 `comfyui/workflow-print-extract.json` 提交工作流。
4. 轮询等待 ComfyUI 处理完成。
5. 下载结果图片并保存到 `server/outputs/`。
6. 前端展示原图、处理状态、结果图，并支持下载。

## 运行前提

启动这个项目前，需要先满足下面几个条件：

### 1. 安装 Node.js

建议使用 `Node.js 18+`，更稳妥建议 `Node.js 20+`。

### 2. 本地可用的 ComfyUI

后端代码默认会连接：

```text
http://127.0.0.1:8188
```

默认情况下，后端启动时会先检测这个地址；如果没检测到运行中的实例，会尝试自动启动本机 ComfyUI。

如果你的 ComfyUI 不在这个地址，可以通过环境变量覆盖：

```powershell
$env:COMFYUI_URL="http://127.0.0.1:8188"
```

如果你不希望后端自动启动 ComfyUI，可以关闭：

```powershell
$env:COMFYUI_AUTOSTART="false"
```

默认自动启动使用的目录和 Python 为：

```text
COMFYUI_DIR=E:\myprojects\ComfyUI
COMFYUI_PYTHON=E:\myprojects\ComfyUI\venv\Scripts\python.exe
```

也可以手动覆盖：

```powershell
$env:COMFYUI_DIR="E:\myprojects\ComfyUI"
$env:COMFYUI_PYTHON="E:\myprojects\ComfyUI\venv\Scripts\python.exe"
```

后端现在会自动探测 ComfyUI 这套 Python 环境里的 `torch.cuda.is_available()`：

- 如果检测到 GPU 可用，则按默认 GPU 模式启动
- 如果检测到 GPU 不可用，则自动追加 `--cpu`

如果你想手动覆盖启动参数，也可以自己指定：

```powershell
$env:COMFYUI_ARGS="--cpu"
```

### 3. ComfyUI 里要有 `PrintExtract` 节点

`comfyui/workflow-print-extract.json` 里用到了这个节点：

```json
"class_type": "PrintExtract"
```

说明这个项目依赖一个自定义 ComfyUI 节点或你本地已有同名节点。  
如果 ComfyUI 里没有这个节点，后端任务会提交失败。

## 安装依赖

这个仓库里目前已经包含了 `client/node_modules` 和 `server/node_modules`，理论上可以直接启动。

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

通常需要开 3 部分：

1. `ComfyUI`
2. 后端 `server`
3. 前端 `client`

### 第一步：启动 ComfyUI

现在有两种方式：

#### 方式 A：让后端自动启动

直接启动后端即可，后端会：

1. 先检查 `COMFYUI_URL`
2. 如果 ComfyUI 未运行，则尝试自动启动
3. 等待 ComfyUI 就绪后再启动接口服务

```powershell
cd server
npm run dev
```

#### 方式 B：手动启动 ComfyUI

确保 ComfyUI 正常运行，并且能在浏览器打开：

```text
http://127.0.0.1:8188
```

### 第二步：启动后端

在项目根目录打开终端后执行：

```powershell
cd server
npm run dev
```

或生产方式：

```powershell
cd server
npm start
```

后端默认端口：

```text
http://localhost:3000
```

启动后终端会打印类似：

```text
服务已启动: http://localhost:3000
ComfyUI 地址: http://127.0.0.1:8188
ComfyUI 自动启动: 开启
[ComfyUI] 已检测到运行中的实例
```

### 第三步：启动前端

新开一个终端执行：

```powershell
cd client
npm run dev
```

前端默认地址：

```text
http://localhost:5173
```

前端通过 Vite 代理把 `/api` 请求转发到后端 `http://localhost:3000`。

## 使用方式

1. 打开 `http://localhost:5173`
2. 上传服装图片
3. 点击“开始提取印花”
4. 等待任务状态从 `pending/processing` 变成 `success`
5. 查看结果图并下载

## 主要接口

后端提供了这些接口：

- `POST /api/upload`：上传图片并创建任务
- `GET /api/task/:taskId`：查询单个任务状态
- `GET /api/tasks`：获取任务列表
- `GET /api/download/:taskId`：下载提取结果
- `GET /api/health`：查看服务和 ComfyUI 就绪状态

静态资源目录：

- `/uploads/*`：原始上传图片
- `/outputs/*`：处理后的结果图片

## 常见问题

### 前端能打开，但上传后一直失败

先检查后端是否启动：

```text
http://localhost:3000/api/tasks
```

如果打不开，说明 `server` 没启动。

### 后端启动了，但任务失败

优先检查：

1. `ComfyUI` 是否已经运行。
2. `COMFYUI_URL` 是否配置正确。
3. `PrintExtract` 自定义节点是否存在。
4. `comfyui/workflow-print-extract.json` 是否能在你的 ComfyUI 环境执行。

### 前端页面正常，但没有结果图

说明任务可能没有从 ComfyUI 返回图片。  
后端里如果没有取到输出图片，会报这个错误：

```text
ComfyUI 未返回结果图片
```

这通常是工作流没有成功执行，或输出节点没有产出图片。

## 开发说明

- 前端入口：`client/src/App.vue`
- 前端接口封装：`client/src/api.ts`
- 后端入口：`server/index.js`
- ComfyUI 调用封装：`server/comfyui.js`
- 工作流配置：`comfyui/workflow-print-extract.json`

## 当前默认端口

- 前端：`5173`
- 后端：`3000`
- ComfyUI：`8188`

## 最短启动命令

如果依赖已安装，最短可以这样启动：

```powershell
cd server
npm run dev
```

```powershell
cd client
npm run dev
```

然后打开：

```text
http://localhost:5173
```

默认情况下，后端会尝试自动启动 `E:\myprojects\ComfyUI`。前提是该 ComfyUI 环境可正常运行，并且具备 `PrintExtract` 节点。
