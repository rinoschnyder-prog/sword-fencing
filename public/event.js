// ==========================================
// ★ event.js（イベント専用CPU・バイザー解放処理）
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
    }
});

class Character {
    constructor(color, isCPU) {
        this.width = 44; this.height = 88;
        this.color = color; this.bodyColor = color; this.legsColor = color;
        this.armorBodyColor = color; this.armorLegsColor = color;
        this.outfitType = 'normal'; this.visorType = 'none';
        this.hasCloak = false; this.hasGodAura = false;
        this.isCPU = isCPU; this.startX = 0; this.startY = 0; this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0; this.hp = MAX_HP; this.sp = 0;
        this.direction = isCPU ? -1 : 1; this.isGrounded = true; this.state = 'idle';
        this.isAirAttack = false; this.isHeavyAttack = false; this.isSpecialAttack = false;
        this.hadouTimer = 0; this.chargeTimer = 0; this.attackTimer = 0; this.attackCooldown = 0;
        this.flinchTimer = 0; this.breakTimer = 0; this.guardActive = false; this.animFrame = 0;
        this.cpuActionTimer = 0; this.cpuDecision = 'idle';
    }

    reset() {
        this.x = this.startX; this.y = GROUND_Y - this.height; this.vx = 0; this.vy = 0;
        this.hp = MAX_HP; this.sp = 0; this.state = 'idle';
        this.isAirAttack = false; this.isHeavyAttack = false; this.isSpecialAttack = false;
        this.hadouTimer = 0; this.chargeTimer = 0; this.attackTimer = 0; this.attackCooldown = 0;
        this.flinchTimer = 0; this.breakTimer = 0; this.guardActive = false; this.isGrounded = true;
    }

    addSP(amount) {
        this.sp = Math.min(MAX_SP, this.sp + amount);
        updateScoreUI();
    }

    update(opponent) {
        this.animFrame += 1 * timeScale;
        if (!this.isGrounded) this.vy += GRAVITY * timeScale;

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
                this.attackCooldown = 14;
            }
        }

        if (this.attackCooldown > 0) this.attackCooldown -= 1 * timeScale;

        if (this.state !== 'hit' && this.state !== 'flinch' && this.state !== 'break' && !roundOver) {
            if (this.isCPU) this.updateEventCPU(opponent);
            else this.updatePlayer();
        }

        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;

        if (this.y + this.height >= GROUND_Y) {
            this.y = GROUND_Y - this.height;
            this.vy = 0;
            this.isGrounded = true;
            if (this.state === 'jump') this.state = 'idle';
        } else {
            this.isGrounded = false;
        }

        if (this.x < 12) this.x = 12;
        if (this.x + this.width > canvas.width - 12) this.x = canvas.width - this.width - 12;

        if (this.state !== 'attack' && this.state !== 'hit' && !roundOver) {
            this.direction = (opponent.x > this.x) ? 1 : -1;
        }
    }

    updatePlayer() {
        this.vx = 0;
        if (keys.space && this.sp >= MAX_SP && this.isGrounded && this.state !== 'attack') {
            this.state = 'attack';
            this.isHeavyAttack = true;
            this.sp = 0;
            updateScoreUI();
            Sound.playSE('swing');
            return;
        }

        if (this.state === 'charge') {
            if (keys.f) { this.chargeTimer++; return; }
            else {
                this.state = 'attack';
                this.isHeavyAttack = (this.chargeTimer >= MAX_CHARGE_FRAMES);
                this.attackTimer = 0;
                this.chargeTimer = 0;
                Sound.playSE('swing');
                return;
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

        if (keys.f && this.attackCooldown <= 0 && this.state !== 'attack') {
            if (this.isGrounded) {
                this.state = 'charge';
                this.chargeTimer = 0;
                return;
            } else {
                this.state = 'attack';
                this.isAirAttack = true;
                this.attackTimer = 0;
                Sound.playSE('swing');
                return;
            }
        }

        if (this.state !== 'attack' && this.state !== 'charge') {
            if (keys.a) { this.vx = -4.5; this.state = this.isGrounded ? 'walk' : this.state; }
            else if (keys.d) { this.vx = 4.5; this.state = this.isGrounded ? 'walk' : this.state; }
            else if (this.isGrounded && this.state === 'walk') this.state = 'idle';

            if (keys.w && this.isGrounded) { this.vy = -12.5; this.isGrounded = false; this.state = 'jump'; }
        }
    }

    // ★ イベント専用CPU思考ルーチン（適度な強さ・初級〜中級）
    updateEventCPU(opponent) {
        const distance = Math.abs((this.x + this.width / 2) - (opponent.x + opponent.width / 2));
        const isNearWall = (this.x <= 40 || this.x >= canvas.width - 80);

        if (this.state === 'charge') {
            this.chargeTimer++;
            if (this.chargeTimer >= MAX_CHARGE_FRAMES) {
                this.state = 'attack';
                this.isHeavyAttack = true;
                this.attackTimer = 0;
                this.chargeTimer = 0;
                Sound.playSE('swing');
            }
            return;
        }

        if (this.state === 'attack') return;

        this.cpuActionTimer--;
        if (this.cpuActionTimer <= 0) {
            this.cpuActionTimer = 11 + Math.random() * 7;
            const rand = Math.random();

            if (opponent.state === 'attack' && distance < 130) {
                if (rand < 0.40) this.cpuDecision = 'guard';
                else if (rand < 0.60 && !isNearWall) this.cpuDecision = 'backstep';
                else this.cpuDecision = 'idle';
            } else if (distance < 115) {
                if (rand < 0.45 && this.attackCooldown <= 0) this.cpuDecision = 'attack';
                else if (rand < 0.65 && !isNearWall) this.cpuDecision = 'backstep';
                else if (rand < 0.85 && this.isGrounded) this.cpuDecision = 'jump_forward';
                else if (rand < 0.95 && this.isGrounded && this.attackCooldown <= 0) this.cpuDecision = 'charge';
                else this.cpuDecision = 'idle';
            } else {
                if (rand < 0.70) this.cpuDecision = 'approach';
                else if (rand < 0.90 && this.isGrounded) this.cpuDecision = 'jump_forward';
                else this.cpuDecision = 'idle';
            }
        }

        this.guardActive = false;
        if (this.state === 'guard') this.state = 'idle';

        if (this.cpuDecision === 'approach') {
            this.vx = (opponent.x < this.x) ? -3.6 : 3.6;
            if (this.isGrounded) this.state = 'walk';
        } else if (this.cpuDecision === 'backstep') {
            this.vx = (opponent.x < this.x) ? 4.0 : -4.0;
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
            this.vy = -12.5;
            this.vx = (opponent.x < this.x) ? -3.8 : 3.8;
            this.isGrounded = false;
            this.state = 'jump';
            this.cpuDecision = 'idle';
        }
    }

    getAttackBox() {
        if (this.state !== 'attack' || this.attackTimer < 6 || this.attackTimer > 14) return null;
        const boxWidth = this.isHeavyAttack ? 85 : 70;
        const boxHeight = 16;
        const x = (this.direction === 1) ? (this.x + this.width) : (this.x - boxWidth);
        return { x, y: this.y + 38, width: boxWidth, height: boxHeight };
    }

    draw(isDarkTone) {
        const cx = this.x + this.width / 2; 
        const cy = this.y + this.height;    
        ctx.save();
        ctx.lineWidth = 5.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        let headY = cy - 74; let chestY = cy - 54; let hipY = cy - 32;
        let leftFoot = { x: cx - 13, y: cy }; let rightFoot = { x: cx + 13, y: cy };
        let leftHand = { x: cx - 13, y: cy - 48 }; let rightHand = { x: cx + 13, y: cy - 48 };
        let swordStart = { x: 0, y: 0 }; let swordEnd = { x: 0, y: 0 };
        const dir = this.direction;

        // 頭部
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(cx, headY, 11, 0, Math.PI * 2); ctx.fill();

        // ★ バイザー描画
        ctx.save();
        const v = this.visorType || 'none';
        if (v === 'cyber') {
            ctx.strokeStyle = '#00d2d3'; ctx.lineWidth = 3.5; ctx.shadowBlur = 8; ctx.shadowColor = '#00d2d3';
            ctx.beginPath(); ctx.moveTo(cx - dir * 4, headY - 1); ctx.lineTo(cx + dir * 12, headY - 1); ctx.stroke();
        } else if (v === 'flame') {
            ctx.strokeStyle = '#ff4757'; ctx.lineWidth = 4; ctx.shadowBlur = 10; ctx.shadowColor = '#ff4757';
            ctx.beginPath(); ctx.moveTo(cx - dir * 2, headY - 2); ctx.lineTo(cx + dir * 13, headY); ctx.stroke();
        } else if (v === 'crown') {
            ctx.strokeStyle = '#ffd32a'; ctx.lineWidth = 3.2; ctx.shadowBlur = 10; ctx.shadowColor = '#ffd32a';
            ctx.beginPath(); ctx.arc(cx, headY - 7, 7.5, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, headY - 1); ctx.lineTo(cx + dir * 11, headY - 1); ctx.stroke();
        } else {
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(cx + dir * 2, headY - 1); ctx.lineTo(cx + dir * 10, headY - 1); ctx.stroke();
        }
        ctx.restore();

        // 脚
        ctx.save();
        ctx.strokeStyle = this.legsColor; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(leftFoot.x, leftFoot.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(rightFoot.x, rightFoot.y); ctx.stroke();

        if (this.outfitType === 'armor') {
            const aLegLight = adjustColor(this.armorLegsColor, 0.45);
            [leftFoot, rightFoot].forEach((foot) => {
                const kneeX = (cx + foot.x) / 2; const kneeY = (hipY + foot.y) / 2;
                ctx.strokeStyle = this.armorLegsColor; ctx.lineWidth = 7.5;
                ctx.beginPath(); ctx.moveTo(kneeX, kneeY); ctx.lineTo(foot.x, foot.y); ctx.stroke();
                ctx.fillStyle = '#ecf0f1';
                ctx.beginPath(); ctx.ellipse(foot.x + dir * 2, foot.y - 1, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
            });
        }
        ctx.restore();

        // 胴体＆腕
        if (this.outfitType === 'armor') {
            ctx.save();
            ctx.strokeStyle = this.bodyColor; ctx.lineWidth = 5.5;
            ctx.beginPath(); ctx.moveTo(cx, headY + 11); ctx.lineTo(cx, hipY); ctx.stroke();
            ctx.fillStyle = this.armorBodyColor;
            ctx.beginPath(); ctx.ellipse(cx, (chestY + hipY) / 2, 11, 15, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffd32a'; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.arc(cx - dir * 7, chestY - 2, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx + dir * 7, chestY - 2, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.restore();
        } else {
            ctx.strokeStyle = this.bodyColor;
            ctx.beginPath(); ctx.moveTo(cx, headY + 11); ctx.lineTo(cx, hipY); ctx.stroke();
            ctx.save(); ctx.fillStyle = this.bodyColor;
            ctx.beginPath(); ctx.ellipse(cx, (chestY + hipY) / 2, 7, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }

        // 腕
        ctx.save();
        ctx.strokeStyle = this.bodyColor; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(cx, chestY); ctx.lineTo(leftHand.x, leftHand.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, chestY); ctx.lineTo(rightHand.x, rightHand.y); ctx.stroke();
        ctx.restore();

        // 剣
        if (this.state === 'attack') {
            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * (this.isHeavyAttack ? 75 : 60), y: rightHand.y };
        } else {
            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 22, y: rightHand.y - 32 };
        }
        ctx.save();
        ctx.strokeStyle = this.isHeavyAttack ? '#ffd32a' : '#ecf0f1'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(swordStart.x, swordStart.y); ctx.lineTo(swordEnd.x, swordEnd.y); ctx.stroke();
        ctx.restore();

        ctx.restore();
    }
}

const p1 = new Character('#ff5252', false);
const p2 = new Character('#40c4ff', true);
resizeCanvas();

function applyPlayerCustomization() {
    p1.outfitType = playerData.outfitType || 'normal';
    p1.visorType = playerData.equippedVisor || 'none';
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
    const p1Dots = document.querySelectorAll('#p1-score .dot'); const p2Dots = document.querySelectorAll('#p2-score .dot');
    p1Dots.forEach((d, i) => d.classList.toggle('active', i < p1Score));
    p2Dots.forEach((d, i) => d.classList.toggle('active', i < p2Score));
}

function showOverlay(t, d = 1500, cb) {
    overlayTextEl.innerText = t; gameOverlay.classList.add('show');
    if (overlayTimeout) clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => { gameOverlay.classList.remove('show'); if (cb) cb(); }, d);
}

// ★ イベントバトル開始
function startEventBattle() {
    winStreak = 0; p1Score = 0; p2Score = 0; currentRound = 1; timeScale = 1.0;
    applyPlayerCustomization();

    p2.color = '#40c4ff'; p2.bodyColor = '#40c4ff'; p2.legsColor = '#40c4ff';
    p2.outfitType = 'normal'; p2.visorType = 'none';

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
    p1.reset(); p2.reset();
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

    if (p1Score >= MAX_SCORE || p2Score >= MAX_SCORE) {
        if (p1Score >= MAX_SCORE) {
            winStreak++;
            playerData.gold += 2; // イベント勝利ボーナス 2G

            let unlockMsg = "";
            if (winStreak >= 1 && !playerData.unlockedVisors.includes('cyber')) {
                playerData.unlockedVisors.push('cyber');
                unlockMsg += "\n🔷【サイバー・アイ】解放！";
            }
            if (winStreak >= 3 && !playerData.unlockedVisors.includes('flame')) {
                playerData.unlockedVisors.push('flame');
                unlockMsg += "\n🔥【フレイム・ブレイズ】解放！";
            }
            if (winStreak >= 5 && !playerData.unlockedVisors.includes('crown')) {
                playerData.unlockedVisors.push('crown');
                unlockMsg += "\n👑【ゴッド・クラウン】解放！";
            }
            savePlayerData();

            showOverlay(`🎉 VICTORY！\n${winStreak} 連勝達成！(+2G)${unlockMsg}`, 2500, () => {
                p1Score = 0; p2Score = 0; currentRound = 1;
                streakCounterEl.innerText = `イベント連勝: ${winStreak}`;
                showOverlay(`ROUND ${currentRound}\n(VS 練習用CPU)`, 1500, startRound);
            });
        } else {
            showOverlay(`DEFEAT...\n記録: ${winStreak}連勝`, 2500, () => location.reload());
        }
    } else {
        setTimeout(() => {
            p1.reset(); p2.reset(); updateScoreUI();
            currentRound++; showOverlay(`ROUND ${currentRound}`, 1500, startRound);
        }, 1000);
    }
}

function checkHits() {
    if (roundOver) return;
    const a1 = p1.getAttackBox();
    const a2 = p2.getAttackBox();

    if (a1 && p2.state !== 'flinch' && p2.state !== 'hit') {
        if (a1.x < p2.x + p2.width && a1.x + a1.width > p2.x && a1.y < p2.y + p2.height && a1.y + a1.height > p2.y) {
            p2.hp = Math.max(0, p2.hp - 1);
            p1.attackTimer = 22;
            triggerHitEffect(p2.x + 20, p2.y + 40, p1.isHeavyAttack, false);
            Sound.playSE('hit');
            updateScoreUI();
            if (p2.hp <= 0) endRound(p1);
            else { p2.state = 'flinch'; p2.flinchTimer = 16; p2.vx = p1.direction * 6; }
        }
    }

    if (a2 && p1.state !== 'flinch' && p1.state !== 'hit') {
        if (a2.x < p1.x + p1.width && a2.x + a2.width > p1.x && a2.y < p1.y + p1.height && a2.y + a2.height > p1.y) {
            p1.hp = Math.max(0, p1.hp - 1);
            p2.attackTimer = 22;
            triggerHitEffect(p1.x + 20, p1.y + 40, false, false);
            Sound.playSE('hit');
            updateScoreUI();
            if (p1.hp <= 0) endRound(p2);
            else { p1.state = 'flinch'; p1.flinchTimer = 16; p1.vx = p2.direction * 6; }
        }
    }
}

function gameLoop(currentTime = performance.now()) {
    const delta = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    accumulator += Math.min(delta, 100);

    while (accumulator >= STEP) {
        if (gameActive) { p1.update(p2); p2.update(p1); checkHits(); }
        for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(); if (particles[i].life <= 0) particles.splice(i, 1); }
        accumulator -= STEP;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(20, 25, 35, 0.9)';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    ctx.strokeStyle = '#00d2d3'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y); ctx.stroke();

    p1.draw(false); p2.draw(false);
    for (let i = 0; i < particles.length; i++) particles[i].draw(ctx);

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);