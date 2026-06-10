# GitHub 上传清单

上传前确认：

- 保留：`public/`
- 保留：`server/`
- 保留：`tests/`
- 保留：`server.mjs`
- 保留：`package.json`
- 保留：`render.yaml`
- 保留：`Dockerfile`
- 保留：`README.md`
- 保留：`PUBLIC_DEPLOYMENT.md`
- 保留：启动脚本 `start-*.cmd` 和 `start-*.ps1`
- 不上传：`.tools/`
- 不上传：`data/store.json`
- 不上传：`*.log`
- 不上传：`*.zip`

如果你用 GitHub 网页上传，可以直接上传我生成的 `study-planner-real-github.zip` 解压后的内容。

上传后，在 GitHub 页面确认没有出现：

```text
.tools
cloudflared.err.log
cloudflared.out.log
server.err.log
server.out.log
data/store.json
```

Render 部署时必须开启 Persistent Disk，并把磁盘挂载到：

```text
/opt/render/project/src/data
```
