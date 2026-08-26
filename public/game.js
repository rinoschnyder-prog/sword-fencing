// ==========================================
// ★ game.js v18.1（背景ローテーション連携版）
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const streakCounterEl = document.getElementById('streak-counter');
const uiLayer = document.getElementById('ui-layer');
const titleScreen = document.getElementById('title-screen');
const onlineScreen = document.getElementById('online-screen');
const gameOverlay = document.getElementById('game-overlay');
const overlayTextEl = document.getElementById('overlay-text');
const onlineCountNumEl = document.getElementById('online-count-num');
const btnSpecial = document.getElementById('btn-special');
const btnExitWatch = document.getElementById('btn-exit-watch');
const touchControls = document.getElementById('touch-controls');
const specialControlContainer = document.getElementById('special-control-container');

let GROUND_Y = 0;
const GRAVITY = 0.65;
const ROUND_TIME_LIMIT = 30; 
const MAX_SCORE = 2;
const MAX_HP = 10;
const MAX_SP = 100;
const MAX_CHARGE_FRAMES = 45;

let timeScale = 1.0;
let isWatchMode = false;

let roundEndTimeout = null;
let overlayTimeout = null;

const TARGET_FPS = 60;
const STEP = 1000 / TARGET_FPS;
let lastFrameTime = performance.now();
let accumulator = 0;

let socket = null;
let isOnlineMode = false;
let myPlayerNumber = 0;
const SERVER_URL = window.location.origin;

function initGlobalSocket() {
    if (typeof io === 'undefined') return;
    socket = io(SERVER_URL);
    socket.on('online_count', (count) => {
        if (onlineCountNumEl) onlineCountNumEl.innerText = count;
    });
}
initGlobalSocket();

const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

function updateControlsVisibility() {
    if (!isTouchDevice || isWatchMode || !gameActive) {
        if (touchControls) touchControls.style.display = 'none';
        if (specialControlContainer) specialControlContainer.style.display = 'none';
    } else {
        if (touchControls) touchControls.style.display = 'flex';
        if (specialControlContainer) specialControlContainer.style.display = 'flex';
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    GROUND_Y = Math.floor(canvas.height * 0.68);
    
    if (typeof p1 !== 'undefined' && typeof p2 !== 'undefined') {
        p1.startX = canvas.width * 0.2;
        p2.startX = canvas.width * 0.8 - p2.width;
        if (!gameActive) {
            p1.x = p1.startX;
            p1.y = GROUND_Y - p1.height;
            p2.x = p2.startX;
            p2.y = GROUND_Y - p2.height;
        }
    }
}
window.addEventListener('resize', resizeCanvas);

let p1Score = 0;
let p2Score = 0;
let currentRound = 1;
let roundTimer = ROUND_TIME_LIMIT;
let timerInterval = null;
let gameActive = false;
let roundOver = false;
let winStreak = 0;

let youMarkerTimer = 0;
let screenShakeTimer = 0;
let screenShakeIntensity = 0;

const keys = { a: false, d: false, w: false, f: false, space: false };
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === ' ') keys.space = true;
    if (key in keys) keys[key] = true;
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === ' ') keys.space = false;
    if (key in keys) keys[key] = false;
});

const touchBinds = [
    { btnId: 'btn-left', key: 'a' },
    { btnId: 'btn-right', key: 'd' },
    { btnId: 'btn-jump', key: 'w' },
    { btnId: 'btn-attack', key: 'f' },
    { btnId: 'btn-special', key: 'space' }
];

touchBinds.forEach(bind => {
    const btn = document.getElementById(bind.btnId);
    if (btn) {
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[bind.key] = true; }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[bind.key] = false; }, { passive: false });
        btn.addEventListener('touchcancel', (e) => { e.preventDefault(); keys[bind.key] = false; }, { passive: false });
    }
});

class Character {
    constructor(color, isCPU) {
        this.width = 44;
        this.height = 88;
        this.color = color;
        this.bodyColor = color;
        this.legsColor = color;
        this.armorBodyColor = color;
        this.armorLegsColor = color;
        this.outfitType = 'normal';
        this.hasHelmet = false;
        this.helmetColor = color;
        this.visorColor = '#ffffff';
        this.hasCloak = false;
        this.hasGodAura = false;

        this.isCPU = isCPU;
        this.startX = 0;
        this.startY = 0;
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;

        this.hp = MAX_HP;
        this.sp = 0;
        this.direction = isCPU ? -1 : 1; 
        this.isGrounded = true;
        
        this.state = 'idle';
        this.isAirAttack = false;
        this.isHeavyAttack = false;
        this.isSpecialAttack = false;
        this.hadouTimer = 0;
        this.chargeTimer = 0;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.flinchTimer = 0;
        this.breakTimer = 0;
        this.guardActive = false;
        this.animFrame = 0;

        this.cpuActionTimer = 0;
        this.cpuDecision = 'idle';
        this.cpuTargetAirAttack = false;
    }

    reset() {
        this.x = this.startX;
        this.y = GROUND_Y - this.height;
        this.vx = 0;
        this.vy = 0;
        this.hp = MAX_HP;
        this.sp = 0;
        this.state = 'idle';
        this.isAirAttack = false;
        this.isHeavyAttack = false;
        this.isSpecialAttack = false;
        this.hadouTimer = 0;
        this.chargeTimer = 0;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.flinchTimer = 0;
        this.breakTimer = 0;
        this.guardActive = false;
        this.isGrounded = true;
        this.animFrame = 0;
        this.cpuTargetAirAttack = false;
    }

    addSP(amount) {
        this.sp = Math.min(MAX_SP, this.sp + amount);
        updateScoreUI();
    }

    update(opponent) {
        this.animFrame += 1 * timeScale;

        if (this.hasGodAura && Math.random() < 0.4) {
            particles.push(new Particle(
                this.x + Math.random() * this.width,
                this.y + this.height - Math.random() * 20,
                (Math.random() - 0.5) * 1.5,
                -1.5 - Math.random() * 2,
                '#ffd32a',
                3,
                16
            ));
        }

        if (this.state === 'blowaway') {
            this.x += this.vx * timeScale;
            this.y += this.vy * timeScale;
            this.vy += GRAVITY * 1.1 * timeScale;

            if (this.x <= 12) {
                this.x = 12;
                this.vx = Math.abs(this.vx) * 0.4;
                screenShakeTimer = 8;
                screenShakeIntensity = 6;
                Sound.playSE('bom');
            } else if (this.x + this.width >= canvas.width - 12) {
                this.x = canvas.width - this.width - 12;
                this.vx = -Math.abs(this.vx) * 0.4;
                screenShakeTimer = 8;
                screenShakeIntensity = 6;
                Sound.playSE('bom');
            }

            if (this.y + this.height >= GROUND_Y) {
                this.y = GROUND_Y - this.height;
                this.vy = 0;
                this.vx = 0;
                this.state = 'hit';
            }
            return;
        }

        if (this.state === 'hadouken') {
            this.hadouTimer += 1 * timeScale;
            this.vx = 0;
            this.vy = 0;

            if (Math.floor(this.hadouTimer) === 24) {
                const ballX = (this.direction === 1) ? (this.x + this.width + 12) : (this.x - 12);
                const ballY = this.y + 42;
                const ownerNum = (this === p1) ? 1 : 2;
                energyBalls.push(new EnergyBall(ballX, ballY, this.direction, this.color, ownerNum));
                Sound.playSE('swing');
                screenShakeTimer = 6;
                screenShakeIntensity = 4;
            }

            if (this.hadouTimer > 52) {
                this.state = 'idle';
                this.isSpecialAttack = false;
                this.hadouTimer = 0;
                this.attackCooldown = 15;
            }
            return;
        }

        if (isOnlineMode && ((myPlayerNumber === 1 && this === p2) || (myPlayerNumber === 2 && this === p1))) return;

        if (!this.isGrounded) this.vy += GRAVITY * timeScale;

        if (this.state === 'flinch') {
            this.flinchTimer -= 1 * timeScale;
            this.vx *= 0.85;
            if (this.flinchTimer <= 0) { this.state = 'idle'; this.vx = 0; }
        }

        if (this.state === 'break') {
            this.breakTimer -= 1 * timeScale;
            this.vx = 0;
            this.guardActive = false;
            if (this.breakTimer <= 0) this.state = 'idle';
        }

        if (this.state === 'attack') {
            this.attackTimer += 1 * timeScale;
            if (this.isAirAttack) {
                if (this.attackTimer < 12) { this.vx = this.direction * 5.5; this.vy = 5.0; }
            } else if (this.isHeavyAttack) {
                if (this.attackTimer < 12) { this.vx = this.direction * 8.5; } else { this.vx = 0; }
            } else {
                if (this.attackTimer < 8) { this.vx = this.direction * 5; } else { this.vx = 0; }
            }

            const limit = this.isHeavyAttack ? 28 : 22;
            if (this.attackTimer > limit) { 
                this.state = 'idle';
                this.isAirAttack = false;
                this.isHeavyAttack = false;
                this.attackTimer = 0;
                this.attackCooldown = 14; 
            }
        }

        if (this.attackCooldown > 0) this.attackCooldown -= 1 * timeScale;

        if (this.state !== 'hit' && this.state !== 'flinch' && this.state !== 'break' && !roundOver) {
            if (isOnlineMode) this.updatePlayer(opponent); 
            else if (this.isCPU) this.updateCPU(opponent);
            else this.updatePlayer(opponent);
        } else if (this.state === 'hit' || this.state === 'break') {
            this.vx = 0;
        }

        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;

        if (this.y + this.height >= GROUND_Y) {
            this.y = GROUND_Y - this.height;
            this.vy = 0;
            this.isGrounded = true;
            if (this.state === 'jump') this.state = 'idle';
            if (this.state === 'attack' && this.isAirAttack && this.attackTimer > 10) this.isAirAttack = false;
        } else {
            this.isGrounded = false;
        }

        const margin = 12;
        if (this.x < margin) this.x = margin;
        if (this.x + this.width > canvas.width - margin) this.x = canvas.width - this.width - margin;

        if (this.state !== 'attack' && this.state !== 'hadouken' && this.state !== 'hit' && this.state !== 'break' && !roundOver) {
            this.direction = (opponent.x > this.x) ? 1 : -1;
        }
    }

    updatePlayer(opponent) {
        this.vx = 0;

        if (keys.space && this.sp >= MAX_SP && this.isGrounded && this.state !== 'attack' && this.state !== 'hadouken') {
            this.state = 'hadouken';
            this.isSpecialAttack = true;
            this.hadouTimer = 0;
            this.sp = 0;
            updateScoreUI();
            return;
        }

        if (this.state === 'charge') {
            if (keys.f) {
                this.chargeTimer++;
                return;
            } else {
                this.state = 'attack';
                this.isHeavyAttack = (this.chargeTimer >= MAX_CHARGE_FRAMES);
                this.isAirAttack = false;
                this.attackTimer = 0;
                this.chargeTimer = 0;
                Sound.playSE('swing');
                return;
            }
        }

        if (keys.f && this.attackCooldown <= 0 && this.state !== 'attack' && this.state !== 'hadouken') {
            if (this.isGrounded) {
                this.state = 'charge';
                this.chargeTimer = 0;
                return;
            } else {
                this.state = 'attack';
                this.isAirAttack = true;
                this.isHeavyAttack = false;
                this.attackTimer = 0;
                Sound.playSE('swing');
                return;
            }
        }

        const isBackingUp = (this.direction === 1 && keys.a) || (this.direction === -1 && keys.d);
        const isOpponentAttacking = (opponent && (opponent.state === 'attack' || opponent.state === 'hadouken' || energyBalls.length > 0));

        if (isBackingUp && this.isGrounded && isOpponentAttacking && this.state !== 'attack' && this.state !== 'charge' && this.state !== 'hadouken') {
            this.state = 'guard';
            this.guardActive = true;
            this.vx = 0;
            return;
        } else {
            this.guardActive = false;
            if (this.state === 'guard') this.state = 'idle';
        }

        if (this.state !== 'attack' && this.state !== 'charge' && this.state !== 'hadouken') {
            if (keys.a) {
                this.vx = -4.5;
                this.state = this.isGrounded ? 'walk' : this.state;
            } else if (keys.d) {
                this.vx = 4.5;
                this.state = this.isGrounded ? 'walk' : this.state;
            } else if (this.isGrounded && this.state === 'walk') {
                this.state = 'idle';
            }

            if (keys.w && this.isGrounded) {
                this.vy = -12.5;
                this.isGrounded = false;
                this.state = 'jump';
            }
        }
    }

    updateCPU(opponent) {
        const level = isWatchMode ? 8 : (winStreak + 1);
        const distance = Math.abs((this.x + this.width / 2) - (opponent.x + opponent.width / 2));
        const isOpponentSpReady = opponent.sp >= MAX_SP;
        const isNearWall = (this.x <= 40 || this.x >= canvas.width - 80);
        
        if (this.sp >= MAX_SP && this.isGrounded && this.state !== 'attack' && this.state !== 'hadouken') {
            if (Math.random() < 0.65) {
                this.state = 'hadouken';
                this.isSpecialAttack = true;
                this.hadouTimer = 0;
                this.sp = 0;
                updateScoreUI();
                return;
            }
        }

        if (this.state === 'charge') {
            this.chargeTimer++;
            if (this.chargeTimer >= MAX_CHARGE_FRAMES) {
                this.state = 'attack';
                this.isHeavyAttack = true;
                this.isAirAttack = false;
                this.attackTimer = 0;
                this.chargeTimer = 0;
                Sound.playSE('swing');
            }
            return;
        }

        if (!this.isGrounded && this.state === 'jump') {
            if (this.cpuTargetAirAttack && this.vy >= -4 && this.attackCooldown <= 0) {
                this.state = 'attack';
                this.isAirAttack = true;
                this.isHeavyAttack = false;
                this.attackTimer = 0;
                this.cpuTargetAirAttack = false;
                Sound.playSE('swing');
                return;
            }
        }

        if (this.state === 'attack' || this.state === 'hadouken') return;

        this.cpuActionTimer--;
        if (this.cpuActionTimer <= 0) {
            const thinkDelay = Math.max(3, 14 - level);
            this.cpuActionTimer = thinkDelay + Math.random() * 6;
            const rand = Math.random();

            if ((opponent.state === 'break' || opponent.state === 'flinch') && this.isGrounded) {
                const chargeChance = Math.min(0.9, 0.4 + level * 0.1);
                if (rand < chargeChance && this.attackCooldown <= 0) {
                    this.cpuDecision = 'charge';
                } else {
                    this.cpuDecision = (distance > 60) ? 'approach' : 'attack';
                }
            } else if (opponent.state === 'charge') {
                if (isOpponentSpReady) {
                    if (distance < 100) this.cpuDecision = 'attack';
                    else if (this.isGrounded) this.cpuDecision = 'jump_forward';
                    else this.cpuDecision = 'idle';
                } else if (isNearWall && this.isGrounded) {
                    this.cpuDecision = 'jump_forward';
                } else if (distance < 95) {
                    this.cpuDecision = 'attack';
                } else if (distance < 140) {
                    this.cpuDecision = 'backstep';
                } else {
                    this.cpuDecision = 'idle';
                }
            } else if (opponent.state === 'attack' && distance < 140) {
                const guardRate = Math.min(0.92, 0.45 + level * 0.06);
                if (rand < guardRate) this.cpuDecision = (rand < 0.25 && this.isGrounded && !isNearWall) ? 'backstep' : 'guard';
                else this.cpuDecision = 'idle';
            } else if (distance < 125) {
                if (rand < 0.35 && this.attackCooldown <= 0) this.cpuDecision = 'attack';
                else if (rand < 0.55 && !isNearWall) this.cpuDecision = 'backstep';
                else if (rand < 0.75 && this.isGrounded) this.cpuDecision = 'jump_forward';
                else if (rand < 0.90 && this.isGrounded && this.attackCooldown <= 0) this.cpuDecision = (level >= 3 && rand < 0.5) ? 'charge' : 'guard';
                else this.cpuDecision = 'idle';
            } else {
                if (rand < 0.35 && this.isGrounded) this.cpuDecision = 'jump_forward';
                else if (rand < 0.85) this.cpuDecision = 'approach';
                else this.cpuDecision = 'idle';
            }
        }

        this.guardActive = false;
        if (this.state === 'guard') this.state = 'idle';

        if (this.cpuDecision === 'approach') {
            this.vx = (opponent.x < this.x) ? -3.8 : 3.8;
            if (this.isGrounded) this.state = 'walk';
        } else if (this.cpuDecision === 'backstep') {
            this.vx = (opponent.x < this.x) ? 4.5 : -4.5; 
            if (this.isGrounded) this.state = 'walk';
        } else if (this.cpuDecision === 'guard' && this.isGrounded) {
            this.state = 'guard';
            this.guardActive = true;
            this.vx = 0;
        } else if (this.cpuDecision === 'charge' && this.isGrounded && this.attackCooldown <= 0) {
            this.state = 'charge';
            this.chargeTimer = 0;
            this.vx = 0;
            this.cpuDecision = 'idle';
        } else if (this.cpuDecision === 'attack' && this.attackCooldown <= 0) {
            this.state = 'attack';
            this.isAirAttack = !this.isGrounded; 
            this.isHeavyAttack = false;
            this.attackTimer = 0;
            this.cpuDecision = 'idle';
            Sound.playSE('swing');
        } else if (this.cpuDecision === 'jump_forward' && this.isGrounded) {
            this.vy = -13.0;
            this.vx = (opponent.x < this.x) ? -4.2 : 4.2;
            this.isGrounded = false;
            this.state = 'jump';
            this.cpuTargetAirAttack = true;
            this.cpuDecision = 'idle';
        }
    }

    getAttackBox() {
        if (this.state !== 'attack') return null;
        if (this.attackTimer >= 6 && this.attackTimer <= 14) {
            if (this.isAirAttack) {
                const boxWidth = 65;
                const boxHeight = 45;
                const x = (this.direction === 1) ? (this.x + this.width * 0.5) : (this.x - boxWidth + this.width * 0.5);
                const y = this.y + 40; 
                return { x, y, width: boxWidth, height: boxHeight };
            } else if (this.isHeavyAttack) {
                const boxWidth = 85;
                const boxHeight = 18;
                const x = (this.direction === 1) ? (this.x + this.width) : (this.x - boxWidth);
                const y = this.y + 36; 
                return { x, y, width: boxWidth, height: boxHeight };
            } else {
                const boxWidth = 70;
                const boxHeight = 14;
                const x = (this.direction === 1) ? (this.x + this.width) : (this.x - boxWidth);
                const y = this.y + 38; 
                return { x, y, width: boxWidth, height: boxHeight };
            }
        }
        return null;
    }

    draw(isDarkTone) {
        if (typeof drawCharacter === 'function') {
            const isMyChar = !isWatchMode && (isOnlineMode ? 
                ((myPlayerNumber === 1 && this === p1) || (myPlayerNumber === 2 && this === p2)) : 
                (this === p1));
            drawCharacter(ctx, this, {
                isDarkTone,
                isMyCharacter: isMyChar,
                youMarkerTimer,
                gameActive
            });
        }
    }
}

const p1 = new Character('#ff5252', false); 
const p2 = new Character(CPU_COLORS[0], true);  
resizeCanvas();

function applyPlayerCustomization() {
    p1.outfitType = playerData.outfitType || 'normal';
    p1.hasHelmet = playerData.hasHelmet || false;
    p1.helmetColor = playerData.helmetColor || playerData.normalBodyColor;
    p1.visorColor = playerData.visorColor || '#ffffff';
    p1.color = playerData.normalBodyColor;
    p1.bodyColor = playerData.normalBodyColor;
    p1.legsColor = playerData.normalLegsColor;
    p1.armorBodyColor = playerData.armorBodyColor;
    p1.armorLegsColor = playerData.armorLegsColor;
    p1.hasCloak = playerData.hasCloak || false;
    p1.hasGodAura = playerData.hasGodAura || false;
}
applyPlayerCustomization();

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function updateScoreUI() {
    const p1Dots = document.querySelectorAll('#p1-score .dot');
    const p2Dots = document.querySelectorAll('#p2-score .dot');
    p1Dots.forEach((dot, idx) => dot.classList.toggle('active', idx < p1Score));
    p2Dots.forEach((dot, idx) => dot.classList.toggle('active', idx < p2Score));

    const p1HpEl = document.getElementById('p1-hp');
    const p2HpEl = document.getElementById('p2-hp');
    if (p1HpEl) p1HpEl.style.width = `${(p1.hp / MAX_HP) * 100}%`;
    if (p2HpEl) p2HpEl.style.width = `${(p2.hp / MAX_HP) * 100}%`;

    const p1SpEl = document.getElementById('p1-sp');
    const p2SpEl = document.getElementById('p2-sp');
    if (p1SpEl) p1SpEl.style.width = `${p1.sp}%`;
    if (p2SpEl) p2SpEl.style.width = `${p2.sp}%`;

    const myChar = isOnlineMode ? (myPlayerNumber === 1 ? p1 : p2) : p1;
    if (btnSpecial) {
        if (!isWatchMode && myChar.sp >= MAX_SP) {
            btnSpecial.classList.add('ready');
        } else {
            btnSpecial.classList.remove('ready');
        }
    }
}

function showOverlay(text, duration = 1500, callback) {
    overlayTextEl.innerText = text;
    gameOverlay.classList.add('show');
    
    if (overlayTimeout) clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => {
        gameOverlay.classList.remove('show');
        if (callback) callback();
    }, duration);
}

function showOnlineMenu() {
    titleScreen.style.display = 'none';
    onlineScreen.style.display = 'flex';
}

function hideOnlineMenu() {
    onlineScreen.style.display = 'none';
    titleScreen.style.display = 'flex';
    if (socket) socket.emit('leave_room');
}

function connectToRoom() {
    const roomId = document.getElementById('room-id-input').value.trim();
    const playerName = document.getElementById('player-name-input').value.trim() || "PLAYER";
    const statusEl = document.getElementById('online-status');

    if (!roomId) { alert("部屋のパスワードを入力してください。"); return; }
    statusEl.innerText = "サーバーに接続中...";
    if (!socket) socket = io(SERVER_URL);

    socket.emit('join_room', { roomId, playerName });

    socket.on('assigned_player', (data) => {
        myPlayerNumber = data.pNum;
        statusEl.innerText = `部屋接続: PLAYER ${myPlayerNumber} として待機中...`;
    });

    socket.on('waiting_opponent', () => statusEl.innerText = "相手を待機中 (パスワードを伝えてください)");
    socket.on('room_full', () => statusEl.innerText = "この部屋は満員です。");

    socket.on('start_game', (data) => {
        statusEl.innerText = "マッチング成功！開始します...";
        isOnlineMode = true;
        isWatchMode = false;
        winStreak = 0;
        p1Score = 0;
        p2Score = 0;
        currentRound = 1;
        timeScale = 1.0;

        p1.isCPU = false;
        p2.isCPU = false;

        const myChar = (myPlayerNumber === 1) ? p1 : p2;
        myChar.outfitType = p1.outfitType;
        myChar.hasHelmet = p1.hasHelmet;
        myChar.helmetColor = p1.helmetColor;
        myChar.visorColor = p1.visorColor;
        myChar.color = p1.color;
        myChar.bodyColor = p1.bodyColor;
        myChar.legsColor = p1.legsColor;
        myChar.armorBodyColor = p1.armorBodyColor;
        myChar.armorLegsColor = p1.armorLegsColor;
        myChar.hasCloak = p1.hasCloak;
        myChar.hasGodAura = p1.hasGodAura;

        const oppChar = (myPlayerNumber === 1) ? p2 : p1;
        oppChar.color = CPU_COLORS[1];
        oppChar.bodyColor = CPU_COLORS[1];
        oppChar.legsColor = CPU_COLORS[1];
        oppChar.armorBodyColor = CPU_COLORS[1];
        oppChar.armorLegsColor = CPU_COLORS[1];
        oppChar.hasHelmet = false;
        oppChar.visorColor = '#ffffff';
        oppChar.hasCloak = false;
        oppChar.hasGodAura = false;

        document.getElementById('p1-name-display').innerText = data.p1;
        document.getElementById('p2-name-display').innerText = data.p2;

        updateControlsVisibility();

        setTimeout(() => {
            onlineScreen.style.display = 'none';
            uiLayer.style.display = 'flex';
            streakCounterEl.style.display = 'none'; 
            p1.reset();
            p2.reset();
            updateScoreUI();

            if (typeof rotateBattleBackground === 'function') rotateBattleBackground(); // ★ 背景切り替え

            showVsIntro(p1, p2, data.p1, data.p2, () => {
                Sound.playBGM('game');
                showOverlay(`ROUND ${currentRound}`, 1500, startRound);
            });
        }, 800);
    });

    socket.on('opponent_physics', (data) => {
        if (roundOver || !gameActive) return;
        if (data.round !== currentRound) return;

        const opp = (myPlayerNumber === 1) ? p2 : p1;
        const myChar = (myPlayerNumber === 1) ? p1 : p2;
        
        opp.x = data.xRatio * canvas.width;
        opp.y = GROUND_Y + data.groundOffset;
        opp.direction = data.direction;
        opp.state = data.state;
        opp.guardActive = data.guardActive;
        opp.attackTimer = data.attackTimer;
        opp.chargeTimer = data.chargeTimer;
        opp.hadouTimer = data.hadouTimer;
        opp.isHeavyAttack = data.isHeavyAttack;
        opp.isSpecialAttack = data.isSpecialAttack;
        opp.sp = data.sp || 0;

        if (data.bodyColor) opp.bodyColor = data.bodyColor;
        if (data.legsColor) opp.legsColor = data.legsColor;
        if (data.armorBodyColor) opp.armorBodyColor = data.armorBodyColor;
        if (data.armorLegsColor) opp.armorLegsColor = data.armorLegsColor;
        if (data.helmetColor) opp.helmetColor = data.helmetColor;
        if (data.hasHelmet !== undefined) opp.hasHelmet = data.hasHelmet;
        if (data.color) opp.color = data.color;
        if (data.outfitType) opp.outfitType = data.outfitType;
        if (data.visorColor) opp.visorColor = data.visorColor;
        opp.hasCloak = !!data.hasCloak;
        opp.hasGodAura = !!data.hasGodAura;

        if (typeof data.myHp === 'number') opp.hp = data.myHp;

        if (typeof data.oppHp === 'number') {
            if (data.oppHp < myChar.hp) {
                myChar.hp = data.oppHp;
                const hitX = myChar.x + myChar.width / 2;
                const hitY = myChar.y + 40;
                triggerHitEffect(hitX, hitY, myChar.hp === 0, false);
                if (myChar.hp <= 0) endRound(opp);
                else {
                    myChar.state = 'flinch';
                    myChar.flinchTimer = 16;
                    myChar.vx = opp.direction * 6;
                }
            }
        }

        if (data.oppState === 'break') {
            myChar.state = 'break';
            myChar.breakTimer = 65;
            myChar.vx = myChar.direction * -15;
            Sound.playSE('break');
        }
        updateScoreUI();
    });

    socket.on('round_result', (data) => {
        if (roundOver) return;
        if (data.winnerNum === 1) endRound(p1);
        else if (data.winnerNum === 2) endRound(p2);
        else endRound(null, "TIME UP");
    });

    socket.on('opponent_disconnected', () => {
        alert("対戦相手の通信が切断されました。タイトルへ戻ります。");
        location.reload();
    });
}

function emitMyPhysics(extraOppState, targetOppHp) {
    if (!socket || !isOnlineMode || roundOver) return;
    const myChar = (myPlayerNumber === 1) ? p1 : p2;
    const oppChar = (myPlayerNumber === 1) ? p2 : p1;

    socket.emit('update_physics', {
        round: currentRound,
        xRatio: myChar.x / canvas.width,
        groundOffset: myChar.y - GROUND_Y,
        direction: myChar.direction,
        state: myChar.state,
        guardActive: myChar.guardActive,
        attackTimer: myChar.attackTimer,
        chargeTimer: myChar.chargeTimer,
        hadouTimer: myChar.hadouTimer,
        isHeavyAttack: myChar.isHeavyAttack,
        isSpecialAttack: myChar.isSpecialAttack,
        sp: myChar.sp,
        myHp: myChar.hp,
        oppHp: typeof targetOppHp === 'number' ? targetOppHp : oppChar.hp,
        oppState: extraOppState || '',
        color: myChar.color,
        bodyColor: myChar.bodyColor,
        legsColor: myChar.legsColor,
        armorBodyColor: myChar.armorBodyColor,
        armorLegsColor: myChar.armorLegsColor,
        hasHelmet: myChar.hasHelmet,
        helmetColor: myChar.helmetColor,
        outfitType: myChar.outfitType,
        visorColor: myChar.visorColor,
        hasCloak: myChar.hasCloak,
        hasGodAura: myChar.hasGodAura
    });
}

function generateRandomCpuSkin(excludeColor) {
    const availableColors = excludeColor ? CPU_COLORS.filter(c => c !== excludeColor) : CPU_COLORS;
    const baseColor = availableColors[Math.floor(Math.random() * availableColors.length)];
    const armorColor = CPU_COLORS[Math.floor(Math.random() * CPU_COLORS.length)];
    const wearsArmor = Math.random() < 0.75;
    const wearsHelmet = wearsArmor && Math.random() < 0.65;
    const randomVisorColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];

    return {
        color: baseColor,
        bodyColor: baseColor,
        legsColor: baseColor,
        armorBodyColor: armorColor,
        armorLegsColor: armorColor,
        hasHelmet: wearsHelmet,
        helmetColor: armorColor,
        outfitType: wearsArmor ? 'armor' : 'normal',
        visorColor: randomVisorColor,
        hasCloak: false,
        hasGodAura: false
    };
}

// CPU戦開始
function startCPUMode() {
    isOnlineMode = false;
    isWatchMode = false;
    myPlayerNumber = 0;
    winStreak = 0;
    p1Score = 0;
    p2Score = 0;
    currentRound = 1;
    timeScale = 1.0;

    p1.isCPU = false;
    p2.isCPU = true; 

    applyPlayerCustomization();

    const cpuSkin = generateRandomCpuSkin(p1.color);
    Object.assign(p2, cpuSkin);

    const p1Name = "PLAYER 1";
    const p2Name = `CPU LV.${winStreak + 1}`;

    document.getElementById('p1-name-display').innerText = p1Name;
    document.getElementById('p1-name-display').style.color = p1.color;
    document.getElementById('p2-name-display').innerText = p2Name;
    document.getElementById('p2-name-display').style.color = p2.color;

    if (btnExitWatch) btnExitWatch.style.display = 'none';
    updateControlsVisibility();

    titleScreen.style.display = 'none';
    uiLayer.style.display = 'flex';
    streakCounterEl.style.display = 'block';
    streakCounterEl.innerText = `連勝: ${winStreak}`;

    p1.reset();
    p2.reset();
    updateScoreUI();

    if (typeof rotateBattleBackground === 'function') rotateBattleBackground(); // ★ 背景切り替え

    showVsIntro(p1, p2, p1Name, p2Name, () => {
        Sound.playBGM('game');
        showOverlay(`ROUND ${currentRound}`, 1500, startRound);
    });
}

// 観戦モード開始
function startWatchMode() {
    isOnlineMode = false;
    isWatchMode = true;
    myPlayerNumber = 0;
    p1Score = 0;
    p2Score = 0;
    currentRound = 1;
    timeScale = 1.0;

    p1.isCPU = true;
    p2.isCPU = true;

    const skin1 = window.watchCpuSkin1 || generateRandomCpuSkin();
    const skin2 = window.watchCpuSkin2 || generateRandomCpuSkin(skin1.color);

    Object.assign(p1, skin1);
    Object.assign(p2, skin2);

    const p1Name = "CPU 1";
    const p2Name = "CPU 2";

    document.getElementById('p1-name-display').innerText = p1Name;
    document.getElementById('p1-name-display').style.color = p1.color;
    document.getElementById('p2-name-display').innerText = p2Name;
    document.getElementById('p2-name-display').style.color = p2.color;

    updateControlsVisibility();
    if (btnExitWatch) btnExitWatch.style.display = 'block';

    titleScreen.style.display = 'none';
    uiLayer.style.display = 'flex';
    streakCounterEl.style.display = 'none';

    p1.reset();
    p2.reset();
    updateScoreUI();

    if (typeof rotateBattleBackground === 'function') rotateBattleBackground(); // ★ 背景切り替え

    showVsIntro(p1, p2, p1Name, p2Name, () => {
        Sound.playBGM('game');
        showOverlay(`WATCH MATCH\nROUND ${currentRound}`, 1500, startRound);
    });
}

function startRound() {
    for (let key in keys) keys[key] = false;
    timeScale = 1.0;
    p1.reset();
    p2.reset();
    p1.hp = MAX_HP;
    p2.hp = MAX_HP;
    particles = [];
    slashes = [];
    energyBalls = [];
    youMarkerTimer = 150;
    updateScoreUI();

    roundTimer = ROUND_TIME_LIMIT;
    timerEl.innerText = roundTimer;
    roundOver = false;
    gameActive = true;

    updateControlsVisibility();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!roundOver && gameActive) {
            roundTimer--;
            timerEl.innerText = roundTimer;
            if (roundTimer <= 0) {
                if (isOnlineMode) {
                    if (myPlayerNumber === 1) socket.emit('match_round_over', { winnerNum: 0 });
                } else {
                    endRound(null, "TIME UP");
                }
            }
        }
    }, 1000);
}

function endRound(winner, reason) {
    if (roundOver) return;
    roundOver = true;
    clearInterval(timerInterval);

    if (winner === p1) p1Score++;
    else if (winner === p2) p2Score++;

    updateScoreUI();

    const isMatchFinished = (p1Score >= MAX_SCORE || p2Score >= MAX_SCORE);
    const loser = (winner === p1) ? p2 : p1;

    let message = "";
    if (winner === p1) {
        message = isWatchMode ? "CPU 1 WIN" : (isOnlineMode ? `${document.getElementById('p1-name-display').innerText} WIN` : "PLAYER 1 WIN");
    } else if (winner === p2) {
        message = isWatchMode ? "CPU 2 WIN" : (isOnlineMode ? `${document.getElementById('p2-name-display').innerText} WIN` : `${document.getElementById('p2-name-display').innerText} WIN`);
    } else {
        message = reason || "DRAW";
    }

    if (winner) {
        if (winner.isHeavyAttack || winner.isSpecialAttack) {
            loser.state = 'blowaway';
            loser.vx = winner.direction * 18;
            loser.vy = -16;
        } else {
            loser.state = 'hit';
            loser.vx = 0;
        }
    }

    if (isMatchFinished && winner) {
        timeScale = 0.35;
        Sound.stopBGM();

        if (roundEndTimeout) clearTimeout(roundEndTimeout);
        roundEndTimeout = setTimeout(() => {
            timeScale = 1.0;

            if (isWatchMode) {
                if (currentBetAmount > 0) {
                    const wonBet = (currentBetTarget === 1 && p1Score >= MAX_SCORE) || (currentBetTarget === 2 && p2Score >= MAX_SCORE);
                    if (wonBet) {
                        const winGold = currentBetAmount * 2;
                        playerData.gold += winGold;
                        savePlayerData();
                        showOverlay(`🎉 的中！\n+${winGold} G 獲得！\n(所持金: ${playerData.gold}G)`, 3000, returnToTitle);
                    } else {
                        showOverlay(`💀 ハズレ...\n-${currentBetAmount} G 没収\n(所持金: ${playerData.gold}G)`, 3000, returnToTitle);
                    }
                } else {
                    showOverlay(`${message}!\n観戦終了`, 2000, returnToTitle);
                }
            } else if (isOnlineMode) {
                showOverlay(myPlayerNumber === (p1Score >= MAX_SCORE ? 1 : 2) ? "VICTORY!" : "DEFEAT...", 3000, returnToTitle);
            } else {
                if (p1Score >= MAX_SCORE) {
                    winStreak++;
                    streakCounterEl.innerText = `連勝: ${winStreak}`;
                    
                    playerData.totalCpuWins = (playerData.totalCpuWins || 0) + 1;

                    let earned = 1;
                    if (winStreak % 5 === 0) earned += 5;
                    playerData.gold += earned;
                    savePlayerData();

                    let winMsg = `VICTORY!\n${winStreak}連勝達成！(+${earned}G)`;
                    if (playerData.totalCpuWins === 10) {
                        winMsg += `\n🛡️ 通算10勝達成！【鎧】解放！`;
                    } else if (playerData.totalCpuWins === 30) {
                        winMsg += `\n👑 通算30勝達成！【兜】解放！`;
                    }

                    showOverlay(winMsg, 2500, startNextMatch);
                } else {
                    showOverlay(`DEFEAT...\n記録: ${winStreak}連勝`, 3000, () => {
                        saveScore(winStreak);
                        returnToTitle();
                    });
                }
            }
        }, 2000);
    } else {
        if (roundEndTimeout) clearTimeout(roundEndTimeout);
        roundEndTimeout = setTimeout(() => {
            p1.reset();
            p2.reset();
            updateScoreUI();

            showOverlay(message, 1500, () => {
                currentRound++;
                showOverlay(`ROUND ${currentRound}`, 1500, startRound);
            });
        }, 1000);
    }
}

function startNextMatch() {
    p1Score = 0;
    p2Score = 0;
    currentRound = 1;
    timeScale = 1.0;

    const nextCpuSkin = generateRandomCpuSkin(p1.color);
    Object.assign(p2, nextCpuSkin);
    
    const p2Name = `CPU LV.${winStreak + 1}`;
    document.getElementById('p2-name-display').innerText = p2Name;
    document.getElementById('p2-name-display').style.color = p2.color;

    p1.reset();
    p2.reset();
    updateScoreUI();

    if (typeof rotateBattleBackground === 'function') rotateBattleBackground(); // ★ 背景切り替え

    showVsIntro(p1, p2, "PLAYER 1", p2Name, () => {
        Sound.playBGM('game');
        showOverlay(`ROUND ${currentRound}`, 1500, startRound);
    });
}

function returnToTitle() {
    gameActive = false;
    isWatchMode = false;
    roundOver = true;
    timeScale = 1.0;

    if (timerInterval) clearInterval(timerInterval);
    if (roundEndTimeout) clearTimeout(roundEndTimeout);
    if (overlayTimeout) clearTimeout(overlayTimeout);

    gameOverlay.classList.remove('show');
    const vsScreen = document.getElementById('vs-screen');
    if (vsScreen) { vsScreen.classList.remove('show'); vsScreen.style.display = 'none'; }

    if (btnExitWatch) btnExitWatch.style.display = 'none';
    updateControlsVisibility();

    applyPlayerCustomization();
    p1.reset();
    p2.reset();

    uiLayer.style.display = 'none';
    titleScreen.style.display = 'flex';

    if (socket) socket.emit('leave_room');

    Sound.playBGM('title');
    updateRankingUI();
    updateGoldUI();
}

function handleHit(attacker, defender, isP1Attacker, hitX, hitY) {
    const isFacing = (attacker.x < defender.x && defender.direction === -1) || (attacker.x > defender.x && defender.direction === 1);

    if (defender.guardActive && isFacing) {
        triggerHitEffect(hitX, hitY, false, true);
        defender.addSP(10);
        attacker.addSP(5);

        if (attacker.isHeavyAttack) {
            defender.state = 'break';
            defender.breakTimer = 65;
            defender.vx = defender.direction * -15;
            attacker.attackTimer = 28;
            Sound.playSE('break');
            if (isOnlineMode) emitMyPhysics('break');
        } else {
            defender.x += defender.direction * -20; 
            attacker.attackTimer = 22; 
            Sound.playSE('guard');
        }
    } else {
        triggerHitEffect(hitX, hitY, attacker.isHeavyAttack, false);
        attacker.addSP(15);
        defender.addSP(20);

        if (attacker.isHeavyAttack) {
            defender.hp = 0;
            updateScoreUI();
            Sound.playSE('heavy');
            if (isOnlineMode) {
                emitMyPhysics('', 0);
                if (socket) socket.emit('match_round_over', { winnerNum: isP1Attacker ? 1 : 2 });
            }
            endRound(attacker);
        } else {
            defender.hp = Math.max(0, defender.hp - 1);
            attacker.attackTimer = 22;
            updateScoreUI();
            Sound.playSE('hit');

            if (isOnlineMode) emitMyPhysics('', defender.hp);

            if (defender.hp <= 0) {
                if (isOnlineMode && socket) socket.emit('match_round_over', { winnerNum: isP1Attacker ? 1 : 2 });
                endRound(attacker);
            } else {
                defender.state = 'flinch';
                defender.flinchTimer = 16;
                defender.vx = attacker.direction * 6;
            }
        }
    }
}

function handleEnergyBallHit(ball, defender, attacker) {
    const isFacing = (ball.vx > 0 && defender.direction === -1) || (ball.vx < 0 && defender.direction === 1);
    const hitX = ball.x;
    const hitY = ball.y;

    if (defender.guardActive && isFacing) {
        triggerHitEffect(hitX, hitY, false, true);
        defender.hp = Math.max(0, defender.hp - 1);
        defender.addSP(10);
        defender.x += (ball.vx > 0 ? 1 : -1) * 15;
        Sound.playSE('guard');
    } else {
        triggerHitEffect(hitX, hitY, true, false);
        defender.hp = Math.max(0, defender.hp - 2);
        defender.addSP(25);
        Sound.playSE('bom');
        defender.state = 'flinch';
        defender.flinchTimer = 20;
        defender.vx = (ball.vx > 0 ? 1 : -1) * 7.5;
    }

    updateScoreUI();
    if (isOnlineMode) emitMyPhysics('', defender.hp);

    if (defender.hp <= 0) {
        if (isOnlineMode && socket) socket.emit('match_round_over', { winnerNum: (attacker === p1) ? 1 : 2 });
        endRound(attacker);
    }
}

function checkHits() {
    if (roundOver) return;

    for (let i = energyBalls.length - 1; i >= 0; i--) {
        const ball = energyBalls[i];
        const target = (ball.ownerNum === 1) ? p2 : p1;
        const attacker = (ball.ownerNum === 1) ? p1 : p2;

        if (target.state !== 'flinch' && target.state !== 'hit' && target.state !== 'blowaway') {
            const targetBody = { x: target.x, y: target.y, width: target.width, height: target.height };
            const ballBox = { x: ball.x - ball.radius, y: ball.y - ball.radius, width: ball.radius * 2, height: ball.radius * 2 };

            if (checkCollision(ballBox, targetBody)) {
                handleEnergyBallHit(ball, target, attacker);
                energyBalls.splice(i, 1);
                continue;
            }
        }
        if (ball.life <= 0 || ball.x < -50 || ball.x > canvas.width + 50) energyBalls.splice(i, 1);
    }

    if (isOnlineMode) {
        const myChar = (myPlayerNumber === 1) ? p1 : p2;
        const oppChar = (myPlayerNumber === 1) ? p2 : p1;
        const myAttack = myChar.getAttackBox();

        if (myAttack && oppChar.state !== 'flinch' && oppChar.state !== 'hit' && oppChar.state !== 'blowaway') {
            const oppBody = { x: oppChar.x, y: oppChar.y, width: oppChar.width, height: oppChar.height };
            if (checkCollision(myAttack, oppBody)) {
                const hitX = myChar.direction === 1 ? oppChar.x + 8 : oppChar.x + oppChar.width - 8;
                const hitY = myAttack.y + myAttack.height / 2;
                handleHit(myChar, oppChar, myPlayerNumber === 1, hitX, hitY);
            }
        }
        return;
    }

    const p1Attack = p1.getAttackBox();
    const p2Attack = p2.getAttackBox();

    if (p1Attack && p2.state !== 'flinch' && p2.state !== 'hit' && p2.state !== 'blowaway') {
        const p2Body = { x: p2.x, y: p2.y, width: p2.width, height: p2.height };
        if (checkCollision(p1Attack, p2Body)) {
            const hitX = p1.direction === 1 ? p2.x + 8 : p2.x + p2.width - 8;
            const hitY = p1Attack.y + p1Attack.height / 2;
            handleHit(p1, p2, true, hitX, hitY);
        }
    }

    if (p2Attack && p1.state !== 'flinch' && p1.state !== 'hit' && p1.state !== 'blowaway') {
        const p1Body = { x: p1.x, y: p1.y, width: p1.width, height: p1.height };
        if (checkCollision(p2Attack, p1Body)) {
            const hitX = p2.direction === 1 ? p1.x + 8 : p1.x + p1.width - 8;
            const hitY = p2Attack.y + p2Attack.height / 2;
            handleHit(p2, p1, false, hitX, hitY);
        }
    }
}

function updatePhysics() {
    if (youMarkerTimer > 0) youMarkerTimer -= 1 * timeScale;

    if (gameActive) {
        p1.update(p2);
        p2.update(p1);
        if (isOnlineMode) emitMyPhysics();
        checkHits();
    }

    for (let i = 0; i < energyBalls.length; i++) energyBalls[i].update();
    for (let i = slashes.length - 1; i >= 0; i--) { slashes[i].update(); if (slashes[i].life <= 0) slashes.splice(i, 1); }
    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(); if (particles[i].life <= 0) particles.splice(i, 1); }
}

function gameLoop(currentTime = performance.now()) {
    const delta = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    accumulator += Math.min(delta, 100);

    while (accumulator >= STEP) {
        updatePhysics();
        accumulator -= STEP;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (screenShakeTimer > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeIntensity;
        const shakeY = (Math.random() - 0.5) * screenShakeIntensity;
        ctx.translate(shakeX, shakeY);
        screenShakeTimer -= 1 * timeScale;
    }

    const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, canvas.height);
    groundGrad.addColorStop(0, 'rgba(30, 39, 46, 0.85)');
    groundGrad.addColorStop(1, 'rgba(10, 15, 20, 0.98)');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);

    ctx.strokeStyle = 'rgba(113, 128, 147, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();

    const isSameColor = (p1.bodyColor === p2.bodyColor && p1.legsColor === p2.legsColor && p1.outfitType === p2.outfitType);
    p1.draw(false);
    p2.draw(isSameColor);

    for (let i = 0; i < energyBalls.length; i++) energyBalls[i].draw(ctx);
    for (let i = 0; i < slashes.length; i++) slashes[i].draw(ctx);
    for (let i = 0; i < particles.length; i++) particles[i].draw(ctx);

    ctx.restore();

    requestAnimationFrame(gameLoop);
}

updateRankingUI();
requestAnimationFrame(gameLoop);