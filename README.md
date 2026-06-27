# RuleQuant 回测终端

RuleQuant 是一个规则型开奖数据公式回测系统。它只做历史数据分析、规则公式计算、样例校验、结果可视化和报告导出；不接入支付或资金决策链路，也不使用夸大结果的文案。

## 本地运行

```bash
npm install
npm run dev
```

如果当前电脑没有全局 Node/npm，也可以使用 pnpm：

```bash
pnpm install
pnpm dev
```

打开本地地址后进入 `/dashboard`。

## 构建

```bash
npm run build
npm run start
```

## 已实现能力

- 历史开奖数据导入：CSV、TXT、Excel、粘贴表格。
- 网址实时抓取：默认支持每天更新的开奖网页，抓取后可先参与研究计算，再选择是否写入本地库。
- 自动生成 L序、D序、特码属性、总数、期号属性。
- 网页原始属性优先：网页自带生肖、五行、波色时，历史回测优先使用网页属性。
- 号码属性：头、尾、合、合尾、段、生肖、波色、五行。
- 中文公式解析：平1-平7、落1-落7、L1-D7、特码、总数、期数及属性函数。
- 规则引擎：杀一肖、杀一合、杀一尾、杀一头、杀一行、杀一段、七尾、八肖、八肖管两期、杀三肖/九肖。
- 回测中心：成功率、失败期、当前连对、最大连对、逐期计算过程。
- 规则共识候选池：统一多条规则信号，输出 Top 7/8/9 生肖、Top 16/18 号码和支持/反对证据。
- 样例校验：手算结果和程序结果逐项对比，不一致标出差异来源。
- 本地存储：IndexedDB / Dexie，本地优先，不上传用户数据。
- 导出：开奖 CSV、规则 JSON、配置 JSON、回测 Excel、候选池 Excel、候选池 HTML、样例校验 Excel、HTML 报告。

## 示例文件

- 示例开奖数据：`data/sample-draws.json`
- 示例规则库：`data/sample-rules.json`
- 默认配置摘要：`data/default-config.json`
- TXT 原始规则：`docs/raw-rules/`
- 规则理解日志：`docs/UNDERSTANDING.md`
- 交付说明：`docs/PROJECT_HANDOFF.md`
- 候选池升级说明：`docs/RULEQUANT_CANDIDATE_POOL_IMPLEMENTATION.md`

## Vercel 部署

1. 把项目推送到 GitHub。
2. 在 Vercel 新建项目并选择该仓库。
3. Framework 选择 Next.js。
4. Build Command 使用 `npm run build`。
5. Output 设置保持默认。

本项目首版采用浏览器本地存储，部署后每个使用者的数据仍保存在自己的浏览器中。后续如果做私有网页，可再加访问密码或账号体系。

## Docker 部署建议

可以使用 Node 运行 Next.js 构建产物。生产化时建议补一个 `Dockerfile`，步骤为安装依赖、执行 `npm run build`、使用 `npm run start` 启动。

## 后续桌面版建议

当前结构已把核心计算放在 `src/lib`，界面放在 `src/components` 和 `src/app`。后续可用 Tauri 或 Electron 包装 Next.js 前端，并保留 IndexedDB 或切换到本地 SQLite。

## 验证命令

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```
