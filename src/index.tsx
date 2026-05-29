import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// 静的ファイルの配信（public/配下）
app.use('/static/*', serveStatic({ root: './public' }))
app.use('/js/*', serveStatic({ root: './public' }))

// ルートはindex.htmlを返す
app.get('/', serveStatic({ path: './public/index.html' }))

// その他すべてのGETリクエストもindex.htmlにフォールバック（SPA）
app.get('*', serveStatic({ path: './public/index.html' }))

export default app
