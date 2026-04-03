// Cloudflare Worker 后端 - 井字棋联机服务
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS 预检请求处理
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        // 根路径：返回 Hello World（验证服务是否正常运行）
        if (path === '/') {
            return new Response('Hello World! Tic-Tac-Toe Backend is running.', {
                headers: { 'Content-Type': 'text/plain' },
            });
        }

        // 创建房间
        if (path === '/api/create' && request.method === 'POST') {
            const roomId = generateRoomId();
            const id = env.ROOM_OBJECT.idFromName(roomId);
            const obj = env.ROOM_OBJECT.get(id);
            await obj.create(roomId);
            return jsonResponse({ roomId });
        }

        // 加入房间
        if (path === '/api/join' && request.method === 'POST') {
            const { roomId } = await request.json();
            const id = env.ROOM_OBJECT.idFromName(roomId);
            const obj = env.ROOM_OBJECT.get(id);
            const success = await obj.canJoin();
            if (success) {
                return jsonResponse({ success: true });
            } else {
                return jsonResponse({ success: false, error: '房间已满或不存在' }, 400);
            }
        }

        // WebSocket 升级
        if (path === '/api/ws') {
            const roomId = url.searchParams.get('roomId');
            const role = url.searchParams.get('role'); // 'X' 或 'O'
            const playerName = url.searchParams.get('name') || 'Player';
            if (!roomId || !role) {
                return new Response('Missing roomId or role', { status: 400 });
            }
            const id = env.ROOM_OBJECT.idFromName(roomId);
            const obj = env.ROOM_OBJECT.get(id);
            return obj.handleWebSocket(request, role, playerName);
        }

        // 未匹配任何路由
        return new Response('Not found', { status: 404 });
    }
};

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

// Durable Object 管理一个房间
export class RoomObject {
    constructor(state, env) {
        this.state = state;
        this.websockets = new Map(); // role -> { ws, name }
        this.board = Array(9).fill(null);
        this.currentTurn = 'X';
        this.gameActive = true;
    }

    async create(roomId) {
        this.roomId = roomId;
    }

    async canJoin() {
        return this.websockets.size < 2;
    }

    async handleWebSocket(request, role, playerName) {
        if (this.websockets.has(role)) {
            return new Response('Role already taken', { status: 400 });
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.websockets.set(role, { ws: server, name: playerName });
        this.state.acceptWebSocket(server, [role]);

        // 如果两人齐了，开始游戏
        if (this.websockets.size === 2) {
            this.startGame();
        }

        return new Response(null, { status: 101, webSocket: client });
    }

    async startGame() {
        const xWs = this.websockets.get('X')?.ws;
        const oWs = this.websockets.get('O')?.ws;
        if (xWs && oWs) {
            xWs.send(JSON.stringify({ type: 'game_start', role: 'X' }));
            oWs.send(JSON.stringify({ type: 'game_start', role: 'O' }));
        }
    }

    async webSocketMessage(ws, message) {
        const data = JSON.parse(message);
        if (data.type === 'move') {
            const role = this.getRoleByWs(ws);
            if (!role) return;

            // 验证回合
            if ((role === 'X' && this.currentTurn !== 'X') || (role === 'O' && this.currentTurn !== 'O')) {
                ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
                return;
            }

            // 验证落子合法性
            const index = data.index;
            if (this.board[index] !== null) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid move' }));
                return;
            }

            // 执行落子
            this.board[index] = role;
            // 广播移动
            this.broadcast(JSON.stringify({ type: 'move', index }));

            // 检查胜负
            const result = this.checkGameResult();
            if (result.finished) {
                this.gameActive = false;
                this.broadcast(JSON.stringify({ type: 'game_end', winner: result.winner, reason: result.reason }));
                this.websockets.clear();
                this.state.closeAllWebSockets();
            } else {
                // 切换回合
                this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
            }
        }
    }

    checkGameResult() {
        const winPatterns = [
            [0,1,2],[3,4,5],[6,7,8],
            [0,3,6],[1,4,7],[2,5,8],
            [0,4,8],[2,4,6]
        ];
        for (let pattern of winPatterns) {
            const [a,b,c] = pattern;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                return { finished: true, winner: this.board[a], reason: 'win' };
            }
        }
        if (this.board.every(cell => cell !== null)) {
            return { finished: true, winner: 'draw', reason: 'draw' };
        }
        return { finished: false };
    }

    broadcast(msg) {
        for (let { ws } of this.websockets.values()) {
            if (ws.readyState === 1) ws.send(msg);
        }
    }

    getRoleByWs(ws) {
        for (let [role, { ws: w }] of this.websockets.entries()) {
            if (w === ws) return role;
        }
        return null;
    }

    async webSocketClose(ws, code, reason, wasClean) {
        const role = this.getRoleByWs(ws);
        if (role) this.websockets.delete(role);
        // 通知另一方对方断开
        this.broadcast(JSON.stringify({ type: 'error', message: '对手已断开连接' }));
        this.state.closeAllWebSockets();
    }
}
