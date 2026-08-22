// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// ルームごとのプレイヤー管理用
const rooms = {};

// 部屋からプレイヤーを安全に削除する共通関数
function removePlayerFromRoom(socket) {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
        rooms[roomId] = rooms[roomId].filter(p => p.id !== socket.id);
        if (rooms[roomId].length === 0) {
            delete rooms[roomId];
        } else {
            io.to(roomId).emit('opponent_disconnected');
        }
        socket.leave(roomId);
        socket.roomId = null;
        socket.playerNumber = null;
    }
}

io.on('connection', (socket) => {
    console.log('ユーザーが接続しました:', socket.id);
    io.emit('online_count', io.engine.clientsCount);

    // ルーム入室リクエスト
    socket.on('join_room', (data) => {
        const { roomId, playerName } = data;
        
        // 既にどこかの部屋に入っていればまず退室
        removePlayerFromRoom(socket);

        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        const roomPlayers = rooms[roomId];

        if (roomPlayers.length >= 2) {
            socket.emit('room_full');
            socket.leave(roomId);
            return;
        }

        // プレイヤー登録（1人目はP1、2人目はP2）
        const playerNumber = roomPlayers.length === 0 ? 1 : 2;
        const playerInfo = { id: socket.id, name: playerName, pNum: playerNumber };
        roomPlayers.push(playerInfo);
        socket.roomId = roomId;
        socket.playerNumber = playerNumber;

        socket.emit('assigned_player', { pNum: playerNumber });

        // 2人揃ったらゲーム開始シグナルを送信
        if (roomPlayers.length === 2) {
            io.to(roomId).emit('start_game', {
                p1: roomPlayers[0].name,
                p2: roomPlayers[1].name
            });
        } else {
            socket.emit('waiting_opponent');
        }
    });

    // ★ 明示的な部屋退室リクエスト
    socket.on('leave_room', () => {
        removePlayerFromRoom(socket);
    });

    // プレイヤーデータの同期中継
    socket.on('update_physics', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('opponent_physics', data);
        }
    });

    // 攻撃ヒット（勝敗決定）の同期中継
    socket.on('match_round_over', (data) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('round_result', data);
        }
    });

    // 切断時のクリーンアップ
    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました:', socket.id);
        removePlayerFromRoom(socket);
        io.emit('online_count', io.engine.clientsCount);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
