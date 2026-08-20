const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const streakCounterEl = document.getElementById('streak-counter');
const uiLayer = document.getElementById('ui-layer');
const titleScreen = document.getElementById('title-screen');
const onlineScreen = document.getElementById('online-screen');
const gameOverlay = document.getElementById('game-overlay');
const overlayTextEl = document.getElementById('overlay-text');

// ゲーム設定
const GRAVITY = 0.6;
const GROUND_Y = 320;
const ROUND_TIME_LIMIT = 60; 
const MAX_SCORE = 2; // 2本先取

// ゲーム状態
let p1Score = 0;
let p2Score = 0;
let currentRound = 1;
let roundTimer = ROUND_TIME_LIMIT;
let timerInterval = null;
let gameActive = false;
let roundOver = false;

// 連勝システム
let winStreak = 0;

// オンライン用変数
let socket = null;
let isOnlineMode = false;
let myPlayerNumber = 0; // 1: PLAYER 1, 2: PLAYER 2, 0: ローカル
const SERVER_URL = window.location.origin; // 自動的にデプロイ先のURLに接続します

const keys = {
    a: false,
    d: false,
    w: false,
    s: false,
    f: false
};

// PCキーボード監視
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
});

// スマホタッチ操作対応
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouchDevice) {
    document.getElementById('touch-controls').style.display = 'flex';
}

const touchBinds = [
    { btnId: 'btn-left', key: 'a' },
    { btnId: 'btn-right', key: 'd' },
    { btnId: 'btn-jump', key: 'w' },
    { btnId: 'btn-guard', key: 's' },
    { btnId: 'btn-attack', key: 'f' }
];

touchBinds.forEach(bind => {
    const btn = document.getElementById(bind.btnId);
    if (btn) {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[bind.key] = true;
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[bind.key] = false;
        }, { passive: false });

        btn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            keys[bind.key] = false;
        }, { passive: false });
    }
});

// キャラクター クラス
class Character {
    constructor(x, y, color, isCPU) {
        this.startX = x;
        this.startY = y;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.width = 40;
        this.height = 80;
        this.color = color;
        this.isCPU = isCPU;

        this.direction = isCPU ? -1 : 1; 
        this.isGrounded = false;
        
        this.state = 'idle'; // 'idle', 'walk', 'jump', 'guard', 'attack', 'hit'
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.guardActive = false;

        this.animFrame = 0;

        // CPU用パラメータ
        this.cpuActionTimer = 0;
        this.cpuDecision = 'idle';
    }

    reset() {
        this.x = this.startX;
        this.y = this.startY;
        this.vx = 0;
        this.vy = 0;
        this.state = 'idle';
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.guardActive = false;
        this.isGrounded = false;
        this.animFrame = 0;
    }

    update(opponent) {
        this.animFrame++;

        // 重力
        if (!this.isGrounded) {
            this.vy += GRAVITY;
        }

        // 攻撃の硬直・判定時間処理
        if (this.state === 'attack') {
            this.attackTimer++;
            
            // 突き時の短い慣性スライド
            if (this.attackTimer < 8) {
                this.vx = this.direction * 5;
            } else {
                this.vx = 0;
            }

            if (this.attackTimer > 22) { 
                this.state = 'idle';
                this.attackTimer = 0;
                this.attackCooldown = 15; 
            }
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        }

        // 入力の更新
        if (this.state !== 'hit' && !roundOver) {
            if (isOnlineMode) {
                if ((myPlayerNumber === 1 && this === p1) || (myPlayerNumber === 2 && this === p2)) {
                    this.updatePlayer(); 
                }
            } else {
                if (this.isCPU) {
                    this.updateCPU(opponent);
                } else {
                    this.updatePlayer();
                }
            }
        } else {
            this.vx = 0;
        }

        this.x += this.vx;
        this.y += this.vy;

        // 地面衝突
        if (this.y + this.height >= GROUND_Y) {
            this.y = GROUND_Y - this.height;
            this.vy = 0;
            this.isGrounded = true;
            if (this.state === 'jump') {
                this.state = 'idle';
            }
        } else {
            this.isGrounded = false;
        }

        // 画面端制限
        if (this.x < 10) this.x = 10;
        if (this.x + this.width > canvas.width - 10) this.x = canvas.width - this.width - 10;

        // 向きの固定
        if (this.state !== 'attack' && this.state !== 'hit' && !roundOver) {
            this.direction = (opponent.x > this.x) ? 1 : -1;
        }
    }

    updatePlayer() {
        this.vx = 0;

        // ガード（Sキー）
        if (keys.s && this.isGrounded && this.state !== 'attack') {
            this.state = 'guard';
            this.guardActive = true;
            return;
        } else {
            this.guardActive = false;
            if (this.state === 'guard') this.state = 'idle';
        }

        // 攻撃（Fキー）
        if (keys.f && this.attackCooldown === 0 && this.state !== 'attack') {
            this.state = 'attack';
            this.attackTimer = 0;
            return;
        }

        // 移動
        if (this.state !== 'attack') {
            if (keys.a) {
                this.vx = -4.5;
                this.state = this.isGrounded ? 'walk' : this.state;
            } else if (keys.d) {
                this.vx = 4.5;
                this.state = this.isGrounded ? 'walk' : this.state;
            } else {
                if (this.isGrounded && this.state === 'walk') {
                    this.state = 'idle';
                }
            }

            // ジャンプ（Wキー）
            if (keys.w && this.isGrounded) {
                this.vy = -12;
                this.isGrounded = false;
                this.state = 'jump';
            }
        }
    }

    updateCPU(opponent) {
        this.vx = 0;
        this.guardActive = false;
        if (this.state === 'guard') this.state = 'idle';
        if (this.state === 'attack') return;

        const distance = Math.abs((this.x + this.width / 2) - (opponent.x + opponent.width / 2));
        this.cpuActionTimer--;
        
        if (this.cpuActionTimer <= 0) {
            const speedFactor = Math.max(5, 20 - winStreak);
            this.cpuActionTimer = 8 + Math.random() * speedFactor;
            
            const rand = Math.random();

            if (distance < 135) {
                const guardChance = Math.min(0.85, 0.5 + winStreak * 0.05);

                if (opponent.state === 'attack' && rand < guardChance) {
                    this.cpuDecision = 'guard';
                } else if (rand < 0.45) {
                    this.cpuDecision = 'attack';
                } else if (rand < 0.75) {
                    this.cpuDecision = 'backstep';
                } else {
                    this.cpuDecision = 'idle';
                }
            } else {
                if (rand < 0.8) {
                    this.cpuDecision = 'approach';
                } else {
                    this.cpuDecision = 'idle';
                }
            }
        }

        if (this.cpuDecision === 'approach') {
            this.vx = (opponent.x < this.x) ? -3.5 : 3.5;
            this.state = 'walk';
        } else if (this.cpuDecision === 'backstep') {
            this.vx = (opponent.x < this.x) ? 4 : -4; 
            this.state = 'walk';
        } else if (this.cpuDecision === 'guard' && this.isGrounded) {
            this.state = 'guard';
            this.guardActive = true;
        } else if (this.cpuDecision === 'attack' && this.attackCooldown === 0) {
            this.state = 'attack';
            this.attackTimer = 0;
            this.cpuDecision = 'idle';
        }
    }

    getAttackBox() {
        if (this.state !== 'attack') return null;

        if (this.attackTimer >= 6 && this.attackTimer <= 13) {
            const boxWidth = 70;
            const boxHeight = 12;
            const x = (this.direction === 1) ? (this.x + this.width) : (this.x - boxWidth);
            const y = this.y + 35; 
            return { x, y, width: boxWidth, height: boxHeight };
        }
        return null;
    }

    draw() {
        const cx = this.x + this.width / 2; 
        const cy = this.y + this.height;    

        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y, 25, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        let headY = cy - 70;
        let chestY = cy - 50;
        let hipY = cy - 30;

        let leftFoot = { x: cx - 12, y: cy };
        let rightFoot = { x: cx + 12, y: cy };
        let leftHand = { x: cx - 12, y: cy - 45 };
        let rightHand = { x: cx + 12, y: cy - 45 };

        let swordStart = { x: 0, y: 0 };
        let swordEnd = { x: 0, y: 0 };

        const dir = this.direction;

        if (this.state === 'hit') {
            headY = cy - 30;
            chestY = cy - 20;
            hipY = cy - 10;
            leftFoot = { x: cx - 20, y: cy };
            rightFoot = { x: cx + 15, y: cy };
            leftHand = { x: cx - 10, y: cy - 5 };
            rightHand = { x: cx + 10, y: cy - 5 };
        } 
        else if (this.state === 'attack') {
            const progress = this.attackTimer; 
            const reach = (progress >= 6 && progress <= 13) ? 35 : 15; 

            headY = cy - 65;
            chestY = cy - 48;
            hipY = cy - 28;

            leftFoot = { x: cx - dir * 18, y: cy };
            rightFoot = { x: cx + dir * 25, y: cy }; 

            rightHand = { x: cx + dir * (30 + reach), y: cy - 40 };
            leftHand = { x: cx - dir * 18, y: cy - 55 }; 

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 60, y: rightHand.y };
        } 
        else if (this.state === 'guard') {
            headY = cy - 68;
            chestY = cy - 48;
            hipY = cy - 28;
            leftFoot = { x: cx - dir * 8, y: cy };
            rightFoot = { x: cx + dir * 8, y: cy };

            rightHand = { x: cx + dir * 15, y: cy - 50 };
            leftHand = { x: cx + dir * 8, y: cy - 46 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 10, y: rightHand.y - 45 };
        } 
        else if (this.state === 'walk') {
            const cycle = Math.sin(this.animFrame * 0.25);
            leftFoot = { x: cx - 12 + (cycle * 12), y: cy };
            rightFoot = { x: cx + 12 - (cycle * 12), y: cy };
            
            leftHand = { x: cx - 10 - (cycle * 8), y: cy - 45 };
            rightHand = { x: cx + 10 + (cycle * 8), y: cy - 45 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 20, y: rightHand.y - 30 };
        } 
        else if (this.state === 'jump') {
            headY = cy - 73;
            chestY = cy - 53;
            hipY = cy - 33;
            leftFoot = { x: cx - 10, y: cy - 10 };
            rightFoot = { x: cx + 10, y: cy - 15 };

            leftHand = { x: cx - 15, y: cy - 60 };
            rightHand = { x: cx + 15, y: cy - 55 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 30, y: rightHand.y - 20 };
        }
        else {
            const breathe = Math.sin(this.animFrame * 0.05) * 1.5;
            headY += breathe;
            chestY += breathe * 0.5;

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 20, y: rightHand.y - 30 };
        }

        // 頭
        ctx.beginPath();
        ctx.arc(cx, headY, 10, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        // 胴体
        ctx.beginPath();
        ctx.moveTo(cx, headY + 10);
        ctx.lineTo(cx, hipY);
        ctx.stroke();

        // 足
        ctx.beginPath();
        ctx.moveTo(cx, hipY);
        ctx.lineTo(leftFoot.x, leftFoot.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, hipY);
        ctx.lineTo(rightFoot.x, rightFoot.y);
        ctx.stroke();

        // 腕
        ctx.beginPath();
        ctx.moveTo(cx, chestY);
        ctx.lineTo(leftHand.x, leftHand.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, chestY);
        ctx.lineTo(rightHand.x, rightHand.y);
        ctx.stroke();

        // 剣
        if (this.state !== 'hit') {
            ctx.save();
            ctx.strokeStyle = '#bdc3c7'; 
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(swordStart.x, swordStart.y);
            ctx.lineTo(swordEnd.x, swordEnd.y);
            ctx.stroke();

            // 鍔
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 5;
            ctx.beginPath();
            const tsubaDx = (swordEnd.x - swordStart.x) * 0.12;
            const tsubaDy = (swordEnd.y - swordStart.y) * 0.12;
            ctx.moveTo(swordStart.x - tsubaDy, swordStart.y + tsubaDx);
            ctx.lineTo(swordStart.x + tsubaDy, swordStart.y - tsubaDx);
            ctx.stroke();
            ctx.restore();
        }

        if (this.state === 'guard') {
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.4)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx + dir * 20, cy - 40, 25, -Math.PI/2, Math.PI/2, dir === -1);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// キャラクター生成
const p1 = new Character(150, GROUND_Y - 80, '#e74c3c', false); 
const p2 = new Character(610, GROUND_Y - 80, '#3498db', true);  

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function updateScoreUI() {
    const p1Dots = document.querySelectorAll('#p1-score .dot');
    const p2Dots = document.querySelectorAll('#p2-score .dot');

    p1Dots.forEach((dot, idx) => {
        if (idx < p1Score) dot.classList.add('active', 'p1');
        else dot.classList.remove('active', 'p1');
    });

    p2Dots.forEach((dot, idx) => {
        if (idx < p2Score) dot.classList.add('active', 'p2');
        else dot.classList.remove('active', 'p2');
    });
}

function showOverlay(text, duration = 1500, callback) {
    overlayTextEl.innerText = text;
    gameOverlay.classList.add('show');
    
    setTimeout(() => {
        gameOverlay.classList.remove('show');
        if (callback) callback();
    }, duration);
}

// ランキング表示の更新
function updateRankingUI() {
    const rankingList = document.getElementById('ranking-list');
    rankingList.innerHTML = '';
    const records = JSON.parse(localStorage.getItem('fencing_ranking')) || [];

    for (let i = 0; i < 3; i++) {
        const record = records[i] || { name: '---', streak: 0 };
        const row = document.createElement('div');
        row.className = 'ranking-row';
        row.innerHTML = `<span>${i + 1}位: ${record.name}</span><span>${record.streak} 連勝</span>`;
        rankingList.appendChild(row);
    }
}

// 記録の保存処理
function saveScore(streak) {
    if (streak <= 0) return;
    const records = JSON.parse(localStorage.getItem('fencing_ranking')) || [];
    
    const isTop3 = records.length < 3 || streak > records[records.length - 1].streak;
    
    if (isTop3) {
        setTimeout(() => {
            const name = prompt("🎉ハイスコア！歴代TOP3にランクインしました！\n登録する名前を入力してください（最大8文字）:", "PLAYER");
            const finalName = (name && name.trim() !== "") ? name.substring(0, 8) : "PLAYER";
            
            records.push({ name: finalName, streak: streak });
            records.sort((a, b) => b.streak - a.streak);
            
            if (records.length > 3) records.length = 3;
            
            localStorage.setItem('fencing_ranking', JSON.stringify(records));
            updateRankingUI();
        }, 500);
    }
}

// ========================
// UI制御・画面遷移
// ========================

function showOnlineMenu() {
    titleScreen.style.display = 'none';
    onlineScreen.style.display = 'flex';
}

function hideOnlineMenu() {
    onlineScreen.style.display = 'none';
    titleScreen.style.display = 'flex';
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

// ========================
// オンライン対戦（Socket.io）ロジック
// ========================

function connectToRoom() {
    const roomId = document.getElementById('room-id-input').value.trim();
    const playerName = document.getElementById('player-name-input').value.trim() || "PLAYER";
    const statusEl = document.getElementById('online-status');

    if (!roomId) {
        alert("部屋のパスワードを入力してください。");
        return;
    }

    statusEl.innerText = "サーバーに接続中...";

    socket = io(SERVER_URL);

    socket.on('connect', () => {
        statusEl.innerText = "部屋を探しています...";
        socket.emit('join_room', { roomId, playerName });
    });

    socket.on('assigned_player', (data) => {
        myPlayerNumber = data.pNum;
        statusEl.innerText = `部屋に接続しました。PLAYER ${myPlayerNumber} として待機中...`;
    });

    socket.on('waiting_opponent', () => {
        statusEl.innerText = "対戦相手を待っています（部屋のパスワードを相手に伝えてください）...";
    });

    socket.on('room_full', () => {
        statusEl.innerText = "この部屋はすでに満員です。";
        socket.disconnect();
    });

    socket.on('start_game', (data) => {
        statusEl.innerText = "対戦相手が見つかりました！開始します...";
        isOnlineMode = true;
        winStreak = 0;
        p1Score = 0;
        p2Score = 0;
        currentRound = 1;

        p1.isCPU = false;
        p2.isCPU = false;

        document.getElementById('p1-name-display').innerText = data.p1;
        document.getElementById('p2-name-display').innerText = data.p2;

        setTimeout(() => {
            onlineScreen.style.display = 'none';
            uiLayer.style.display = 'flex';
            streakCounterEl.style.display = 'none'; 
            updateScoreUI();
            showOverlay(`ROUND ${currentRound}`, 1500, startRound);
        }, 1000);
    });

    // 相手の移動情報の受信同期
    socket.on('opponent_physics', (data) => {
        if (roundOver) return; // 勝負決定後の上書きを阻止して、倒れるポーズを保つ
        
        const opp = (myPlayerNumber === 1) ? p2 : p1;
        opp.x = data.x;
        opp.y = data.y;
        opp.direction = data.direction;
        opp.state = data.state;
        opp.guardActive = data.guardActive;
        opp.attackTimer = data.attackTimer;
    });

    // 勝敗イベントの受信同期
    socket.on('round_result', (data) => {
        if (roundOver) return;
        
        if (data.winnerNum === 1) {
            p1.state = 'idle';
            p2.state = 'hit';
            endRound(p1);
        } else if (data.winnerNum === 2) {
            p1.state = 'hit';
            p2.state = 'idle';
            endRound(p2);
        } else {
            endRound(null, "TIME UP");
        }
    });

    socket.on('opponent_disconnected', () => {
        alert("対戦相手の通信が切断されました。タイトルへ戻ります。");
        location.reload();
    });
}

function emitMyPhysics() {
    if (!socket || !isOnlineMode || roundOver) return;

    const myChar = (myPlayerNumber === 1) ? p1 : p2;
    socket.emit('update_physics', {
        x: myChar.x,
        y: myChar.y,
        direction: myChar.direction,
        state: myChar.state,
        guardActive: myChar.guardActive,
        attackTimer: myChar.attackTimer
    });
}

// ========================
// ローカル（CPUモード）開始用
// ========================

function startCPUMode() {
    isOnlineMode = false;
    myPlayerNumber = 0;
    winStreak = 0;
    p1Score = 0;
    p2Score = 0;
    currentRound = 1;

    p1.isCPU = false;
    p2.isCPU = true; 

    document.getElementById('p1-name-display').innerText = "PLAYER 1";
    document.getElementById('p2-name-display').innerText = "CPU";

    titleScreen.style.display = 'none';
    uiLayer.style.display = 'flex';
    streakCounterEl.style.display = 'block';
    streakCounterEl.innerText = `連勝: ${winStreak}`;
    
    updateScoreUI();
    showOverlay(`ROUND ${currentRound}`, 1500, startRound);
}

// ========================
// 共通進行処理
// ========================

function startRound() {
    for (let key in keys) {
        keys[key] = false;
    }
    p1.reset();
    p2.reset();
    roundTimer = ROUND_TIME_LIMIT;
    timerEl.innerText = roundTimer;
    roundOver = false;
    gameActive = true;

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!roundOver && gameActive) {
            roundTimer--;
            timerEl.innerText = roundTimer;
            if (roundTimer <= 0) {
                if (isOnlineMode) {
                    if (myPlayerNumber === 1) {
                        socket.emit('match_round_over', { winnerNum: 0 });
                    }
                } else {
                    endRound(null, "TIME UP");
                }
            }
        }
    }, 1000);
}

function endRound(winner, reason) {
    roundOver = true;
    clearInterval(timerInterval);

    p1.vx = 0;
    p2.vx = 0;

    let message = "";
    if (winner === p1) {
        p1Score++;
        message = (isOnlineMode) ? `${document.getElementById('p1-name-display').innerText} WIN` : "PLAYER 1 WIN";
    } else if (winner === p2) {
        p2Score++;
        message = (isOnlineMode) ? `${document.getElementById('p2-name-display').innerText} WIN` : "CPU WIN";
    } else {
        message = reason || "DRAW";
    }

    updateScoreUI();

    setTimeout(() => {
        if (p1Score >= MAX_SCORE) {
            if (isOnlineMode) {
                // ★修正箇所：勝った本人は「VICTORY!」、負けた側は「DEFEAT...」を表示します
                if (myPlayerNumber === 1) {
                    showOverlay("VICTORY!", 3000, returnToTitle);
                } else {
                    showOverlay("DEFEAT...", 3000, returnToTitle);
                }
            } else {
                winStreak++;
                streakCounterEl.innerText = `連勝: ${winStreak}`;
                showOverlay(`VICTORY!\n現在の連勝数: ${winStreak}連勝`, 2000, startNextMatch);
            }
        } else if (p2Score >= MAX_SCORE) {
            if (isOnlineMode) {
                // ★修正箇所：勝った本人は「VICTORY!」、負けた側は「DEFEAT...」を表示します
                if (myPlayerNumber === 2) {
                    showOverlay("VICTORY!", 3000, returnToTitle);
                } else {
                    showOverlay("DEFEAT...", 3000, returnToTitle);
                }
            } else {
                showOverlay(`DEFEAT...\n連勝記録: ${winStreak}`, 3000, () => {
                    saveScore(winStreak);
                    returnToTitle();
                });
            }
        } else {
            showOverlay(message, 1500, () => {
                currentRound++;
                showOverlay(`ROUND ${currentRound}`, 1500, startRound);
            });
        }
    }, 800);
}

function startNextMatch() {
    p1Score = 0;
    p2Score = 0;
    currentRound = 1;
    updateScoreUI();
    showOverlay(`ROUND ${currentRound}\n(VS CPU LV.${winStreak + 1})`, 2000, startRound);
}

function returnToTitle() {
    gameActive = false;
    uiLayer.style.display = 'none';
    titleScreen.style.display = 'flex';
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    updateRankingUI();
}

function triggerOnlineAlert() {
    alert("対戦モードは現在オンライン対応準備中です。今しばらくお待ちください。");
}

function checkHits() {
    if (roundOver) return;

    const p1Attack = p1.getAttackBox();
    const p2Attack = p2.getAttackBox();

    if (p1Attack) {
        const p2Body = { x: p2.x, y: p2.y, width: p2.width, height: p2.height };
        if (checkCollision(p1Attack, p2Body)) {
            const isFacingP1 = (p1.x < p2.x && p2.direction === -1) || (p1.x > p2.x && p2.direction === 1);
            if (p2.guardActive && isFacingP1) {
                p2.x += p2.direction * -25; 
                p1.attackTimer = 22; 
            } else {
                if (isOnlineMode) {
                    if (myPlayerNumber === 1) {
                        socket.emit('match_round_over', { winnerNum: 1 });
                    }
                } else {
                    p2.state = 'hit';
                    p2.vx = 0; 
                    endRound(p1);
                }
            }
        }
    }

    if (p2Attack) {
        const p1Body = { x: p1.x, y: p1.y, width: p1.width, height: p1.height };
        if (checkCollision(p2Attack, p1Body)) {
            const isFacingP2 = (p2.x < p1.x && p1.direction === -1) || (p2.x > p1.x && p1.direction === 1);
            if (p1.guardActive && isFacingP2) {
                p1.x += p1.direction * -25; 
                p2.attackTimer = 22; 
            } else {
                if (isOnlineMode) {
                    if (myPlayerNumber === 2) {
                        socket.emit('match_round_over', { winnerNum: 2 });
                    }
                } else {
                    p1.state = 'hit';
                    p1.vx = 0; 
                    endRound(p2);
                }
            }
        }
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 地面の描画
    ctx.fillStyle = '#34495e';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();

    if (gameActive) {
        p1.update(p2);
        p2.update(p1);
        
        if (isOnlineMode) {
            emitMyPhysics();
        }
        checkHits();
    }

    p1.draw();
    p2.draw();

    requestAnimationFrame(gameLoop);
}

// 起動時の初期化
updateRankingUI();
gameLoop();
