# RuleQuant Terminal

RuleQuant 是一个中文规则计算、历史回测和综合参考终端。项目采用 Next.js App Router，浏览器端以 IndexedDB 保存本机数据，同时支持服务端同步和静态只读发布。

## 本地开发

需要 Node.js 20.9 或更高版本以及 pnpm 11.19.0。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

默认开发地址为 `http://localhost:3000`。常用检查：

```powershell
pnpm test -- --run
pnpm typecheck
pnpm build
pnpm build:static
```

## 发布方式

- 源码仓库 `Xrenyan/rulequant-terminal` 连接 Vercel，使用标准 `pnpm build` 并保留 Next.js API 路由。
- 静态仓库 `Xrenyan/rulequant-terminal-pages` 保留既有 Pages 地址；运行 `scripts/publish-github-pages.ps1` 会构建并推送 `out`。
- GitHub Actions 会在源码分支和拉取请求上同时验证完整构建与静态构建。
- `NEXT_PUBLIC_*` 会进入浏览器代码，不能存放真实密钥。
- 数据库、GitHub 写入、定时任务和管理口令必须配置为 Vercel 或 GitHub Secrets。

环境变量名称见 `.env.example`。浏览器测试输出、构建产物、依赖和本机环境文件均不提交到仓库。

## 主要模块

- 开奖数据同步与导入
- 公式库、解析、校验和逐期计算
- 历史回测与公式筛选
- 综合参考候选与专项概率观察
- 本机 IndexedDB、静态状态及服务端云状态

本项目用于公式研究与历史分析，结果不代表未来表现。
