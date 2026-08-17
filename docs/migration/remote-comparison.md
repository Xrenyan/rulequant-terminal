# 旧仓库与迁移项目比较

- 远端仓库：`Xrenyan/rulequant-terminal-pages`
- 默认分支：`main`
- 远端历史：286 个提交，最早提交为 2026-06-27 的静态站点发布。
- 远端内容：GitHub Pages 静态构建文件及每日刷新的 `static-cloud-state.json`。
- 远端没有：`src`、`tests`、`scripts`、`package.json`、锁文件或构建配置。
- 结论：D 盘迁移包是开发源码主体；远端仓库仅提供发布历史和既有 Pages 地址。
- 浏览器账号还显示 `Xrenyan/rulequant-terminal` 源码仓库；它需要 GitHub CLI 设备授权后才能读取和接回。

恢复工作在 `recovery/development-environment` 分支进行，不直接修改远端 `main`。
