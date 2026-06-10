# 双人学习计划

这是一个真实可用的双人学习计划网站，适合两个人一起管理考研和期末复习。

部署到公网后，任何人只要拿到网址和邀请码，就可以加入对应学习小组。

它支持：

- 学习计划：考研/期末分类、科目、阶段目标、截止日期、进度。
- 每日任务：添加、筛选、完成、取消完成、编辑、删除。
- 打卡：记录每日学习时长、完成摘要和备注。
- 预约：创建个人学习时段或共同自习邀约。
- 分享：同一个邀请码进入同一个学习小组。
- 备份：导出/导入同一邀请码下的数据。

## 本地临时公网使用

双击：

```text
start-anyone-can-use.cmd
```

它会启动本机网站，并生成一个临时 `https://xxxxx.trycloudflare.com` 公网地址。

注意：这个地址只适合临时使用。黑色窗口、电脑或网络关闭后，地址通常会失效。

## 长期固定网址

长期使用推荐部署到 Render，并开启 Persistent Disk。部署完成后会得到一个固定网址，例如：

```text
https://your-app-name.onrender.com
```

详细步骤见：

```text
PUBLIC_DEPLOYMENT.md
```

## 数据保存

网站数据保存在服务器端：

```text
data/store.json
```

所以长期部署时必须使用带持久磁盘的服务。不要把本地 `data/store.json` 上传到 GitHub，它可能包含你测试时创建的小组和成员数据。

## 开发命令

```bash
npm.cmd test
node server.mjs
```

服务器默认端口是 `4173`，也可以通过环境变量指定：

```bash
PORT=4174 node server.mjs
```

Windows PowerShell:

```powershell
$env:PORT="4174"; node server.mjs
```
