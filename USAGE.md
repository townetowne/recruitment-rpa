# Recruitment RPA 使用方法

当前版本：`0.1.16`

这是一个本地运行的 BOSS 岗位筛选 RPA。它的目标不是自动海投，而是读取完整 JD、识别可沟通状态、生成可复盘证据，再交给 `career-ops-cn` 做评分和人工审核。

## 1. 两个项目的关系

```text
recruitment-rpa = Chrome 插件 + 本机 runner + BOSS 页面读取 + JSONL 证据
career-ops-cn = 个人画像 + 岗位评分 + 去重 + P0/P1/P2 排序 + 审核文件
```

完整命令 `npm run boss:collect-score` 会先用 `recruitment-rpa` 抓岗位，再把候选写入 `career-ops-cn/data/boss-candidates.json`，最后调用 `career-ops-cn` 的：

```text
boss-score.mjs
boss-match.mjs
boss-review.mjs
```

所以：

- 只测试插件读取页面，不需要 `career-ops-cn`。
- 要输出匹配分数和审核清单，必须安装 `career-ops-cn`。
- 本仓库内置一个干净版 `career-ops-cn` lite 模板，供 `npm run setup:career-ops` 复制使用。
- 不建议直接上传你的本地 career-ops-cn，因为它通常包含个人简历、画像、岗位数据、沟通记录和运行产物。

## 2. 从空白机器安装

下载本仓库：

```text
https://codeload.github.com/townetowne/recruitment-rpa/zip/refs/heads/main
```

下载 ZIP 后解压，进入项目目录。Git clone 是可选方式：

```bash
git clone https://github.com/townetowne/recruitment-rpa.git
cd recruitment-rpa
```

安装 `career-ops-cn` 评分引擎：

```bash
npm run setup:career-ops
```

setup 命令默认复制本仓库内置干净版 `career-ops-cn` lite 到相邻目录 `../career-ops-cn`。这个 lite 模板包含默认 `config/profile.yml`，所以空白机器可以直接跑通；认真求职前应该把 profile 改成自己的经历、目标岗位、城市和薪资。

如果 `career-ops-cn` 不在相邻目录，运行抓取时指定路径：

```bash
npm run boss:collect-score -- --query "AI 架构师" --city 武汉 --target 50 --limit 50 --threshold 4 --career-ops-root /path/to/career-ops-cn
```

## 3. 安装 Chrome 插件

1. 打开 Chrome。
2. 进入 `chrome://extensions`。
3. 打开右上角 `Developer mode`。
4. 点击 `Load unpacked`。
5. 选择本仓库里的 `chrome-extension` 目录。
6. 确认插件名称是 `Genesis Recruitment RPA`。

当前插件权限：

```text
storage
scripting
alarms
```

当前站点权限：

```text
https://www.zhipin.com/*
http://127.0.0.1/*
http://localhost/*
```

含义：

- `www.zhipin.com`：读取用户已经登录的 BOSS 页面。
- `127.0.0.1` / `localhost`：连接本机 runner。

## 4. 登录 BOSS

在 Chrome 里登录自己的 BOSS 账号，并完成短信、验证码、设备校验或安全验证。

插件不会读取账号密码，不会导出 cookie，不会绕过验证码或风控。

## 5. 打开 BOSS 职位页

打开一个 BOSS 职位列表页，例如先手动搜索目标岗位和城市。

插件会自动选择唯一可用的 BOSS 标签；如果同时打开多个 BOSS 标签，可以在插件 popup 里选择目标标签。

## 6. 运行抓取评分命令

在本仓库目录执行：

```bash
npm run boss:collect-score -- --query "AI 架构师" --city 武汉 --target 50 --limit 50 --threshold 4
```

常用参数：

```text
--query       搜索关键词
--queries     多个搜索关键词，用英文逗号分隔
--city        目标城市
--target      RPA 目标抓取数量，范围 20-50
--limit       评分后输出数量
--threshold   入队评分阈值
--max-pages   最多读取页数，默认 10
```

多个关键词可以这样写：

```bash
npm run boss:collect-score -- --queries "AI 架构师,大数据架构师,Java 架构师" --city 武汉 --target 50 --limit 50 --threshold 4
```

## 7. 查看结果

主要审核结果：

```text
../career-ops-cn/data/boss-review.md
../career-ops-cn/data/boss-review.json
```

候选池和评分结果：

```text
../career-ops-cn/data/boss-candidates.json
../career-ops-cn/data/boss-queue.json
../career-ops-cn/data/boss-match-pool.json
../career-ops-cn/data/boss-match-review.md
```

RPA 原始过程记录：

```text
$HOME/.codex/state/recruitment-rpa/boss-城市-YYYYMMDD.jsonl
```

## 8. 程序链路

```text
boss-collect-score.mjs
→ local-runner-server.mjs
→ Chrome extension background polling
→ content script read_route_contract
→ content script read_job_cards
→ verified same-site job_detail route navigation
→ content script read_job_detail
→ complete JD / city / contact-state gates
→ JSONL checkpoint
→ career-ops-cn scoring
→ review file
```

## 9. 当前可执行任务

Chrome extension background 只接受白名单 action：

```text
read_runtime_diagnostics
ensure_search_route
read_route_contract
read_job_cards
read_job_detail
page_context_fetch
```

## 10. 当前边界

支持：

- BOSS 岗位列表读取。
- BOSS 岗位详情读取。
- 完整 JD gate。
- base 城市 gate。
- 可沟通 / 已沟通 / 停止招聘状态识别。
- JSONL checkpoint。
- 输出到 `career-ops-cn` 评分链路。

不支持：

- 无人值守批量投递。
- 绕过验证码、安全验证或平台风控。
- 截图、OCR、坐标点击或视觉自动化。
- 导出 cookie、保存 token、读取账号密码。
- 未经人工审核的真实发送、投递或附件上传。

## 11. 测试

```bash
npm test
```
