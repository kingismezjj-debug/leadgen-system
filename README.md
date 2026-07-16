# Google Maps 获客系统

一个面向本地商户获客的 MVP：用关键词和区域调用 Google Places API 获取商户线索，再做官网公开邮箱发现、线索去重、CSV 导出和邮件活动 dry-run/发送。

## 重要边界

- 采集层使用 Google Places API，不直接爬 Google Maps 页面。
- Google Places 通常返回商户名称、类型、地址、电话、官网、评分、地图链接等；邮箱不属于 Places 常规返回字段，本项目只会在商户官网的少量公开页面尝试发现邮箱。
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

## 官方文档

- Google Places Text Search New: https://developers.google.com/maps/documentation/places/web-service/text-search
- Google Places API FieldMask: https://developers.google.com/maps/documentation/places/web-service/choose-fields
- Google Places data fields and billing tiers: https://developers.google.com/maps/documentation/places/web-service/data-fields
