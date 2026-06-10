# 长期固定网址部署指南

如果你想让网站“谁都能长期访问”，不要使用临时 `trycloudflare.com` 地址。临时地址需要你的电脑和黑色窗口一直开着，而且每次可能变化。

长期固定网址的核心思路是：

1. 把项目上传到 GitHub。
2. 在 Render 上连接这个 GitHub 仓库。
3. 部署 Node 服务。
4. 开启 Persistent Disk 保存 `data/store.json`。

## 推荐方案：Render

这个项目已经包含 Render 配置：

```text
render.yaml
```

Render 部署后会提供固定网址，类似：

```text
https://study-planner-real.onrender.com
```

### 第一步：上传到 GitHub

1. 新建一个 GitHub 仓库，例如 `study-planner-real`。
2. 上传本文件夹中的项目文件。
3. 不要上传这些运行文件：
   - `.tools/`
   - `data/store.json`
   - `*.log`
   - `*.zip`

这些文件已经写在 `.gitignore` 中。

### 第二步：在 Render 创建服务

1. 打开 Render。
2. 新建 Web Service，选择刚刚的 GitHub 仓库。
3. 环境选择 Node。
4. 启动命令使用：

```bash
node server.mjs
```

如果 Render 识别到 `render.yaml`，可以按 Blueprint/配置文件方式创建。

### 第三步：开启持久磁盘

这一步很重要。网站数据写入：

```text
data/store.json
```

如果没有 Persistent Disk，服务重启或重新部署后，学习计划、任务、打卡、预约数据可能丢失。

建议磁盘配置：

```text
Mount Path: /opt/render/project/src/data
Size: 1 GB
```

项目里的 `render.yaml` 已经按这个路径配置。

### 第四步：部署后测试

部署完成后，打开 Render 给你的网址。

测试顺序：

1. 输入邀请码，例如 `KAOYAN-2026`。
2. 输入你的昵称进入。
3. 添加一条任务。
4. 用另一个浏览器或手机打开同一个网址。
5. 输入同一个邀请码，确认能看到同一条任务。

## 为什么不推荐 Vercel

当前版本是一个长期运行的 Node 服务，数据保存在服务器文件 `data/store.json` 中。

Vercel 更适合静态站或 Serverless API，不适合这个版本直接写本地持久文件。因此当前版本更推荐 Render、VPS、Railway/类似带磁盘服务的平台。

## 其他方案

### VPS 或云服务器

在服务器上运行：

```bash
node server.mjs
```

然后用 Nginx、Caddy 或平台自带代理把公网域名转发到服务端口。

### Docker

```bash
docker build -t study-planner-real .
docker run -p 4173:4173 -v study-data:/app/data study-planner-real
```

这种方式也必须挂载 `/app/data`，否则数据不会长期保存。
