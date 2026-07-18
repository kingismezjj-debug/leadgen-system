# IZYLEADS 获客系统

一个面向本地商户和外贸获客的工作台：用关键词、行业和区域整理商户线索，再做官网公开邮箱发现、线索去重、CSV 导出、邮件活动和 WhatsApp 活动。

## 重要边界

- 线索信息来自用户输入、公开商户资料、公开网页和用户授权配置的数据服务。
- 公开商户资料通常可能包含商户名称、类型、地址、电话、官网和评分等；邮箱通常需要从商户官网的公开页面尝试发现。
- 邮件发送默认是 dry-run。真实发送需要配置 SMTP 或 `JARVIS_EMAIL_ENDPOINT`，并遵守 CAN-SPAM、退订、限频和本地法律要求。

## 启动

```bash
npm install
Copy-Item .env.example .env
npm run dev:full
```

前端：http://127.0.0.1:5190  
后端：http://127.0.0.1:8790

## 环境变量

```env
GOOGLE_MAPS_API_KEY=
PLACES_LANGUAGE_CODE=zh-CN
PLACES_REGION_CODE=US

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

JARVIS_EMAIL_ENDPOINT=
JARVIS_EMAIL_TOKEN=
UNSUBSCRIBE_URL=https://example.com/unsubscribe
EMAIL_DAILY_LIMIT=25
```

## 工作流

1. 在前端输入关键词和区域，例如 `dentist` + `New York, NY`。
2. 搜索结果写入本地 JSON 线索库，并按 `placeId`、官网或名称地址去重。
3. 可选择对商户官网执行邮箱发现，或在线索表中逐条补邮箱。
4. 在邮件活动里用模板变量生成内容：`{{name}}`、`{{companyType}}`、`{{address}}`、`{{phone}}`。
5. 先 dry-run 预览，再配置 SMTP 或 Jarvis 适配器后真实发送。

## Jarvis 邮件适配

当前找到的 Jarvis 项目没有现成群发邮件模块，因此这里预留通用 HTTP 适配器。配置 `JARVIS_EMAIL_ENDPOINT` 后，系统会对每封邮件发送：

```json
{
  "to": "owner@example.com",
  "subject": "邮件主题",
  "text": "邮件正文"
}
```

如果 Jarvis 的真实接口字段不同，只需要改 `server/mailer.mjs` 的 `sendViaJarvis`。

## 数据文件

本地数据保存在：

```text
server/data/store.json
```

这个 MVP 先用 JSON 存储，后续可替换为 SQLite/Postgres，并加入账号、团队、任务队列、退订落地页和发送节流。

## 维护说明

生产环境请通过 `.env` 或管理员设置维护服务密钥、发信配置和退订地址，避免将运行数据、日志或密钥提交到代码仓库。
