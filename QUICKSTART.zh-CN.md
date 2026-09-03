# 小白快速开始：从一台空白机器跑通 BOSS RPA

这个工具不是自动海投软件。它先帮你把 BOSS 上的岗位读完整，排除停止招聘、已沟通、城市不匹配、JD 不完整的岗位，再交给评分引擎生成 P0/P1/P2 审核清单。

## 你最终只需要做三件事

1. 安装 Chrome 插件。
2. 登录 BOSS。
3. 安装 Node.js 后运行一条命令。

第一次使用还需要把项目代码下载到本机。下面按空白机器从零开始写。

## 0. 下载项目代码

先安装 Chrome 浏览器。

然后下载本项目。推荐直接下载 ZIP：

```text
https://codeload.github.com/townetowne/recruitment-rpa/zip/refs/heads/main
```

下载后解压，进入 `recruitment-rpa-main` 文件夹。如果你想把文件夹名称改短，可以改成 `recruitment-rpa`。

Git clone 是可选方式。会用 Git 且网络稳定的用户也可以执行：

```bash
git clone https://github.com/townetowne/recruitment-rpa.git
cd recruitment-rpa
```

没有安装 Git 的用户也可以在 GitHub 页面点击 `Code` → `Download ZIP`，效果和上面的直接 ZIP 链接一致。

## 1. 安装 Chrome 插件

1. 打开 Chrome。
2. 地址栏输入 `chrome://extensions`。
3. 打开右上角 `Developer mode`。
4. 点击 `Load unpacked`。
5. 选择本项目里的 `chrome-extension` 目录。
6. 看到 `Genesis Recruitment RPA` 就说明插件安装好了。

## 2. 登录 BOSS

在 Chrome 里打开 BOSS 直聘，自己完成登录、短信、验证码、设备校验或安全验证。

这个工具不会接管登录，不会保存账号密码，不会导出 cookie，也不会绕过验证码。

## 3. 安装 Node.js

打开 Node.js 官网下载安装 LTS 版本：

```text
https://nodejs.org/
```

安装完成后打开终端，确认能看到版本号：

```bash
node -v
npm -v
```

## 4. 准备评分引擎 career-ops-cn

`recruitment-rpa` 负责从 BOSS 抓取岗位；`career-ops-cn` 负责评分、去重、P0/P1/P2 排序和生成审核文件。

所以完整跑通 `boss:collect-score` 必须安装 `career-ops-cn`。在 `recruitment-rpa` 目录执行：

```bash
npm run setup:career-ops
```

这个命令会把本项目内置干净版 `career-ops-cn` 安装到相邻目录：

```text
../career-ops-cn
```

内置干净版只包含最小评分链、默认 profile 和必要依赖，不包含任何个人简历、cookie、沟通日志或历史岗位数据。机器上有 Git 时也不需要额外克隆；没有安装 Git 也能靠 Node.js 完成这一步。

如果你已经有自己的 `career-ops-cn`，可以跳过这一步，运行抓取时用 `--career-ops-root` 指定它的位置。

认真使用前，建议打开这个文件改成你自己的目标画像：

```text
../career-ops-cn/config/profile.yml
```

不修改也能跑通软件，但评分会按内置的 AI 架构师 / Java 架构师 / 武汉默认画像执行。

## 5. 打开 BOSS 职位页

在 Chrome 里打开 BOSS 职位搜索页，例如：

```text
关键词：AI 架构师
城市：武汉
```

保持这个 BOSS 标签页打开。插件会自动选择可用的 BOSS 标签，并连接本机 runner。

## 6. 运行抓取和评分

在 `recruitment-rpa` 目录执行：

```bash
npm run boss:collect-score -- --query "AI 架构师" --city 武汉 --target 50 --limit 50 --threshold 4
```

看到这些状态说明链路跑通：

```text
runner_started
runner_ready
completed
```

## 7. 查看结果

最重要的是这个文件：

```text
../career-ops-cn/data/boss-review.md
```

它是给人看的岗位审核清单，包含岗位链接、匹配分数、P0/P1/P2 分层和筛选原因。

同时会生成：

```text
../career-ops-cn/data/boss-review.json
../career-ops-cn/data/boss-match-pool.json
../career-ops-cn/data/boss-queue.json
../career-ops-cn/data/boss-candidates.json
```

RPA 原始过程记录在：

```text
$HOME/.codex/state/recruitment-rpa/
```

## 它会自动排除什么

- 停止招聘的岗位
- 已经沟通过的岗位
- 城市不匹配的岗位
- JD 不完整的岗位
- 评分低于阈值的岗位
- 命中风险规则的岗位

## 它不会做什么

- 不会自动投递
- 不会自动发消息
- 不会绕过验证码
- 不会导出 cookie
- 不会用截图或坐标点网页

## 内置评分目录是什么

`career-ops-cn lite` 已经内置在本仓库里，位置是：

```text
vendor/career-ops-cn
```

它不是另一个必须单独下载的项目。`npm run setup:career-ops` 只是把这份内置模板复制到相邻运行目录：

```text
../career-ops-cn
```

这个相邻目录用来保存你的 profile、候选池、评分结果和审核文件。这样做是为了让工具运行时生成的数据不混进插件源码目录。

## 常见问题

`Missing script: boss:collect-score`

说明你不在 `recruitment-rpa` 目录。先进入项目目录：

```bash
cd recruitment-rpa
```

`runner_ready` 一直不出现

检查 Chrome 插件是否安装并启用，BOSS 页面是否已经打开，插件是否有 `On zhipin.com` 的站点权限。

结果不是 50 条

正常。`target` 是目标数量，不是保证数量。停止招聘、已沟通、JD 不完整、城市不匹配的岗位都会被过滤。
