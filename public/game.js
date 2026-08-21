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
const ROUND_TIME_LIMIT = 60; 
const MAX_SCORE = 2;
const MAX_HP = 5;
const MAX_CHARGE_FRAMES = 45;

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

// ★ 画面揺れ（スクリーンシェイク）用変数
let screenShakeTimer = 0;
let screenShakeIntensity = 0;

// ★ パーティクル＆エフェクト管理
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
        this.vy += 0.2; // わずかな重力
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

        // 衝撃リング（溜め攻撃時）
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

// ヒットエフェクト発生関数
function triggerHitEffect(x, y, isHeavy, isGuard) {
    if (isGuard) {
        // ガード時の黄色い火花
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
        // ヒット時のサイバー閃光＆スパーク
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

        // 鋭い斬撃スラッシュ線
        const slashAngle = (Math.random() - 0.5) * 0.8;
        slashes.push(new SlashEffect(x, y, slashAngle, isHeavy ? 100 : 65, color, isHeavy));

        // 画面揺れ発動
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
        this.isGrounded = false;
        
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
    }

    update(opponent) {
        this.animFrame++;

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
                    return;
                } else {
                    this.state = 'attack';
                    this.isHeavyAttack = false;
                    this.isAirAttack = false;
                    this.attackTimer = 0;
                    this.chargeTimer = 0;
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
        this.vx = 0;
        this.guardActive = false;
        if (this.state === 'guard') this.state = 'idle';

        if (this.state === 'charge') {
            this.chargeTimer++;
            if (this.chargeTimer >= MAX_CHARGE_FRAMES) {
                this.state = 'attack';
                this.isHeavyAttack = true;
                this.isAirAttack = false;
                this.attackTimer = 0;
                this.chargeTimer = 0;
            }
            return;
        }

        if (this.state === 'attack') return;

        const distance = Math.abs((this.x + this.width / 2) - (opponent.x + opponent.width / 2));
        this.cpuActionTimer--;
        
        if (this.cpuActionTimer <= 0) {
            const speedFactor = Math.max(4, 18 - winStreak);
            this.cpuActionTimer = 8 + Math.random() * speedFactor;
            
            const rand = Math.random();

            if (distance < 130) {
                const guardChance = Math.min(0.85, 0.5 + winStreak * 0.05);

                if (opponent.state === 'attack' && rand < guardChance) {
                    this.cpuDecision = 'guard';
                } else if (opponent.state === 'charge' && rand < 0.6) {
                    this.cpuDecision = (rand < 0.3) ? 'attack' : 'backstep';
                } else if (rand < 0.35) {
                    this.cpuDecision = 'attack';
                } else if (rand < 0.50 && this.isGrounded) {
                    this.cpuDecision = 'charge';
                } else if (rand < 0.70 && this.isGrounded) {
                    this.vy = -12;
                    this.isGrounded = false;
                    this.state = 'jump';
                    this.cpuDecision = 'air_attack';
                } else if (rand < 0.85) {
                    this.cpuDecision = 'backstep';
                } else {
                    this.cpuDecision = 'idle';
                }
            } else {
                this.cpuDecision = (rand < 0.8) ? 'approach' : 'idle';
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
        } else if (this.cpuDecision === 'charge' && this.isGrounded && this.attackCooldown === 0) {
            this.state = 'charge';
            this.chargeTimer = 0;
            this.cpuDecision = 'idle';
        } else if (this.cpuDecision === 'attack' && this.attackCooldown === 0) {
            this.state = 'attack';
            this.isAirAttack = false;
            this.isHeavyAttack = false;
            this.attackTimer = 0;
            this.cpuDecision = 'idle';
        } else if (this.cpuDecision === 'air_attack' && !this.isGrounded && this.attackCooldown === 0) {
            this.state = 'attack';
            this.isAirAttack = true;
            this.isHeavyAttack = false;
            this.attackTimer = 0;
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
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y, 24, 6, 0, 0, Math.PI * 2);
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

        // 溜め発光
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
            headY = cy - 30;
            chestY = cy - 20;
            hipY = cy - 10;
            leftFoot = { x: cx - 22, y: cy };
            rightFoot = { x: cx + 16, y: cy };
            leftHand = { x: cx - 12, y: cy - 6 };
            rightHand = { x: cx + 12, y: cy - 6 };
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

        ctx.beginPath();
        ctx.arc(cx, headY, 11, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, headY + 11);
        ctx.lineTo(cx, hipY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, hipY);
        ctx.lineTo(leftFoot.x, leftFoot.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, hipY);
        ctx.lineTo(rightFoot.x, rightFoot.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, chestY);
        ctx.lineTo(leftHand.x, leftHand.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, chestY);
        ctx.lineTo(rightHand.x, rightHand.y);
        ctx.stroke();

        if (this.state !== 'hit') {
            ctx.save();
            ctx.strokeStyle = this.isHeavyAttack ? '#ffd32a' : '#ecf0f1'; 
            ctx.lineWidth = this.isHeavyAttack ? 4.5 : 3.8;
            ctx.beginPath();
            ctx.moveTo(swordStart.x, swordStart.y);
            ctx.lineTo(swordEnd.x, swordEnd.y);
            ctx.stroke();

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
        }

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
const p2 = new Character('#40c4ff', true);  
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
}

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

    socket.on('opponent_physics', (data) => {
        if (roundOver) return;
        const opp = (myPlayerNumber === 1) ? p2 : p1;
        opp.x = data.x;
        opp.y = data.y;
        opp.direction = data.direction;
        opp.state = data.state;
        opp.guardActive = data.guardActive;
        opp.attackTimer = data.attackTimer;
        opp.chargeTimer = data.chargeTimer;
        opp.isHeavyAttack = data.isHeavyAttack;
        opp.hp = data.hp;
        updateScoreUI();
    });

    socket.on('round_result', (data) => {
        if (roundOver) return;
        if (data.winnerNum === 1) {
            p1.state = 'idle';
            p2.state = 'hit';
            p2.hp = 0;
            endRound(p1);
        } else if (data.winnerNum === 2) {
            p1.state = 'hit';
            p1.hp = 0;
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
        attackTimer: myChar.attackTimer,
        chargeTimer: myChar.chargeTimer,
        isHeavyAttack: myChar.isHeavyAttack,
        hp: myChar.hp
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

    document.getElementById('p1-name-display').innerText = "PLAYER 1";
    document.getElementById('p2-name-display').innerText = "CPU";

    titleScreen.style.display = 'none';
    uiLayer.style.display = 'flex';
    streakCounterEl.style.display = 'block';
    streakCounterEl.innerText = `連勝: ${winStreak}`;
    
    updateScoreUI();
    showOverlay(`ROUND ${currentRound}`, 1500, startRound);
}

function startRound() {
    for (let key in keys) keys[key] = false;
    p1.reset();
    p2.reset();
    particles = [];
    slashes = [];
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
    roundOver = true;
    clearInterval(timerInterval);

    p1.vx = 0;
    p2.vx = 0;

    let message = "";
    if (winner === p1) {
        p1Score++;
        message = isOnlineMode ? `${document.getElementById('p1-name-display').innerText} WIN` : "PLAYER 1 WIN";
    } else if (winner === p2) {
        p2Score++;
        message = isOnlineMode ? `${document.getElementById('p2-name-display').innerText} WIN` : "CPU WIN";
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
                showOverlay(`VICTORY!\n${winStreak}連勝`, 2000, startNextMatch);
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

// ヒット・ガード・ダメージ処理
function handleHit(attacker, defender, isP1Attacker, hitX, hitY) {
    const isFacing = (attacker.x < defender.x && defender.direction === -1) || (attacker.x > defender.x && defender.direction === 1);

    if (defender.guardActive && isFacing) {
        // ガード時の火花エフェクト
        triggerHitEffect(hitX, hitY, false, true);

        if (attacker.isHeavyAttack) {
            defender.state = 'break';
            defender.breakTimer = 65;
            defender.vx = defender.direction * -15;
            attacker.attackTimer = 28;
        } else {
            defender.x += defender.direction * -20; 
            attacker.attackTimer = 22; 
        }
    } else {
        // ★ ヒット時のサイバースパーク＆画面揺れ
        triggerHitEffect(hitX, hitY, attacker.isHeavyAttack, false);

        if (attacker.isHeavyAttack) {
            defender.hp = 0;
            defender.state = 'hit';
            defender.vx = 0;
            updateScoreUI();

            if (isOnlineMode) {
                if (myPlayerNumber === (isP1Attacker ? 1 : 2)) {
                    socket.emit('match_round_over', { winnerNum: isP1Attacker ? 1 : 2 });
                }
            } else {
                endRound(attacker);
            }
        } else {
            defender.hp--;
            updateScoreUI();
            attacker.attackTimer = 22;

            if (defender.hp <= 0) {
                defender.state = 'hit';
                defender.vx = 0;
                if (isOnlineMode) {
                    if (myPlayerNumber === (isP1Attacker ? 1 : 2)) {
                        socket.emit('match_round_over', { winnerNum: isP1Attacker ? 1 : 2 });
                    }
                } else {
                    endRound(attacker);
                }
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

    // ★ 画面揺れ（スクリーンシェイク）の適用
    ctx.save();
    if (screenShakeTimer > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeIntensity;
        const shakeY = (Math.random() - 0.5) * screenShakeIntensity;
        ctx.translate(shakeX, shakeY);
        screenShakeTimer--;
    }

    // 地面描画
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

    // ★ スラッシュ斬撃エフェクトの更新＆描画
    for (let i = slashes.length - 1; i >= 0; i--) {
        slashes[i].update();
        slashes[i].draw();
        if (slashes[i].life <= 0) slashes.splice(i, 1);
    }

    // ★ パーティクル（火花・光の破片）の更新＆描画
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }

    ctx.restore(); // スクリーンシェイク解除

    requestAnimationFrame(gameLoop);
}

// 起動
updateRankingUI();
gameLoop();
