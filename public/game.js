const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const streakCounterEl = document.getElementById('streak-counter');
const uiLayer = document.getElementById('ui-layer');
const titleScreen = document.getElementById('title-screen');
const onlineScreen = document.getElementById('online-screen');
const gameOverlay = document.getElementById('game-overlay');
const overlayTextEl = document.getElementById('overlay-text');

// 全画面動的リサイズ設定
let GROUND_Y = 0;
const GRAVITY = 0.65;
const ROUND_TIME_LIMIT = 30; 
const MAX_SCORE = 2;
const MAX_HP = 5;
const MAX_CHARGE_FRAMES = 45;

// CPUの10色カラーパレット
const CPU_COLORS = [
    '#40c4ff', '#2ecc71', '#9b59b6', '#e67e22', '#ffd32a',
    '#ff5252', '#1abc9c', '#e056fd', '#f5f6fa', '#30336b'
];

// ==========================================
// ★ オーディオマネージャー（Web Audio & BGM）
// ==========================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.buffers = {};
        this.currentBgm = null;
        this.bgmVolume = 0.45;
        this.seVolume = 0.7;

        this.seFiles = {
            hit: 'se/se_hit.wav',
            heavy: 'se/se_heavy.wav',
            guard: 'se/se_guard.wav',
            break: 'se/se_break.wav',
            swing: 'se/se_swing.wav'
        };

        this.bgmFiles = {
            title: 'bgm/top-iimhero.mp3',
            game1: 'bgm/back-bgm1.mp3',
            game2: 'bgm/back-bgm2.mp3'
        };

        this.initAudioContext();
    }

    initAudioContext() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            this.ctx = new AudioCtx();
            this.loadAllSE();
        }
    }

    unlockAudio() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    async loadAllSE() {
        if (!this.ctx) return;
        for (const [key, url] of Object.entries(this.seFiles)) {
            try {
                const res = await fetch(url);
                const arrayBuffer = await res.arrayBuffer();
                this.buffers[key] = await this.ctx.decodeAudioData(arrayBuffer);
            } catch (e) {
                console.warn(`SE読み込みスキップ: ${url}`, e);
            }
        }
    }

    playSE(name) {
        this.unlockAudio();
        if (!this.ctx || !this.buffers[name]) return;

        try {
            const source = this.ctx.createBufferSource();
            const gain = this.ctx.createGain();
            source.buffer = this.buffers[name];
            gain.gain.value = this.seVolume;
            source.connect(gain);
            gain.connect(this.ctx.destination);
            source.start(0);
        } catch (e) {
            console.warn(e);
        }
    }

    playBGM(type) {
        this.unlockAudio();
        let targetUrl = '';

        if (type === 'title') {
            targetUrl = this.bgmFiles.title;
        } else if (type === 'game') {
            targetUrl = Math.random() < 0.5 ? this.bgmFiles.game1 : this.bgmFiles.game2;
        }

        if (this.currentBgm && this.currentBgm.src.includes(targetUrl) && !this.currentBgm.paused) {
            return;
        }

        this.stopBGM();

        this.currentBgm = new Audio(targetUrl);
        this.currentBgm.loop = true;
        this.currentBgm.volume = this.bgmVolume;
        this.currentBgm.play().catch(() => {});
    }

    stopBGM() {
        if (this.currentBgm) {
            this.currentBgm.pause();
            this.currentBgm.currentTime = 0;
            this.currentBgm = null;
        }
    }
}

const Sound = new SoundManager();

// ★ 修正：画面を初めてタップ/クリックした瞬間にタイトルBGMを自動再生開始！
const handleFirstInteraction = () => {
    Sound.unlockAudio();
    if (titleScreen.style.display !== 'none' && !gameActive) {
        if (!Sound.currentBgm || Sound.currentBgm.paused) {
            Sound.playBGM('title');
        }
    }
};

window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
window.addEventListener('mousedown', handleFirstInteraction);
window.addEventListener('click', handleFirstInteraction);

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

// ゲーム状態
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

let particles = [];
let slashes = [];

class Particle {
    constructor(x, y, vx, vy, color, size, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = life;
        this.maxLife = life;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2;
        this.life--;
    }
    draw() {
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class SlashEffect {
    constructor(x, y, angle, length, color, isHeavy) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.length = length;
        this.color = color;
        this.isHeavy = isHeavy;
        this.life = isHeavy ? 14 : 9;
        this.maxLife = this.life;
    }
    update() {
        this.life--;
    }
    draw() {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = this.isHeavy ? 6 : 3.5;
        ctx.shadowBlur = this.isHeavy ? 20 : 10;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.moveTo(-this.length / 2, 0);
        ctx.lineTo(this.length / 2, 0);
        ctx.stroke();

        if (this.isHeavy) {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, (1 - alpha) * 45, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

function triggerHitEffect(x, y, isHeavy, isGuard) {
    if (isGuard) {
        for (let i = 0; i < 10; i++) {
            const angle = (Math.random() * Math.PI) - (Math.PI / 2);
            const speed = 3 + Math.random() * 5;
            particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                '#ffd32a',
                3,
                15 + Math.random() * 8
            ));
        }
        screenShakeTimer = 4;
        screenShakeIntensity = 2.5;
    } else {
        const count = isHeavy ? 35 : 18;
        const color = isHeavy ? '#ffd32a' : '#ff3838';

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (isHeavy ? 4 : 2.5) + Math.random() * (isHeavy ? 9 : 6);
            particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                Math.random() > 0.3 ? color : '#ffffff',
                (isHeavy ? 4 : 2.5) + Math.random() * 2,
                18 + Math.random() * 12
            ));
        }

        const slashAngle = (Math.random() - 0.5) * 0.8;
        slashes.push(new SlashEffect(x, y, slashAngle, isHeavy ? 100 : 65, color, isHeavy));

        screenShakeTimer = isHeavy ? 16 : 8;
        screenShakeIntensity = isHeavy ? 9 : 4.5;
    }
}

// オンライン用変数
let socket = null;
let isOnlineMode = false;
let myPlayerNumber = 0;
const SERVER_URL = window.location.origin;

const keys = { a: false, d: false, w: false, s: false, f: false };

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
});

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
    constructor(color, isCPU) {
        this.width = 44;
        this.height = 88;
        this.color = color;
        this.isCPU = isCPU;
        this.startX = 0;
        this.startY = 0;
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;

        this.hp = MAX_HP;
        this.direction = isCPU ? -1 : 1; 
        this.isGrounded = true;
        
        this.state = 'idle'; 
        this.isAirAttack = false;
        this.isHeavyAttack = false;
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
        this.state = 'idle';
        this.isAirAttack = false;
        this.isHeavyAttack = false;
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

    update(opponent) {
        this.animFrame++;

        if (isOnlineMode && ((myPlayerNumber === 1 && this === p2) || (myPlayerNumber === 2 && this === p1))) {
            return;
        }

        if (!this.isGrounded) {
            this.vy += GRAVITY;
        }

        if (this.state === 'flinch') {
            this.flinchTimer--;
            this.vx *= 0.85;
            if (this.flinchTimer <= 0) {
                this.state = 'idle';
                this.vx = 0;
            }
        }

        if (this.state === 'break') {
            this.breakTimer--;
            this.vx = 0;
            this.guardActive = false;
            if (this.breakTimer <= 0) {
                this.state = 'idle';
            }
        }

        if (this.state === 'attack') {
            this.attackTimer++;

            if (this.isAirAttack) {
                if (this.attackTimer < 12) {
                    this.vx = this.direction * 5.5;
                    this.vy = 5.0;
                }
            } else if (this.isHeavyAttack) {
                if (this.attackTimer < 12) {
                    this.vx = this.direction * 8.5;
                } else {
                    this.vx = 0;
                }
            } else {
                if (this.attackTimer < 8) {
                    this.vx = this.direction * 5;
                } else {
                    this.vx = 0;
                }
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

        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        }

        if (this.state !== 'hit' && this.state !== 'flinch' && this.state !== 'break' && !roundOver) {
            if (isOnlineMode) {
                this.updatePlayer(); 
            } else {
                if (this.isCPU) {
                    this.updateCPU(opponent);
                } else {
                    this.updatePlayer();
                }
            }
        } else if (this.state === 'hit' || this.state === 'break') {
            this.vx = 0;
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.y + this.height >= GROUND_Y) {
            this.y = GROUND_Y - this.height;
            this.vy = 0;
            this.isGrounded = true;
            if (this.state === 'jump') this.state = 'idle';
            if (this.state === 'attack' && this.isAirAttack && this.attackTimer > 10) {
                this.isAirAttack = false;
            }
        } else {
            this.isGrounded = false;
        }

        const margin = 12;
        if (this.x < margin) this.x = margin;
        if (this.x + this.width > canvas.width - margin) this.x = canvas.width - this.width - margin;

        if (this.state !== 'attack' && this.state !== 'hit' && this.state !== 'break' && !roundOver) {
            this.direction = (opponent.x > this.x) ? 1 : -1;
        }
    }

    updatePlayer() {
        this.vx = 0;

        if (this.state === 'charge') {
            if (keys.f) {
                this.chargeTimer++;
                return;
            } else {
                if (this.chargeTimer >= MAX_CHARGE_FRAMES) {
                    this.state = 'attack';
                    this.isHeavyAttack = true;
                    this.isAirAttack = false;
                    this.attackTimer = 0;
                    this.chargeTimer = 0;
                    Sound.playSE('swing');
                    return;
                } else {
                    this.state = 'attack';
                    this.isHeavyAttack = false;
                    this.isAirAttack = false;
                    this.attackTimer = 0;
                    this.chargeTimer = 0;
                    Sound.playSE('swing');
                    return;
                }
            }
        }

        if (keys.s && this.isGrounded && this.state !== 'attack' && this.state !== 'charge') {
            this.state = 'guard';
            this.guardActive = true;
            return;
        } else {
            this.guardActive = false;
            if (this.state === 'guard') this.state = 'idle';
        }

        if (keys.f && this.attackCooldown === 0 && this.state !== 'attack') {
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

        if (this.state !== 'attack' && this.state !== 'charge') {
            if (keys.a) {
                this.vx = -4.5;
                this.state = this.isGrounded ? 'walk' : this.state;
            } else if (keys.d) {
                this.vx = 4.5;
                this.state = this.isGrounded ? 'walk' : this.state;
            } else {
                if (this.isGrounded && this.state === 'walk') this.state = 'idle';
            }

            if (keys.w && this.isGrounded) {
                this.vy = -12.5;
                this.isGrounded = false;
                this.state = 'jump';
            }
        }
    }

    updateCPU(opponent) {
        const level = winStreak + 1;
        const distance = Math.abs((this.x + this.width / 2) - (opponent.x + opponent.width / 2));
        
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
            if (this.cpuTargetAirAttack && this.vy >= -4 && this.attackCooldown === 0) {
                this.state = 'attack';
                this.isAirAttack = true;
                this.isHeavyAttack = false;
                this.attackTimer = 0;
                this.cpuTargetAirAttack = false;
                Sound.playSE('swing');
                return;
            }
        }

        if (this.state === 'attack') return;

        this.cpuActionTimer--;
        
        if (this.cpuActionTimer <= 0) {
            const thinkDelay = Math.max(3, 14 - level);
            this.cpuActionTimer = thinkDelay + Math.random() * 6;
            const rand = Math.random();

            if ((opponent.state === 'break' || opponent.state === 'flinch') && this.isGrounded) {
                const chargeChance = Math.min(0.9, 0.4 + level * 0.1);
                if (rand < chargeChance && this.attackCooldown === 0) {
                    this.cpuDecision = 'charge';
                } else {
                    this.cpuDecision = (distance > 60) ? 'approach' : 'attack';
                }
            } else if (opponent.state === 'charge') {
                const counterIQ = Math.min(0.95, 0.5 + level * 0.08);
                if (rand < counterIQ) {
                    if (distance < 90) {
                        this.cpuDecision = 'attack';
                    } else if (rand < 0.65) {
                        this.cpuDecision = 'backstep';
                    } else if (this.isGrounded) {
                        this.cpuDecision = 'jump_forward';
                    }
                } else {
                    this.cpuDecision = 'idle';
                }
            } else if (opponent.state === 'attack' && distance < 140) {
                const guardRate = Math.min(0.92, 0.45 + level * 0.06);
                if (rand < guardRate) {
                    this.cpuDecision = (rand < 0.25 && this.isGrounded) ? 'backstep' : 'guard';
                } else {
                    this.cpuDecision = 'idle';
                }
            } else if (distance < 125) {
                if (rand < 0.35 && this.attackCooldown === 0) {
                    this.cpuDecision = 'attack';
                } else if (rand < 0.55) {
                    this.cpuDecision = 'backstep';
                } else if (rand < 0.75 && this.isGrounded) {
                    this.cpuDecision = 'jump_forward';
                } else if (rand < 0.90 && this.isGrounded && this.attackCooldown === 0) {
                    this.cpuDecision = (level >= 3 && rand < 0.5) ? 'charge' : 'guard';
                } else {
                    this.cpuDecision = 'idle';
                }
            } else {
                if (rand < 0.35 && this.isGrounded) {
                    this.cpuDecision = 'jump_forward';
                } else if (rand < 0.85) {
                    this.cpuDecision = 'approach';
                } else {
                    this.cpuDecision = 'idle';
                }
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
        } else if (this.cpuDecision === 'charge' && this.isGrounded && this.attackCooldown === 0) {
            this.state = 'charge';
            this.chargeTimer = 0;
            this.vx = 0;
            this.cpuDecision = 'idle';
        } else if (this.cpuDecision === 'attack' && this.attackCooldown === 0) {
            this.state = 'attack';
            this.isAirAttack = false;
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

    draw() {
        const cx = this.x + this.width / 2; 
        const cy = this.y + this.height;    

        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y, this.state === 'hit' ? 40 : 25, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        let headY = cy - 74;
        let chestY = cy - 54;
        let hipY = cy - 32;

        let leftFoot = { x: cx - 13, y: cy };
        let rightFoot = { x: cx + 13, y: cy };
        let leftHand = { x: cx - 13, y: cy - 48 };
        let rightHand = { x: cx + 13, y: cy - 48 };

        let swordStart = { x: 0, y: 0 };
        let swordEnd = { x: 0, y: 0 };

        const dir = this.direction;

        const isMyCharacter = isOnlineMode ? 
            ((myPlayerNumber === 1 && this === p1) || (myPlayerNumber === 2 && this === p2)) : 
            (this === p1);

        if (isMyCharacter && gameActive && this.state !== 'hit' && youMarkerTimer > 0) {
            const bob = Math.sin(this.animFrame * 0.15) * 4;
            const markerY = headY - 26 + bob;
            const alpha = Math.min(1, youMarkerTimer / 30);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 12px "Segoe UI", sans-serif';
            ctx.fillStyle = '#ffd32a';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ffd32a';
            
            ctx.fillText('YOU', cx, markerY);
            
            ctx.beginPath();
            ctx.moveTo(cx - 5, markerY + 4);
            ctx.lineTo(cx + 5, markerY + 4);
            ctx.lineTo(cx, markerY + 9);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        if (this.state === 'charge') {
            const isFull = this.chargeTimer >= MAX_CHARGE_FRAMES;
            const flashSpeed = isFull ? 0.4 : 0.18;
            const alpha = 0.4 + Math.sin(this.animFrame * flashSpeed) * 0.4;
            
            ctx.shadowBlur = isFull ? 28 : 14;
            ctx.shadowColor = isFull ? '#ffd32a' : '#ffffff';

            if (isFull) {
                ctx.save();
                ctx.strokeStyle = `rgba(255, 211, 42, ${alpha})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(cx, cy - 40, 44 + Math.sin(this.animFrame * 0.4) * 6, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        if (this.state === 'hit') {
            const headX = cx - dir * 35;
            headY = cy - 8;
            const bodyChestX = cx - dir * 18;
            const bodyHipX = cx;

            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(headX, headY, 11, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(headX + dir * 10, headY);
            ctx.lineTo(bodyHipX, cy - 6);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(bodyChestX, cy - 6);
            ctx.lineTo(cx - dir * 10, cy - 14);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(bodyHipX, cy - 6);
            ctx.lineTo(cx + dir * 22, cy - 12);
            ctx.lineTo(cx + dir * 35, cy - 4);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(bodyHipX, cy - 6);
            ctx.lineTo(cx + dir * 28, cy - 4);
            ctx.stroke();

            ctx.save();
            ctx.strokeStyle = '#ecf0f1';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(cx - dir * 10, cy - 3);
            ctx.lineTo(cx + dir * 30, cy - 3);
            ctx.stroke();
            ctx.restore();

            ctx.restore();
            return;
        } 
        else if (this.state === 'break') {
            headY = cy - 45;
            chestY = cy - 32;
            hipY = cy - 18;
            leftFoot = { x: cx - dir * 16, y: cy };
            rightFoot = { x: cx + dir * 6, y: cy };
            leftHand = { x: cx - dir * 8, y: cy - 20 };
            rightHand = { x: cx + dir * 14, y: cy - 20 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 10, y: cy };
        }
        else if (this.state === 'flinch') {
            headY = cy - 70;
            chestY = cy - 50;
            hipY = cy - 30;
            leftFoot = { x: cx - dir * 18, y: cy };
            rightFoot = { x: cx + dir * 6, y: cy };
            leftHand = { x: cx - dir * 18, y: cy - 60 };
            rightHand = { x: cx - dir * 8, y: cy - 55 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x - dir * 25, y: rightHand.y - 15 };
        }
        else if (this.state === 'charge') {
            const isFull = this.chargeTimer >= MAX_CHARGE_FRAMES;
            const pullBack = Math.min(12, this.chargeTimer * 0.3);
            const shake = isFull ? (Math.random() - 0.5) * 2.5 : 0;

            headY = cy - 66 + shake;
            chestY = cy - 48 + shake;
            hipY = cy - 28;

            leftFoot = { x: cx - dir * 20, y: cy };
            rightFoot = { x: cx + dir * 16, y: cy };

            rightHand = { x: cx - dir * (20 + pullBack) + shake, y: cy - 44 + shake };
            leftHand = { x: cx + dir * 16, y: cy - 48 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 55, y: rightHand.y - 4 };
        }
        else if (this.state === 'attack') {
            const progress = this.attackTimer;
            const reach = (progress >= 6 && progress <= 14) ? (this.isHeavyAttack ? 52 : 38) : 16; 

            if (this.isAirAttack) {
                headY = cy - 70;
                chestY = cy - 52;
                hipY = cy - 32;

                leftFoot = { x: cx - dir * 16, y: cy - 20 };
                rightFoot = { x: cx + dir * 8, y: cy - 10 };
                rightHand = { x: cx + dir * (20 + reach * 0.7), y: cy - 36 + (reach * 0.5) };
                leftHand = { x: cx - dir * 18, y: cy - 60 };

                swordStart = { x: rightHand.x, y: rightHand.y };
                swordEnd = { x: rightHand.x + dir * 52, y: rightHand.y + 40 };
            } else {
                headY = cy - 70;
                chestY = cy - 52;
                hipY = cy - 30;

                leftFoot = { x: cx - dir * 20, y: cy };
                rightFoot = { x: cx + dir * 28, y: cy }; 
                rightHand = { x: cx + dir * (32 + reach), y: cy - 44 };
                leftHand = { x: cx - dir * 20, y: cy - 58 }; 

                swordStart = { x: rightHand.x, y: rightHand.y };
                swordEnd = { x: rightHand.x + dir * (this.isHeavyAttack ? 75 : 60), y: rightHand.y };
            }
        } 
        else if (this.state === 'guard') {
            headY = cy - 72;
            chestY = cy - 52;
            hipY = cy - 30;
            leftFoot = { x: cx - dir * 9, y: cy };
            rightFoot = { x: cx + dir * 9, y: cy };
            rightHand = { x: cx + dir * 16, y: cy - 54 };
            leftHand = { x: cx + dir * 8, y: cy - 50 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 10, y: rightHand.y - 48 };
        } 
        else if (this.state === 'walk') {
            const cycle = Math.sin(this.animFrame * 0.25);
            leftFoot = { x: cx - 13 + (cycle * 13), y: cy };
            rightFoot = { x: cx + 13 - (cycle * 13), y: cy };
            leftHand = { x: cx - 11 - (cycle * 9), y: cy - 48 };
            rightHand = { x: cx + 11 + (cycle * 9), y: cy - 48 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 22, y: rightHand.y - 32 };
        } 
        else if (this.state === 'jump') {
            headY = cy - 78;
            chestY = cy - 58;
            hipY = cy - 36;
            leftFoot = { x: cx - 11, y: cy - 12 };
            rightFoot = { x: cx + 11, y: cy - 16 };
            leftHand = { x: cx - 16, y: cy - 64 };
            rightHand = { x: cx + 16, y: cy - 58 };

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 32, y: rightHand.y - 22 };
        }
        else {
            const breathe = Math.sin(this.animFrame * 0.05) * 1.5;
            headY += breathe;
            chestY += breathe * 0.5;

            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 22, y: rightHand.y - 32 };
        }

        // 頭部
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.beginPath();
        ctx.arc(cx, headY, 11, 0, Math.PI * 2);
        ctx.fill();

        // 目元バイザー
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + dir * 2, headY - 1);
        ctx.lineTo(cx + dir * 10, headY - 1);
        ctx.stroke();
        ctx.restore();

        // 胴体
        ctx.beginPath();
        ctx.moveTo(cx, headY + 11);
        ctx.lineTo(cx, hipY);
        ctx.stroke();

        // 胴体アーマー
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(cx, (chestY + hipY) / 2, 7, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

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
        ctx.save();
        ctx.strokeStyle = this.isHeavyAttack ? '#ffd32a' : '#ecf0f1'; 
        ctx.lineWidth = this.isHeavyAttack ? 4.5 : 3.8;
        ctx.beginPath();
        ctx.moveTo(swordStart.x, swordStart.y);
        ctx.lineTo(swordEnd.x, swordEnd.y);
        ctx.stroke();

        // 鍔
        ctx.strokeStyle = '#ffd32a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        const sDx = swordEnd.x - swordStart.x;
        const sDy = swordEnd.y - swordStart.y;
        const sLen = Math.hypot(sDx, sDy) || 1;
        const perpX = (-sDy / sLen) * 7;
        const perpY = (sDx / sLen) * 7;
        const tsubaX = swordStart.x + (sDx / sLen) * 6;
        const tsubaY = swordStart.y + (sDy / sLen) * 6;

        ctx.moveTo(tsubaX - perpX, tsubaY - perpY);
        ctx.lineTo(tsubaX + perpX, tsubaY + perpY);
        ctx.stroke();
        ctx.restore();

        if (this.state === 'guard') {
            ctx.strokeStyle = 'rgba(255, 211, 42, 0.45)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx + dir * 20, cy - 44, 25, -Math.PI/2, Math.PI/2, dir === -1);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// キャラクター初期化
const p1 = new Character('#ff5252', false); 
const p2 = new Character(CPU_COLORS[0], true);  
resizeCanvas();

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

    const p1HpBlocks = document.querySelectorAll('#p1-hp .hp-block');
    const p2HpBlocks = document.querySelectorAll('#p2-hp .hp-block');
    p1HpBlocks.forEach((block, idx) => block.classList.toggle('active', idx < p1.hp));
    p2HpBlocks.forEach((block, idx) => block.classList.toggle('active', idx < p2.hp));
}

function showOverlay(text, duration = 1500, callback) {
    overlayTextEl.innerText = text;
    gameOverlay.classList.add('show');
    
    setTimeout(() => {
        gameOverlay.classList.remove('show');
        if (callback) callback();
    }, duration);
}

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

function saveScore(streak) {
    if (streak <= 0) return;
    const records = JSON.parse(localStorage.getItem('fencing_ranking')) || [];
    const isTop3 = records.length < 3 || streak > records[records.length - 1].streak;
    
    if (isTop3) {
        setTimeout(() => {
            const name = prompt("🎉ハイスコア！TOP3入り！\n名前を入力してください（最大8文字）:", "PLAYER");
            const finalName = (name && name.trim() !== "") ? name.substring(0, 8) : "PLAYER";
            
            records.push({ name: finalName, streak: streak });
            records.sort((a, b) => b.streak - a.streak);
            if (records.length > 3) records.length = 3;
            
            localStorage.setItem('fencing_ranking', JSON.stringify(records));
            updateRankingUI();
        }, 500);
    }
}

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
    Sound.playBGM('title');
}

// オンライン対戦（Socket.io）ロジック
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
        statusEl.innerText = `部屋接続: PLAYER ${myPlayerNumber} として待機中...`;
    });

    socket.on('waiting_opponent', () => {
        statusEl.innerText = "相手を待機中 (パスワードを伝えてください)";
    });

    socket.on('room_full', () => {
        statusEl.innerText = "この部屋は満員です。";
        socket.disconnect();
    });

    socket.on('start_game', (data) => {
        statusEl.innerText = "マッチング成功！開始します...";
        isOnlineMode = true;
        winStreak = 0;
        p1Score = 0;
        p2Score = 0;
        currentRound = 1;

        p1.isCPU = false;
        p2.isCPU = false;
        p2.color = CPU_COLORS[0];

        document.getElementById('p1-name-display').innerText = data.p1;
        document.getElementById('p2-name-display').innerText = data.p2;

        Sound.playBGM('game');

        setTimeout(() => {
            onlineScreen.style.display = 'none';
            uiLayer.style.display = 'flex';
            streakCounterEl.style.display = 'none'; 
            p1.reset();
            p2.reset();
            updateScoreUI();
            showOverlay(`ROUND ${currentRound}`, 1500, startRound);
        }, 1000);
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
        opp.isHeavyAttack = data.isHeavyAttack;

        if (typeof data.myHp === 'number') {
            opp.hp = data.myHp;
        }

        if (typeof data.oppHp === 'number') {
            if (data.oppHp < myChar.hp) {
                myChar.hp = data.oppHp;
                const hitX = myChar.x + myChar.width / 2;
                const hitY = myChar.y + 40;
                triggerHitEffect(hitX, hitY, myChar.hp === 0, false);

                if (myChar.hp === 0) {
                    Sound.playSE('heavy');
                } else {
                    Sound.playSE('hit');
                }

                if (myChar.hp <= 0) {
                    myChar.state = 'hit';
                    myChar.vx = 0;
                    endRound(opp);
                } else {
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
        if (data.winnerNum === 1) {
            endRound(p1);
        } else if (data.winnerNum === 2) {
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
        isHeavyAttack: myChar.isHeavyAttack,
        myHp: myChar.hp,
        oppHp: typeof targetOppHp === 'number' ? targetOppHp : oppChar.hp,
        oppState: extraOppState || ''
    });
}

function startCPUMode() {
    isOnlineMode = false;
    myPlayerNumber = 0;
    winStreak = 0;
    p1Score = 0;
    p2Score = 0;
    currentRound = 1;

    p1.isCPU = false;
    p2.isCPU = true; 

    p2.color = CPU_COLORS[winStreak % CPU_COLORS.length];
    document.getElementById('p1-name-display').innerText = "PLAYER 1";
    document.getElementById('p2-name-display').innerText = `CPU LV.${winStreak + 1}`;
    document.getElementById('p2-name-display').style.color = p2.color;

    titleScreen.style.display = 'none';
    uiLayer.style.display = 'flex';
    streakCounterEl.style.display = 'block';
    streakCounterEl.innerText = `連勝: ${winStreak}`;
    
    Sound.playBGM('game');

    p1.reset();
    p2.reset();
    updateScoreUI();
    showOverlay(`ROUND ${currentRound}`, 1500, startRound);
}

function startRound() {
    for (let key in keys) keys[key] = false;
    p1.reset();
    p2.reset();
    p1.hp = MAX_HP;
    p2.hp = MAX_HP;
    particles = [];
    slashes = [];
    youMarkerTimer = 150;
    updateScoreUI();

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

    p1.vx = 0;
    p2.vx = 0;

    let message = "";
    if (winner === p1) {
        p1Score++;
        p2.hp = 0;
        p2.state = 'hit';
        message = isOnlineMode ? `${document.getElementById('p1-name-display').innerText} WIN` : "PLAYER 1 WIN";
    } else if (winner === p2) {
        p2Score++;
        p1.hp = 0;
        p1.state = 'hit';
        message = isOnlineMode ? `${document.getElementById('p2-name-display').innerText} WIN` : `${document.getElementById('p2-name-display').innerText} WIN`;
    } else {
        message = reason || "DRAW";
    }

    updateScoreUI();

    setTimeout(() => {
        if (p1Score >= MAX_SCORE) {
            if (isOnlineMode) {
                showOverlay(myPlayerNumber === 1 ? "VICTORY!" : "DEFEAT...", 3000, returnToTitle);
            } else {
                winStreak++;
                streakCounterEl.innerText = `連勝: ${winStreak}`;
                showOverlay(`VICTORY!\n${winStreak}連勝達成！`, 2000, startNextMatch);
            }
        } else if (p2Score >= MAX_SCORE) {
            if (isOnlineMode) {
                showOverlay(myPlayerNumber === 2 ? "VICTORY!" : "DEFEAT...", 3000, returnToTitle);
            } else {
                showOverlay(`DEFEAT...\n記録: ${winStreak}連勝`, 3000, () => {
                    saveScore(winStreak);
                    returnToTitle();
                });
            }
        } else {
            p1.reset();
            p2.reset();
            updateScoreUI();

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

    p2.color = CPU_COLORS[winStreak % CPU_COLORS.length];
    document.getElementById('p2-name-display').innerText = `CPU LV.${winStreak + 1}`;
    document.getElementById('p2-name-display').style.color = p2.color;

    Sound.playBGM('game');

    p1.reset();
    p2.reset();
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
    Sound.playBGM('title');
    updateRankingUI();
}

function handleHit(attacker, defender, isP1Attacker, hitX, hitY) {
    const isFacing = (attacker.x < defender.x && defender.direction === -1) || (attacker.x > defender.x && defender.direction === 1);

    if (defender.guardActive && isFacing) {
        triggerHitEffect(hitX, hitY, false, true);

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

        if (attacker.isHeavyAttack) {
            defender.hp = 0;
            defender.state = 'hit';
            defender.vx = 0;
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

            if (isOnlineMode) {
                emitMyPhysics('', defender.hp);
            }

            if (defender.hp <= 0) {
                defender.state = 'hit';
                defender.vx = 0;
                if (isOnlineMode && socket) {
                    socket.emit('match_round_over', { winnerNum: isP1Attacker ? 1 : 2 });
                }
                endRound(attacker);
            } else {
                defender.state = 'flinch';
                defender.flinchTimer = 16;
                defender.vx = attacker.direction * 6;
            }
        }
    }
}

function checkHits() {
    if (roundOver) return;

    if (isOnlineMode) {
        const myChar = (myPlayerNumber === 1) ? p1 : p2;
        const oppChar = (myPlayerNumber === 1) ? p2 : p1;
        const myAttack = myChar.getAttackBox();

        if (myAttack && oppChar.state !== 'flinch' && oppChar.state !== 'hit') {
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

    if (p1Attack && p2.state !== 'flinch' && p2.state !== 'hit') {
        const p2Body = { x: p2.x, y: p2.y, width: p2.width, height: p2.height };
        if (checkCollision(p1Attack, p2Body)) {
            const hitX = p1.direction === 1 ? p2.x + 8 : p2.x + p2.width - 8;
            const hitY = p1Attack.y + p1Attack.height / 2;
            handleHit(p1, p2, true, hitX, hitY);
        }
    }

    if (p2Attack && p1.state !== 'flinch' && p1.state !== 'hit') {
        const p1Body = { x: p1.x, y: p1.y, width: p1.width, height: p1.height };
        if (checkCollision(p2Attack, p1Body)) {
            const hitX = p2.direction === 1 ? p1.x + 8 : p1.x + p1.width - 8;
            const hitY = p2Attack.y + p2Attack.height / 2;
            handleHit(p2, p1, false, hitX, hitY);
        }
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (youMarkerTimer > 0) {
        youMarkerTimer--;
    }

    ctx.save();
    if (screenShakeTimer > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeIntensity;
        const shakeY = (Math.random() - 0.5) * screenShakeIntensity;
        ctx.translate(shakeX, shakeY);
        screenShakeTimer--;
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

    if (gameActive) {
        p1.update(p2);
        p2.update(p1);
        
        if (isOnlineMode) emitMyPhysics();
        checkHits();
    }

    p1.draw();
    p2.draw();

    for (let i = slashes.length - 1; i >= 0; i--) {
        slashes[i].update();
        slashes[i].draw();
        if (slashes[i].life <= 0) slashes.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }

    ctx.restore();

    requestAnimationFrame(gameLoop);
}

// 起動
updateRankingUI();
Sound.playBGM('title');
gameLoop();
