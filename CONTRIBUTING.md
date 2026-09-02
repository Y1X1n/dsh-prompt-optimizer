# Contributing

感谢你愿意为 `dsh-prompt-optimizer` 做贡献。

## 开始前

请先确认：

- Node.js 20 或更高版本
- 已安装可运行的 `dsh` 环境（如果需要做真实端到端验证）
- 熟悉 TypeScript、React 或 Node.js 中至少一个方向

## 本地开发

```sh
npm install --legacy-peer-deps
npm run sync:types
npm run typecheck
npm test
```

`npm install` 和 `npm test` 会使用 `prepare` 脚本构建 `lib/`。`lib/` 是构建产物，不要手动编辑；源码改动应放在 `src/` 或 `test/`。

如果需要验证真实 Harness 环境：

```sh
npm run build
npm pack
dsh plugin --profile web add ./dsh-prompt-optimizer-<version>.tgz
```

安装后重启 `dsh web` 并刷新 Web UI。Host 和 Client 必须使用同一版本。

## 提交改动

1. 先从 `main` 创建分支。
2. 一个分支只处理一个问题或一项改进。
3. 新增或修改逻辑时，同时补充最小的自动化测试。
4. 运行 `npm run typecheck` 和 `npm test`。
5. 如果改动影响用户操作、设置项或兼容性，请同步更新 `README.md` 和 `README.en.md`。
6. 提交 Pull Request 时说明：改了什么、为什么改、如何验证，以及是否做过真实 Harness 验证。

## 测试分布

- `test/smoke.mjs`：Host 路由、配置、SSE 和模型调用行为
- `test/prompt.test.mjs`：元提示词、上下文预算和输出解析
- `test/controller.test.mjs`：客户端状态机、SSE 消费和交互行为

优先复用现有测试辅助函数和断言风格，避免为了单个用例引入新的测试框架或运行时依赖。

## Pull Request 检查清单

- [ ] 改动范围与 PR 目标一致
- [ ] 已补充必要测试
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] 用户可见行为已同步中英文文档
- [ ] 未提交 API key、个人配置或本地生成文件
