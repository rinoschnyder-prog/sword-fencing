// ==========================================
// ★ event.js v18.1（renderer.js 完全連携版）
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

const keys = { a: false, d: false, w: false, f: false, space: false };
window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k === ' ') keys.space = true; if (k in keys) keys[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === ' ') keys.space = false; if (k in keys) keys[k] = false; });

const touchBinds = [
    { btnId: 'btn-left', key: 'a' },
    { btnId: 'btn-right', key: 'd' },
    { btnId: 'btn-jump', key: 'w' },
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
        this.flinchTimer = 0; this.breakTimer = 0;
        this.guardActive = false; this.animFrame = 0;
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

    // ★ renderer.js に描画を完全委譲！
    draw(isDarkTone) {
        if (typeof drawCharacter === 'function') {
            drawCharacter(ctx, this, {
                isDarkTone,
                isMyCharacter: (this === p1),
                youMarkerTimer,
                gameActive
            });
        }
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