// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // どのドメインからの接続も許可
        methods: ["GET", "POST"]
    }
});

// 静的ファイルの提供（HTMLなどを同じサーバーに置く場合）
app.use(express.static(path.join(__dirname, 'public')));

// ルームごとのプレイヤー管理用
const rooms = {};

io.on('connection', (socket) => {
    console.log('ユーザーが接続しました:', socket.id);

    // ルーム入室リクエスト
    socket.on('join_room', (data) => {
        const { roomId, playerName } = data;
        
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        const roomPlayers = rooms[roomId];

        if (roomPlayers.length >= 2) {
            // すでに満員の場合
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

    // プレイヤーデータの同期中継（位置やステート）
    socket.on('update_physics', (data) => {
        if (socket.roomId) {
            // 自分以外の同じ部屋のメンバーにデータを転送
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
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            // 切断したプレイヤーを部屋から除外
            rooms[roomId] = rooms[roomId].filter(p => p.id !== socket.id);
            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
            } else {
                // 残されたプレイヤーに相手が去ったことを伝える
                io.to(roomId).emit('opponent_disconnected');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});