// ==========================================
// ★ event.js v17.0（兜描画 ＆ 溜め・必殺KO大吹き飛び対応）
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const streakCounterEl = document.getElementById('streak-counter');
const uiLayer = document.getElementById('ui-layer');
const titleScreen = document.getElementById('title-screen');
const gameOverlay = document.getElementById('game-overlay');
const overlayTextEl = document.getElementById('overlay-text');
const btnSpecial = document.getElementById('btn-special');
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
let roundEndTimeout = null;
let overlayTimeout = null;

const TARGET_FPS = 60;
const STEP = 1000 / TARGET_FPS;
let lastFrameTime = performance.now();
let accumulator = 0;

function adjustColor(hex, lum) {
    hex = String(hex).replace(/[^0-9a-f]/gi, '');
    if (hex.length < 6) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    lum = lum || 0;
    let rgb = "#", c, i;
    for (i = 0; i < 3; i++) {
        c = parseInt(hex.substr(i*2, 2), 16);
        c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
        rgb += ("00"+c).substr(c.length);
    }
    return rgb;
}

const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
function updateControlsVisibility() {
    const disp = (isTouchDevice && gameActive) ? 'flex' : 'none';
    if (touchControls) touchControls.style.display = disp;
    if (specialControlContainer) specialControlContainer.style.display = disp;
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

let p1Score = 0, p2Score = 0, currentRound = 1, roundTimer = ROUND_TIME_LIMIT;
let timerInterval = null, gameActive = false, roundOver = false, winStreak = 0;
let youMarkerTimer = 0, screenShakeTimer = 0, screenShakeIntensity = 0;

const keys = { a: false, d: false, w: false, s: false, f: false, space: false };
window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k === ' ') keys.space = true; if (k in keys) keys[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === ' ') keys.space = false; if (k in keys) keys[k] = false; });

const touchBinds = [
    { btnId: 'btn-left', key: 'a' },
    { btnId: 'btn-right', key: 'd' },
    { btnId: 'btn-jump', key: 'w' },
    { btnId: 'btn-guard', key: 's' },
    { btnId: 'btn-attack', key: 'f' },
    { btnId: 'btn-special', key: 'space' }
];

touchBinds.forEach(b => {
    const btn = document.getElementById(b.btnId);
    if (btn) {
        btn.addEventListener('touchstart', e => { e.preventDefault(); keys[b.key] = true; }, { passive: false });
        btn.addEventListener('touchend', e => { e.preventDefault(); keys[b.key] = false; }, { passive: false });
        btn.addEventListener('touchcancel', e => { e.preventDefault(); keys[b.key] = false; }, { passive: false });
    }
});

class Character {
    constructor(color, isCPU) {
        this.width = 44; this.height = 88;
        this.color = color; this.bodyColor = color; this.legsColor = color;
        this.armorBodyColor = color; this.armorLegsColor = color;
        this.outfitType = 'normal';
        this.hasHelmet = false;
        this.helmetColor = color;
        this.visorColor = '#ffffff';
        this.hasCloak = false; this.hasGodAura = false;
        this.isCPU = isCPU; this.startX = 0; this.startY = 0; this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0; this.hp = MAX_HP; this.sp = 0;
        this.direction = isCPU ? -1 : 1; this.isGrounded = true; this.state = 'idle';
        this.isAirAttack = false; this.isHeavyAttack = false; this.isSpecialAttack = false;
        this.hadouTimer = 0; this.chargeTimer = 0; this.attackTimer = 0; this.attackCooldown = 0;
        this.flinchTimer = 0; this.breakTimer = 0; this.guardActive = false; this.animFrame = 0;
        this.cpuActionTimer = 0; this.cpuDecision = 'idle';
        this.cpuTargetAirAttack = false;
    }

    reset() {
        this.x = this.startX; this.y = GROUND_Y - this.height; this.vx = 0; this.vy = 0;
        this.hp = MAX_HP; this.sp = 0; this.state = 'idle';
        this.isAirAttack = false; this.isHeavyAttack = false; this.isSpecialAttack = false;
        this.hadouTimer = 0; this.chargeTimer = 0; this.attackTimer = 0; this.attackCooldown = 0;
        this.flinchTimer = 0; this.breakTimer = 0; this.guardActive = false; this.isGrounded = true;
        this.cpuTargetAirAttack = false;
    }

    addSP(amount) {
        this.sp = Math.min(MAX_SP, this.sp + amount);
        updateScoreUI();
    }

    update(opponent) {
        this.animFrame += 1 * timeScale;
        if (!this.isGrounded) this.vy += GRAVITY * timeScale;

        if (this.state === 'blowaway') {
            this.y += this.vy * timeScale;
            this.vy += GRAVITY * 0.8 * timeScale;
            if (this.y + this.height >= GROUND_Y) {
                this.y = GROUND_Y - this.height;
                this.vy = 0; this.vx = 0;
                this.state = 'hit';
            }
            return;
        }

        if (this.state === 'hadouken') {
            this.hadouTimer += 1 * timeScale;
            this.vx = 0; this.vy = 0;
            if (Math.floor(this.hadouTimer) === 24) {
                const ballX = (this.direction === 1) ? (this.x + this.width + 12) : (this.x - 12);
                const ballY = this.y + 42;
                energyBalls.push(new EnergyBall(ballX, ballY, this.direction, this.color, this === p1 ? 1 : 2));
                Sound.playSE('swing');
                screenShakeTimer = 6; screenShakeIntensity = 4;
            }
            if (this.hadouTimer > 52) {
                this.state = 'idle'; this.isSpecialAttack = false;
                this.hadouTimer = 0; this.attackCooldown = 15;
            }
            return;
        }

        if (this.state === 'flinch') {
            this.flinchTimer -= 1 * timeScale;
            this.vx *= 0.85;
            if (this.flinchTimer <= 0) { this.state = 'idle'; this.vx = 0; }
        }

        if (this.state === 'break') {
            this.breakTimer -= 1 * timeScale;
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
                this.attackCooldown = this.isCPU ? 20 : 14;
            }
        }

        if (this.attackCooldown > 0) this.attackCooldown -= 1 * timeScale;

        if (this.state !== 'hit' && this.state !== 'flinch' && this.state !== 'break' && !roundOver) {
            if (this.isCPU) this.updateEventCPU(opponent);
            else this.updatePlayer();
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

        if (this.x < 12) this.x = 12;
        if (this.x + this.width > canvas.width - 12) this.x = canvas.width - this.width - 12;

        if (this.state !== 'attack' && this.state !== 'hadouken' && this.state !== 'hit' && this.state !== 'break' && !roundOver) {
            this.direction = (opponent.x > this.x) ? 1 : -1;
        }
    }

    updatePlayer() {
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

        if (keys.s && this.isGrounded && this.state !== 'attack' && this.state !== 'charge' && this.state !== 'hadouken') {
            this.state = 'guard';
            this.guardActive = true;
            return;
        } else {
            this.guardActive = false;
            if (this.state === 'guard') this.state = 'idle';
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

    updateEventCPU(opponent) {
        const distance = Math.abs((this.x + this.width / 2) - (opponent.x + opponent.width / 2));
        const isNearWall = (this.x <= 40 || this.x >= canvas.width - 80);

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
            this.cpuActionTimer = 16 + Math.random() * 10;
            const rand = Math.random();

            if (opponent.state === 'attack' && distance < 130) {
                if (rand < 0.35) this.cpuDecision = 'guard';
                else if (rand < 0.55 && !isNearWall) this.cpuDecision = 'backstep';
                else this.cpuDecision = 'idle';
            } else if (distance < 110) {
                if (rand < 0.22 && this.attackCooldown <= 0) this.cpuDecision = 'attack';
                else if (rand < 0.45 && !isNearWall) this.cpuDecision = 'backstep';
                else if (rand < 0.60 && this.isGrounded) this.cpuDecision = 'jump_forward';
                else if (rand < 0.70 && this.isGrounded && this.attackCooldown <= 0) this.cpuDecision = 'charge';
                else this.cpuDecision = 'idle';
            } else {
                if (rand < 0.55) this.cpuDecision = 'approach';
                else if (rand < 0.75 && this.isGrounded) this.cpuDecision = 'jump_forward';
                else this.cpuDecision = 'idle';
            }
        }

        this.guardActive = false;
        if (this.state === 'guard') this.state = 'idle';

        if (this.cpuDecision === 'approach') {
            this.vx = (opponent.x < this.x) ? -3.4 : 3.4;
            if (this.isGrounded) this.state = 'walk';
        } else if (this.cpuDecision === 'backstep') {
            this.vx = (opponent.x < this.x) ? 3.8 : -3.8;
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
            this.vy = -12.0;
            this.vx = (opponent.x < this.x) ? -3.5 : 3.5;
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
                const boxWidth = 65, boxHeight = 45;
                const x = (this.direction === 1) ? (this.x + this.width * 0.5) : (this.x - boxWidth + this.width * 0.5);
                return { x, y: this.y + 40, width: boxWidth, height: boxHeight };
            } else if (this.isHeavyAttack) {
                const boxWidth = 85, boxHeight = 18;
                const x = (this.direction === 1) ? (this.x + this.width) : (this.x - boxWidth);
                return { x, y: this.y + 36, width: boxWidth, height: boxHeight };
            } else {
                const boxWidth = 70, boxHeight = 14;
                const x = (this.direction === 1) ? (this.x + this.width) : (this.x - boxWidth);
                return { x, y: this.y + 38, width: boxWidth, height: boxHeight };
            }
        }
        return null;
    }

    draw(isDarkTone) {
        const cx = this.x + this.width / 2; 
        const cy = this.y + this.height;    
        ctx.save();
        ctx.lineWidth = 5.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        if (this.state !== 'blowaway') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.ellipse(cx, GROUND_Y, this.state === 'hit' ? 40 : 25, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        let headY = cy - 74; let chestY = cy - 54; let hipY = cy - 32;
        let leftFoot = { x: cx - 13, y: cy }; let rightFoot = { x: cx + 13, y: cy };
        let leftHand = { x: cx - 13, y: cy - 48 }; let rightHand = { x: cx + 13, y: cy - 48 };
        let swordStart = { x: 0, y: 0 }; let swordEnd = { x: 0, y: 0 };
        const dir = this.direction;

        // YOUマーカー
        if (this === p1 && gameActive && this.state !== 'hit' && this.state !== 'blowaway' && youMarkerTimer > 0) {
            const bob = Math.sin(this.animFrame * 0.15) * 4;
            const markerY = headY - 26 + bob;
            ctx.save();
            ctx.font = 'bold 12px "Segoe UI", sans-serif';
            ctx.fillStyle = '#ffd32a'; ctx.textAlign = 'center';
            ctx.shadowBlur = 8; ctx.shadowColor = '#ffd32a';
            ctx.fillText('YOU', cx, markerY);
            ctx.beginPath();
            ctx.moveTo(cx - 5, markerY + 4); ctx.lineTo(cx + 5, markerY + 4); ctx.lineTo(cx, markerY + 9);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        }

        // 溜め発光
        if (this.state === 'charge') {
            const isFull = this.chargeTimer >= MAX_CHARGE_FRAMES;
            const flashSpeed = isFull ? 0.4 : 0.18;
            const alpha = 0.4 + Math.sin(this.animFrame * flashSpeed) * 0.4;
            ctx.shadowBlur = 28; ctx.shadowColor = '#ffd32a';
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

        // 波動拳
        if (this.state === 'hadouken') {
            headY = cy - 68; chestY = cy - 50; hipY = cy - 30;
            leftFoot = { x: cx - dir * 18, y: cy }; rightFoot = { x: cx + dir * 22, y: cy };
            const t = this.hadouTimer;
            const swordFlightY = cy - 80 - Math.sin((t / 52) * Math.PI) * 75;
            const swordFlightRot = t * 0.45;

            if (t < 24) {
                ctx.save(); ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(-100, -100, canvas.width + 200, canvas.height + 200); ctx.restore();
            }
            leftHand = { x: cx + dir * 24, y: cy - 44 };
            rightHand = { x: cx + dir * 28, y: cy - 40 };

            if (t < 48) {
                ctx.save(); ctx.translate(cx, swordFlightY); ctx.rotate(swordFlightRot);
                ctx.strokeStyle = '#ecf0f1'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(-25, 0); ctx.lineTo(25, 0); ctx.stroke(); ctx.restore();
            } else {
                swordStart = { x: rightHand.x, y: rightHand.y };
                swordEnd = { x: rightHand.x + dir * 45, y: rightHand.y - 20 };
            }
        }
        else if (this.state === 'blowaway') {
            headY = cy - 80; chestY = cy - 60; hipY = cy - 40;
            leftFoot = { x: cx - 10, y: cy - 10 }; rightFoot = { x: cx + 10, y: cy - 10 };
            leftHand = { x: cx - 25, y: cy - 75 }; rightHand = { x: cx + 25, y: cy - 75 };
        }
        else if (this.state === 'hit') {
            const headX = cx - dir * 35;
            headY = cy - 8;
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(headX, headY, 11, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = this.bodyColor;
            ctx.beginPath(); ctx.moveTo(headX + dir * 10, headY); ctx.lineTo(cx, cy - 6); ctx.stroke();
            ctx.restore();
            return;
        }
        else if (this.state === 'charge') {
            const pullBack = Math.min(12, this.chargeTimer * 0.3);
            const isFull = this.chargeTimer >= MAX_CHARGE_FRAMES;
            const shake = isFull ? (Math.random() - 0.5) * 2.5 : 0;
            headY = cy - 66 + shake; chestY = cy - 48 + shake; hipY = cy - 28;
            leftFoot = { x: cx - dir * 20, y: cy }; rightFoot = { x: cx + dir * 16, y: cy };
            rightHand = { x: cx - dir * (20 + pullBack) + shake, y: cy - 44 + shake };
            leftHand = { x: cx + dir * 16, y: cy - 48 };
            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 55, y: rightHand.y - 4 };
        }
        else if (this.state === 'attack') {
            const reach = (this.attackTimer >= 6 && this.attackTimer <= 14) ? (this.isHeavyAttack ? 52 : 38) : 16;
            if (this.isAirAttack) {
                headY = cy - 70; chestY = cy - 52; hipY = cy - 32;
                leftFoot = { x: cx - dir * 16, y: cy - 20 }; rightFoot = { x: cx + dir * 8, y: cy - 10 };
                rightHand = { x: cx + dir * (20 + reach * 0.7), y: cy - 36 + (reach * 0.5) }; leftHand = { x: cx - dir * 18, y: cy - 60 };
                swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 52, y: rightHand.y + 40 };
            } else {
                headY = cy - 70; chestY = cy - 52; hipY = cy - 30;
                leftFoot = { x: cx - dir * 20, y: cy }; rightFoot = { x: cx + dir * 28, y: cy }; 
                rightHand = { x: cx + dir * (32 + reach), y: cy - 44 }; leftHand = { x: cx - dir * 20, y: cy - 58 }; 
                swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * (this.isHeavyAttack ? 75 : 60), y: rightHand.y };
            }
        }
        else if (this.state === 'guard') {
            headY = cy - 72; chestY = cy - 52; hipY = cy - 30;
            leftFoot = { x: cx - dir * 9, y: cy }; rightFoot = { x: cx + dir * 9, y: cy };
            rightHand = { x: cx + dir * 16, y: cy - 54 }; leftHand = { x: cx + dir * 8, y: cy - 50 };
            swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 10, y: rightHand.y - 48 };
        }
        else if (this.state === 'walk') {
            const cycle = Math.sin(this.animFrame * 0.25);
            leftFoot = { x: cx - 13 + (cycle * 13), y: cy }; rightFoot = { x: cx + 13 - (cycle * 13), y: cy };
            leftHand = { x: cx - 11 - (cycle * 9), y: cy - 48 }; rightHand = { x: cx + 11 + (cycle * 9), y: cy - 48 };
            swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 22, y: rightHand.y - 32 };
        } 
        else if (this.state === 'jump') {
            headY = cy - 78; chestY = cy - 58; hipY = cy - 36;
            leftFoot = { x: cx - 11, y: cy - 12 }; rightFoot = { x: cx + 11, y: cy - 16 };
            leftHand = { x: cx - 16, y: cy - 64 }; rightHand = { x: cx + 16, y: cy - 58 };
            swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 32, y: rightHand.y - 22 };
        }
        else {
            const breathe = Math.sin(this.animFrame * 0.05) * 1.5;
            headY += breathe; chestY += breathe * 0.5;
            swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 22, y: rightHand.y - 32 };
        }

        // 頭部素体
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(cx, headY, 11, 0, Math.PI * 2); ctx.fill();

        // ★ 兜（フルヘルム）描画
        if (this.hasHelmet && this.state !== 'hit') {
            const hColor = this.helmetColor || '#ff5252';
            const hLight = adjustColor(hColor, 0.45);

            ctx.save();
            ctx.fillStyle = hColor;
            ctx.strokeStyle = '#ffd32a';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(cx, headY - 1, 12.5, Math.PI * 0.75, Math.PI * 2.25);
            ctx.lineTo(cx + dir * 11, headY + 6);
            ctx.lineTo(cx - dir * 11, headY + 6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 兜トサカ
            ctx.fillStyle = hLight;
            ctx.beginPath();
            ctx.moveTo(cx - dir * 4, headY - 13);
            ctx.lineTo(cx + dir * 8, headY - 20);
            ctx.lineTo(cx + dir * 4, headY - 12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // バイザー装飾
        ctx.save();
        const vColor = this.visorColor || '#ffffff';
        ctx.strokeStyle = vColor;
        ctx.lineWidth = (vColor === '#ffffff') ? 2.5 : 3.5;
        if (vColor !== '#ffffff') {
            ctx.shadowBlur = 8;
            ctx.shadowColor = vColor;
        }
        ctx.beginPath();
        ctx.moveTo(cx + dir * 2, headY - 1);
        ctx.lineTo(cx + dir * 11, headY - 1);
        ctx.stroke();
        ctx.restore();

        // 脚
        ctx.save();
        ctx.strokeStyle = this.legsColor; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(leftFoot.x, leftFoot.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(rightFoot.x, rightFoot.y); ctx.stroke();

        // 鎧（下半身：立体脛当て・菱形ニーガード・鉄靴）
        if (this.outfitType === 'armor') {
            const aLegLight = adjustColor(this.armorLegsColor, 0.45);
            const aLegDark = adjustColor(this.armorLegsColor, -0.45);

            [leftFoot, rightFoot].forEach((foot) => {
                const kneeX = (cx + foot.x) / 2;
                const kneeY = (hipY + foot.y) / 2;

                ctx.save();
                const shinGrad = ctx.createLinearGradient(kneeX, kneeY, foot.x, foot.y);
                shinGrad.addColorStop(0, aLegLight);
                shinGrad.addColorStop(0.5, this.armorLegsColor);
                shinGrad.addColorStop(1, aLegDark);

                ctx.strokeStyle = shinGrad;
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.moveTo(kneeX, kneeY);
                ctx.lineTo(foot.x, foot.y);
                ctx.stroke();

                // 菱形ニーガード
                ctx.fillStyle = aLegLight;
                ctx.strokeStyle = '#ffd32a';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(kneeX, kneeY - 5.5);
                ctx.lineTo(kneeX + 4.5, kneeY);
                ctx.lineTo(kneeX, kneeY + 5.5);
                ctx.lineTo(kneeX - 4.5, kneeY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // 鉄靴サバトン
                ctx.fillStyle = aLegDark;
                ctx.beginPath();
                ctx.ellipse(foot.x + dir * 2, foot.y, 7, 4, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ecf0f1';
                ctx.beginPath();
                ctx.ellipse(foot.x + dir * 2, foot.y - 1, 4, 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }
        ctx.restore();

        // 上半身＆腕
        if (this.outfitType === 'armor') {
            const aBodyLight = adjustColor(this.armorBodyColor, 0.55);
            const aBodyDark = adjustColor(this.armorBodyColor, -0.5);

            ctx.save();
            ctx.strokeStyle = this.bodyColor;
            ctx.lineWidth = 5.5;
            ctx.beginPath();
            ctx.moveTo(cx, headY + 11);
            ctx.lineTo(cx, hipY);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = this.bodyColor;
            ctx.lineWidth = 5.5;
            ctx.beginPath();
            ctx.moveTo(cx, chestY);
            ctx.lineTo(leftHand.x, leftHand.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx, chestY);
            ctx.lineTo(rightHand.x, rightHand.y);
            ctx.stroke();

            [leftHand, rightHand].forEach(hand => {
                ctx.fillStyle = this.armorBodyColor;
                ctx.strokeStyle = aBodyLight;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(hand.x, hand.y, 4.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
            ctx.restore();

            ctx.save();
            const chestMidY = (chestY + hipY) / 2;

            ctx.fillStyle = aBodyDark;
            ctx.beginPath();
            ctx.ellipse(cx, chestMidY, 13, 18, 0, 0, Math.PI * 2);
            ctx.fill();

            const chestGrad = ctx.createLinearGradient(cx - 10, chestY - 4, cx + 10, hipY);
            chestGrad.addColorStop(0, aBodyLight);
            chestGrad.addColorStop(0.45, this.armorBodyColor);
            chestGrad.addColorStop(1, aBodyDark);
            ctx.fillStyle = chestGrad;
            ctx.beginPath();
            ctx.ellipse(cx, chestMidY, 11, 15, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, chestY - 2);
            ctx.lineTo(cx, hipY - 2);
            ctx.stroke();

            ctx.fillStyle = '#ffd32a';
            ctx.beginPath();
            ctx.arc(cx, chestY + 6, 3.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = this.armorBodyColor;
            ctx.strokeStyle = aBodyDark;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(cx - dir * 8, hipY + 1, 4, 6, -0.3 * dir, 0, Math.PI * 2);
            ctx.ellipse(cx + dir * 8, hipY + 1, 4, 6, 0.3 * dir, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            [-1, 1].forEach(side => {
                const spX = cx + side * 8;
                const spY = chestY - 3;

                ctx.fillStyle = aBodyDark;
                ctx.beginPath();
                ctx.ellipse(spX, spY + 3, 7.5, 5, side * 0.3, 0, Math.PI * 2);
                ctx.fill();

                const spGrad = ctx.createLinearGradient(spX - 5, spY - 5, spX + 5, spY + 5);
                spGrad.addColorStop(0, '#ffffff');
                spGrad.addColorStop(0.3, aBodyLight);
                spGrad.addColorStop(1, this.armorBodyColor);
                ctx.fillStyle = spGrad;
                ctx.strokeStyle = '#ffd32a';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.ellipse(spX, spY, 7, 5, side * 0.25, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
            ctx.restore();

        } else {
            ctx.strokeStyle = this.bodyColor;
            ctx.beginPath();
            ctx.moveTo(cx, headY + 11);
            ctx.lineTo(cx, hipY);
            ctx.stroke();

            ctx.save();
            ctx.fillStyle = this.bodyColor;
            ctx.beginPath();
            ctx.ellipse(cx, (chestY + hipY) / 2, 7, 14, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = this.bodyColor;
            ctx.lineWidth = 5.5;
            ctx.beginPath();
            ctx.moveTo(cx, chestY);
            ctx.lineTo(leftHand.x, leftHand.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx, chestY);
            ctx.lineTo(rightHand.x, rightHand.y);
            ctx.stroke();
            ctx.restore();
        }

        // 剣
        if (this.state !== 'blowaway' && (this.state !== 'hadouken' || this.hadouTimer >= 48)) {
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

const p1 = new Character('#ff5252', false);
const p2 = new Character('#40c4ff', true);
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

function updateScoreUI() {
    const p1HpEl = document.getElementById('p1-hp'); const p2HpEl = document.getElementById('p2-hp');
    if (p1HpEl) p1HpEl.style.width = `${(p1.hp / MAX_HP) * 100}%`;
    if (p2HpEl) p2HpEl.style.width = `${(p2.hp / MAX_HP) * 100}%`;

    const p1SpEl = document.getElementById('p1-sp'); const p2SpEl = document.getElementById('p2-sp');
    if (p1SpEl) p1SpEl.style.width = `${p1.sp}%`;
    if (p2SpEl) p2SpEl.style.width = `${p2.sp}%`;

    const p1Dots = document.querySelectorAll('#p1-score .dot'); const p2Dots = document.querySelectorAll('#p2-score .dot');
    p1Dots.forEach((d, i) => d.classList.toggle('active', i < p1Score));
    p2Dots.forEach((d, i) => d.classList.toggle('active', i < p2Score));

    if (btnSpecial) {
        if (p1.sp >= MAX_SP) btnSpecial.classList.add('ready');
        else btnSpecial.classList.remove('ready');
    }
}

function showOverlay(t, d = 1500, cb) {
    overlayTextEl.innerText = t; gameOverlay.classList.add('show');
    if (overlayTimeout) clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => { gameOverlay.classList.remove('show'); if (cb) cb(); }, d);
}

function startEventBattle() {
    winStreak = 0; p1Score = 0; p2Score = 0; currentRound = 1; timeScale = 1.0;
    applyPlayerCustomization();

    p2.color = '#40c4ff'; p2.bodyColor = '#40c4ff'; p2.legsColor = '#40c4ff';
    p2.outfitType = 'normal'; p2.hasHelmet = false; p2.visorColor = '#ffffff';

    document.getElementById('p1-name-display').innerText = "PLAYER";
    document.getElementById('p1-name-display').style.color = p1.color;
    document.getElementById('p2-name-display').innerText = "CPU (練習用)";
    document.getElementById('p2-name-display').style.color = p2.color;

    titleScreen.style.display = 'none'; uiLayer.style.display = 'flex';
    streakCounterEl.style.display = 'block'; streakCounterEl.innerText = `イベント連勝: ${winStreak}`;
    Sound.playBGM('game');

    p1.reset(); p2.reset(); updateScoreUI(); updateControlsVisibility();
    showOverlay(`🔰 初心者イベント\nROUND ${currentRound}`, 1500, startRound);
}

function startRound() {
    for (let k in keys) keys[k] = false;
    timeScale = 1.0;
    p1.reset(); p2.reset();
    p1.hp = MAX_HP; p2.hp = MAX_HP;
    particles = []; slashes = []; energyBalls = [];
    youMarkerTimer = 150; updateScoreUI();

    roundTimer = ROUND_TIME_LIMIT; timerEl.innerText = roundTimer;
    roundOver = false; gameActive = true;
    updateControlsVisibility();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!roundOver && gameActive) {
            roundTimer--; timerEl.innerText = roundTimer;
            if (roundTimer <= 0) endRound(null, "TIME UP");
        }
    }, 1000);
}

function endRound(winner, reason) {
    if (roundOver) return;
    roundOver = true; clearInterval(timerInterval);
    if (winner === p1) p1Score++; else if (winner === p2) p2Score++;
    updateScoreUI();

    const isMatchFinished = (p1Score >= MAX_SCORE || p2Score >= MAX_SCORE);
    const loser = (winner === p1) ? p2 : p1;
    const message = (winner === p1) ? "PLAYER WIN" : ((winner === p2) ? "CPU WIN" : (reason || "DRAW"));

    // ★ 溜め強攻撃KOまたは波動弾KO時は大吹き飛び！
    if (winner) {
        if (winner.isHeavyAttack || winner.isSpecialAttack) {
            loser.state = 'blowaway';
            loser.vx = 0; loser.vy = -22;
        } else {
            loser.state = 'hit';
            loser.vx = 0;
        }
    }

    if (isMatchFinished && winner) {
        timeScale = 0.25;

        if (roundEndTimeout) clearTimeout(roundEndTimeout);
        roundEndTimeout = setTimeout(() => {
            timeScale = 1.0;

            if (p1Score >= MAX_SCORE) {
                winStreak++;
                playerData.gold += 2;

                let unlockMsg = "";
                if (winStreak >= 1 && !playerData.unlockedVisorColors.includes('#40c4ff')) {
                    playerData.unlockedVisorColors.push('#40c4ff');
                    unlockMsg += "\n🔷【水色バイザー】解放！";
                }
                if (winStreak >= 3 && !playerData.unlockedVisorColors.includes('#ff5252')) {
                    playerData.unlockedVisorColors.push('#ff5252');
                    unlockMsg += "\n🔥【赤色バイザー】解放！";
                }
                if (winStreak >= 5 && !playerData.unlockedVisorColors.includes('#ffd32a')) {
                    playerData.unlockedVisorColors.push('#ffd32a');
                    unlockMsg += "\n👑【金色バイザー】解放！";
                }
                savePlayerData();

                if (winStreak >= 5) {
                    showOverlay(`🎊 祝・イベント完全制覇！\n全バイザーカラー獲得！(+2G)${unlockMsg}\nおめでとうございます！`, 3500, () => {
                        location.reload();
                    });
                } else {
                    showOverlay(`🎉 VICTORY！\n${winStreak} 連勝達成！(+2G)${unlockMsg}`, 2500, () => {
                        p1Score = 0; p2Score = 0; currentRound = 1; timeScale = 1.0;
                        streakCounterEl.innerText = `イベント連勝: ${winStreak}`;
                        p1.reset(); p2.reset(); updateScoreUI();
                        showOverlay(`ROUND ${currentRound}\n(VS 練習用CPU)`, 1500, startRound);
                    });
                }
            } else {
                showOverlay(`DEFEAT...\n記録: ${winStreak}連勝`, 2500, () => location.reload());
            }
        }, 1800);
    } else {
        if (roundEndTimeout) clearTimeout(roundEndTimeout);
        roundEndTimeout = setTimeout(() => {
            p1.reset(); p2.reset(); updateScoreUI();
            showOverlay(message, 1500, () => {
                currentRound++; showOverlay(`ROUND ${currentRound}`, 1500, startRound);
            });
        }, 800);
    }
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
            endRound(attacker);
        } else {
            defender.hp = Math.max(0, defender.hp - 1);
            attacker.attackTimer = 22;
            updateScoreUI();
            Sound.playSE('hit');

            if (defender.hp <= 0) endRound(attacker);
            else {
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
    if (defender.hp <= 0) endRound(attacker);
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

    const a1 = p1.getAttackBox();
    const a2 = p2.getAttackBox();

    if (a1 && p2.state !== 'flinch' && p2.state !== 'hit' && p2.state !== 'blowaway') {
        const p2Body = { x: p2.x, y: p2.y, width: p2.width, height: p2.height };
        if (checkCollision(a1, p2Body)) {
            handleHit(p1, p2, true, p1.direction === 1 ? p2.x + 8 : p2.x + p2.width - 8, a1.y + a1.height / 2);
        }
    }

    if (a2 && p1.state !== 'flinch' && p1.state !== 'hit' && p1.state !== 'blowaway') {
        const p1Body = { x: p1.x, y: p1.y, width: p1.width, height: p1.height };
        if (checkCollision(a2, p1Body)) {
            handleHit(p2, p1, false, p2.direction === 1 ? p1.x + 8 : p1.x + p1.width - 8, a2.y + a2.height / 2);
        }
    }
}

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function updatePhysics() {
    if (youMarkerTimer > 0) youMarkerTimer -= 1 * timeScale;
    if (gameActive) {
        p1.update(p2);
        p2.update(p1);
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

    ctx.fillStyle = 'rgba(20, 25, 35, 0.9)';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    ctx.strokeStyle = '#00d2d3'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y); ctx.stroke();

    p1.draw(false); p2.draw(false);
    for (let i = 0; i < energyBalls.length; i++) energyBalls[i].draw(ctx);
    for (let i = 0; i < slashes.length; i++) slashes[i].draw(ctx);
    for (let i = 0; i < particles.length; i++) particles[i].draw(ctx);
    ctx.restore();

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);