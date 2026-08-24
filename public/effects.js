// ==========================================
// ★ effects.js（エフェクト・パーティクル・波動拳）
// ==========================================

let particles = [];
let slashes = [];
let energyBalls = [];

class EnergyBall {
    constructor(x, y, dir, color, ownerNum) {
        this.x = x;
        this.y = y;
        this.vx = dir * 6.5;
        this.radius = 22;
        this.color = color;
        this.ownerNum = ownerNum;
        this.life = 70;
    }
    update() {
        this.x += this.vx * (typeof timeScale !== 'undefined' ? timeScale : 1.0);
        this.life -= 1 * (typeof timeScale !== 'undefined' ? timeScale : 1.0);
        if (Math.random() < 0.6) {
            particles.push(new Particle(
                this.x - this.vx * 0.5,
                this.y + (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                this.color,
                4,
                12
            ));
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 25;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

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
        this.x += this.vx * (typeof timeScale !== 'undefined' ? timeScale : 1.0);
        this.y += this.vy * (typeof timeScale !== 'undefined' ? timeScale : 1.0);
        this.vy += 0.2 * (typeof timeScale !== 'undefined' ? timeScale : 1.0);
        this.life -= 1 * (typeof timeScale !== 'undefined' ? timeScale : 1.0);
    }
    draw(ctx) {
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
    update() { this.life -= 1 * (typeof timeScale !== 'undefined' ? timeScale : 1.0); }
    draw(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);
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
            particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, '#ffd32a', 3, 15));
        }
        if (typeof screenShakeTimer !== 'undefined') {
            screenShakeTimer = 4;
            screenShakeIntensity = 2.5;
        }
    } else {
        const count = isHeavy ? 35 : 18;
        const color = isHeavy ? '#ffd32a' : '#ff3838';
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (isHeavy ? 4 : 2.5) + Math.random() * (isHeavy ? 9 : 6);
            particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, Math.random() > 0.3 ? color : '#ffffff', (isHeavy ? 4 : 2.5), 18));
        }
        const slashAngle = (Math.random() - 0.5) * 0.8;
        slashes.push(new SlashEffect(x, y, slashAngle, isHeavy ? 100 : 65, color, isHeavy));
        if (typeof screenShakeTimer !== 'undefined') {
            screenShakeTimer = 16;
            screenShakeIntensity = 9;
        }
    }
}