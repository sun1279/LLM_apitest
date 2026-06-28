# LLM API 测试台

一个纯静态的 OpenAI-Compatible LLM API 调试工具。无需后端服务，直接在浏览器中填写 API Base URL、API Key、模型和 Prompt，即可测试 `/chat/completions`、查看原始响应，并支持流式输出。

## 功能

- 纯静态 HTML/CSS/JavaScript 实现
- 支持 OpenAI-Compatible `/v1/chat/completions`
- 支持普通响应和 Stream 响应
- 支持 API Base URL、接口路径、模型、API Key 配置
- 支持 `max_tokens`、`temperature`、`reasoning_effort`
- 支持额外 JSON 参数
- 支持请求体预览、原始响应查看、内容提取
- 支持复制 curl、复制响应、获取 `/models`
- 支持超时中断请求
- 支持最近请求历史
- 配置保存在当前浏览器的 `localStorage`

## 本地使用

直接打开：

```text
index.html
```

也可以用任意静态服务器预览，例如：

```bash
npx serve .
```

## 静态部署

可以部署到任意静态托管平台：

- GitHub Pages
- Cloudflare Pages
- Vercel
- Netlify
- Nginx 静态目录

部署时只需要上传这些文件：

```text
index.html
styles.css
app.js
README.md
```

## CORS 注意事项

浏览器直接请求 API 时，目标 API 服务必须允许跨域请求。如果接口没有返回正确的 CORS 响应头，页面会提示网络或 CORS 错误。

如果你需要隐藏平台主密钥、做统一鉴权、计费、限流或规避 CORS，需要额外增加后端代理或 Cloudflare Worker。

## API Key 安全

这个项目不会内置任何 API Key。用户需要在页面中填写自己的 API Key。

默认不会保存 API Key。只有勾选“在本机浏览器保存 API Key”时，密钥才会存入当前浏览器的 `localStorage`。不要在公开部署的前端代码里写入你的平台主密钥。

## 目录结构

```text
.
├── index.html
├── styles.css
├── app.js
└── README.md
```

## License

MIT
