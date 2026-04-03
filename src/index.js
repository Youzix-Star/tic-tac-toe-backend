export default {
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS 头
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        };

        // 根路径测试
        if (path === '/') {
            return new Response('Hello World! Backend is running (no DO).', { headers: { 'Content-Type': 'text/plain' } });
        }

        // 模拟创建房间（不依赖 DO）
        if (path === '/api/create' && request.method === 'POST') {
            const roomId = 'TEST' + Math.random().toString(36).substring(2, 6).toUpperCase();
            return new Response(JSON.stringify({ roomId }), { headers });
        }

        // 模拟加入房间
        if (path === '/api/join' && request.method === 'POST') {
            return new Response(JSON.stringify({ success: true }), { headers });
        }

        // WebSocket 暂时不支持（模拟返回错误）
        if (path === '/api/ws') {
            return new Response('WebSocket not supported in test mode', { status: 501 });
        }

        return new Response('Not found', { status: 404 });
    }
};
