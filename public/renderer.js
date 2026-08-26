// ==========================================
// ★ renderer.js v18.1（背景ローテーション＆VS対戦演出＆スキン共通描画）
// ==========================================

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

// ★ 背景ステージリスト（今後 background4.jpg などもここに追加するだけでOK）
const BACKGROUND_STAGE_LIST = [
    'background1.jpg',
    'background2.jpg',
    'background3.jpg'
];
let currentBgStageIndex = 0;

// ★ 試合ごとに背景を順番に切り替える関数
function rotateBattleBackground() {
    const canvasEl = document.getElementById('gameCanvas');
    if (!canvasEl) return;
    const bgUrl = BACKGROUND_STAGE_LIST[currentBgStageIndex];
    canvasEl.style.backgroundImage = `url('${bgUrl}')`;
    // 次回用にインデックスを1つ進める
    currentBgStageIndex = (currentBgStageIndex + 1) % BACKGROUND_STAGE_LIST.length;
}

// 格闘ゲーム風 VS画面イントロ演出
function showVsIntro(p1Char, p2Char, p1Name, p2Name, onComplete) {
    const vsScreen = document.getElementById('vs-screen');
    if (!vsScreen) {
        if (onComplete) onComplete();
        return;
    }

    const c1 = document.getElementById('vs-p1-canvas');
    const c2 = document.getElementById('vs-p2-canvas');
    const name1El = document.getElementById('vs-p1-name');
    const name2El = document.getElementById('vs-p2-name');

    if (name1El) { name1El.innerText = p1Name || "PLAYER 1"; name1El.style.color = p1Char.color || '#ff5252'; }
    if (name2El) { name2El.innerText = p2Name || "PLAYER 2"; name2El.style.color = p2Char.color || '#40c4ff'; }

    // P1立ち姿描画
    if (c1) {
        const ctx1 = c1.getContext('2d');
        ctx1.clearRect(0, 0, c1.width, c1.height);
        const dummy1 = {
            x: c1.width / 2 - 22,
            y: c1.height - 88 - 14,
            width: 44, height: 88, direction: 1,
            color: p1Char.color, bodyColor: p1Char.bodyColor, legsColor: p1Char.legsColor,
            armorBodyColor: p1Char.armorBodyColor, armorLegsColor: p1Char.armorLegsColor,
            outfitType: p1Char.outfitType, hasHelmet: p1Char.hasHelmet, helmetColor: p1Char.helmetColor,
            visorColor: p1Char.visorColor, hasCloak: p1Char.hasCloak, hasGodAura: p1Char.hasGodAura,
            state: 'idle', animFrame: 0
        };
        drawCharacter(ctx1, dummy1, { gameActive: false, isMyCharacter: false, isPreview: true });
    }

    // P2立ち姿描画 (左向き)
    if (c2) {
        const ctx2 = c2.getContext('2d');
        ctx2.clearRect(0, 0, c2.width, c2.height);
        const dummy2 = {
            x: c2.width / 2 - 22,
            y: c2.height - 88 - 14,
            width: 44, height: 88, direction: -1,
            color: p2Char.color, bodyColor: p2Char.bodyColor, legsColor: p2Char.legsColor,
            armorBodyColor: p2Char.armorBodyColor, armorLegsColor: p2Char.armorLegsColor,
            outfitType: p2Char.outfitType, hasHelmet: p2Char.hasHelmet, helmetColor: p2Char.helmetColor,
            visorColor: p2Char.visorColor, hasCloak: p2Char.hasCloak, hasGodAura: p2Char.hasGodAura,
            state: 'idle', animFrame: 0
        };
        drawCharacter(ctx2, dummy2, { gameActive: false, isMyCharacter: false, isPreview: true });
    }

    vsScreen.style.display = 'flex';
    vsScreen.classList.add('show');
    if (typeof Sound !== 'undefined') Sound.playSE('swing');

    setTimeout(() => {
        vsScreen.classList.remove('show');
        setTimeout(() => {
            vsScreen.style.display = 'none';
            if (onComplete) onComplete();
        }, 300);
    }, 2000);
}

// キャラクター描画エンジン
function drawCharacter(ctx, char, options = {}) {
    const isDarkTone = options.isDarkTone || false;
    const isMyCharacter = options.isMyCharacter || false;
    const youMarkerTimer = options.youMarkerTimer || 0;
    const gameActive = (options.gameActive !== undefined) ? options.gameActive : true;
    const isPreview = options.isPreview || false;
    const groundY = (typeof GROUND_Y !== 'undefined') ? GROUND_Y : (char.y + char.height);

    const cx = char.x + char.width / 2; 
    const cy = char.y + char.height;    

    ctx.save();
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isDarkTone) ctx.globalAlpha = 0.8;

    if (char.state !== 'blowaway') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(cx, groundY, char.state === 'hit' ? 40 : 25, 6, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    let headY = cy - 74;
    let chestY = cy - 54;
    let hipY = cy - 32;

    let leftFoot = { x: cx - 13, y: cy };
    let rightFoot = { x: cx + 13, y: cy };
    let leftHand = { x: cx - 13, y: cy - 48 };
    let rightHand = { x: cx + 13, y: cy - 48 };

    let swordStart = { x: 0, y: 0 };
    let swordEnd = { x: 0, y: 0 };

    const dir = char.direction || 1;

    if (isMyCharacter && gameActive && char.state !== 'hit' && char.state !== 'blowaway' && youMarkerTimer > 0) {
        const bob = Math.sin((char.animFrame || 0) * 0.15) * 4;
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

    if (char.state === 'charge') {
        const maxCharge = (typeof MAX_CHARGE_FRAMES !== 'undefined') ? MAX_CHARGE_FRAMES : 45;
        const isFull = (char.chargeTimer || 0) >= maxCharge;
        const flashSpeed = isFull ? 0.4 : 0.18;
        const alpha = 0.4 + Math.sin((char.animFrame || 0) * flashSpeed) * 0.4;
        ctx.shadowBlur = 28;
        ctx.shadowColor = '#ffd32a';
        if (isFull) {
            ctx.save();
            ctx.strokeStyle = `rgba(255, 211, 42, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy - 40, 44 + Math.sin((char.animFrame || 0) * 0.4) * 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    if (char.state === 'hadouken') {
        headY = cy - 68; chestY = cy - 50; hipY = cy - 30;
        leftFoot = { x: cx - dir * 18, y: cy }; rightFoot = { x: cx + dir * 22, y: cy };
        const t = char.hadouTimer || 0;
        const swordFlightY = cy - 80 - Math.sin((t / 52) * Math.PI) * 75;
        const swordFlightRot = t * 0.45;

        if (t < 24 && typeof canvas !== 'undefined') {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(-100, -100, canvas.width + 200, canvas.height + 200);
            ctx.restore();
        }

        leftHand = { x: cx + dir * 24, y: cy - 44 };
        rightHand = { x: cx + dir * 28, y: cy - 40 };

        if (t < 48) {
            ctx.save();
            ctx.translate(cx, swordFlightY);
            ctx.rotate(swordFlightRot);
            ctx.strokeStyle = '#ecf0f1';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-25, 0);
            ctx.lineTo(25, 0);
            ctx.stroke();
            ctx.restore();
        } else {
            swordStart = { x: rightHand.x, y: rightHand.y };
            swordEnd = { x: rightHand.x + dir * 45, y: rightHand.y - 20 };
        }
    }
    else if (char.state === 'blowaway') {
        headY = cy - 80; chestY = cy - 60; hipY = cy - 40;
        leftFoot = { x: cx - 10, y: cy - 10 }; rightFoot = { x: cx + 10, y: cy - 10 };
        leftHand = { x: cx - 25, y: cy - 75 }; rightHand = { x: cx + 25, y: cy - 75 };
    }
    else if (char.state === 'hit') {
        const headX = cx - dir * 35;
        headY = cy - 8;
        const bodyChestX = cx - dir * 18;
        const bodyHipX = cx;

        ctx.fillStyle = char.color;
        ctx.beginPath();
        ctx.arc(headX, headY, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = char.bodyColor;
        ctx.beginPath();
        ctx.moveTo(headX + dir * 10, headY);
        ctx.lineTo(bodyHipX, cy - 6);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(bodyChestX, cy - 6);
        ctx.lineTo(cx - dir * 10, cy - 14);
        ctx.stroke();

        ctx.strokeStyle = char.legsColor;
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
    else if (char.state === 'break') {
        headY = cy - 45; chestY = cy - 32; hipY = cy - 18;
        leftFoot = { x: cx - dir * 16, y: cy }; rightFoot = { x: cx + dir * 6, y: cy };
        leftHand = { x: cx - dir * 8, y: cy - 20 }; rightHand = { x: cx + dir * 14, y: cy - 20 };
        swordStart = { x: rightHand.x, y: rightHand.y };
        swordEnd = { x: rightHand.x + dir * 10, y: cy };
    }
    else if (char.state === 'flinch') {
        headY = cy - 70; chestY = cy - 50; hipY = cy - 30;
        leftFoot = { x: cx - dir * 18, y: cy }; rightFoot = { x: cx + dir * 6, y: cy };
        leftHand = { x: cx - dir * 18, y: cy - 60 }; rightHand = { x: cx - dir * 8, y: cy - 55 };
        swordStart = { x: rightHand.x, y: rightHand.y };
        swordEnd = { x: rightHand.x - dir * 25, y: rightHand.y - 15 };
    }
    else if (char.state === 'charge') {
        const maxCharge = (typeof MAX_CHARGE_FRAMES !== 'undefined') ? MAX_CHARGE_FRAMES : 45;
        const isFull = (char.chargeTimer || 0) >= maxCharge;
        const pullBack = Math.min(12, (char.chargeTimer || 0) * 0.3);
        const shake = isFull ? (Math.random() - 0.5) * 2.5 : 0;
        headY = cy - 66 + shake; chestY = cy - 48 + shake; hipY = cy - 28;
        leftFoot = { x: cx - dir * 20, y: cy }; rightFoot = { x: cx + dir * 16, y: cy };
        rightHand = { x: cx - dir * (20 + pullBack) + shake, y: cy - 44 + shake };
        leftHand = { x: cx + dir * 16, y: cy - 48 };
        swordStart = { x: rightHand.x, y: rightHand.y };
        swordEnd = { x: rightHand.x + dir * 55, y: rightHand.y - 4 };
    }
    else if (char.state === 'attack') {
        const progress = char.attackTimer || 0;
        const reach = (progress >= 6 && progress <= 14) ? (char.isHeavyAttack ? 52 : 38) : 16; 
        if (char.isAirAttack) {
            headY = cy - 70; chestY = cy - 52; hipY = cy - 32;
            leftFoot = { x: cx - dir * 16, y: cy - 20 }; rightFoot = { x: cx + dir * 8, y: cy - 10 };
            rightHand = { x: cx + dir * (20 + reach * 0.7), y: cy - 36 + (reach * 0.5) }; leftHand = { x: cx - dir * 18, y: cy - 60 };
            swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 52, y: rightHand.y + 40 };
        } else {
            headY = cy - 70; chestY = cy - 52; hipY = cy - 30;
            leftFoot = { x: cx - dir * 20, y: cy }; rightFoot = { x: cx + dir * 28, y: cy }; 
            rightHand = { x: cx + dir * (32 + reach), y: cy - 44 }; leftHand = { x: cx - dir * 20, y: cy - 58 }; 
            swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * (char.isHeavyAttack ? 75 : 60), y: rightHand.y };
        }
    } 
    else if (char.state === 'guard') {
        headY = cy - 72; chestY = cy - 52; hipY = cy - 30;
        leftFoot = { x: cx - dir * 9, y: cy }; rightFoot = { x: cx + dir * 9, y: cy };
        rightHand = { x: cx + dir * 16, y: cy - 54 }; leftHand = { x: cx + dir * 8, y: cy - 50 };
        swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 10, y: rightHand.y - 48 };
    } 
    else if (char.state === 'walk') {
        const cycle = Math.sin((char.animFrame || 0) * 0.25);
        leftFoot = { x: cx - 13 + (cycle * 13), y: cy }; rightFoot = { x: cx + 13 - (cycle * 13), y: cy };
        leftHand = { x: cx - 11 - (cycle * 9), y: cy - 48 }; rightHand = { x: cx + 11 + (cycle * 9), y: cy - 48 };
        swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 22, y: rightHand.y - 32 };
    } 
    else if (char.state === 'jump') {
        headY = cy - 78; chestY = cy - 58; hipY = cy - 36;
        leftFoot = { x: cx - 11, y: cy - 12 }; rightFoot = { x: cx + 11, y: cy - 16 };
        leftHand = { x: cx - 16, y: cy - 64 }; rightHand = { x: cx + 16, y: cy - 58 };
        swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 32, y: rightHand.y - 22 };
    }
    else {
        const breathe = isPreview ? 0 : (Math.sin((char.animFrame || 0) * 0.05) * 1.5);
        headY += breathe; chestY += breathe * 0.5;
        swordStart = { x: rightHand.x, y: rightHand.y }; swordEnd = { x: rightHand.x + dir * 22, y: rightHand.y - 32 };
    }

    // マント描画
    if (char.hasCloak && char.state !== 'hit') {
        const wave = isPreview ? 0 : (Math.sin((char.animFrame || 0) * 0.2) * 6);
        ctx.save();
        ctx.fillStyle = 'rgba(192, 57, 43, 0.85)';
        ctx.beginPath();
        ctx.moveTo(cx - dir * 4, chestY);
        ctx.quadraticCurveTo(cx - dir * (20 + (char.vx ? 10 : 0)), cy - 30 + wave, cx - dir * (28 + (char.vx ? 12 : 0)), cy - 10 + wave * 1.2);
        ctx.lineTo(cx - dir * 16, cy - 8 + wave * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // ゴッドオーラ
    if (char.hasGodAura) {
        ctx.save();
        ctx.fillStyle = '#ffd32a';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffd32a';
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(cx + (Math.sin((isPreview ? (i * 1.5) : (Date.now() * 0.005)) + i) * 16), cy - 20 - (i * 12), 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 頭部素体
    ctx.fillStyle = char.color;
    ctx.beginPath();
    ctx.arc(cx, headY, 11, 0, Math.PI * 2);
    ctx.fill();

    // 兜（フルヘルム）
    if (char.hasHelmet && char.state !== 'hit') {
        const hColor = char.helmetColor || '#ff5252';
        const hLight = adjustColor(hColor, 0.55);

        ctx.save();
        ctx.fillStyle = hColor;
        ctx.strokeStyle = hLight;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, headY - 1, 12.5, Math.PI * 0.75, Math.PI * 2.25);
        ctx.lineTo(cx + dir * 11, headY + 6);
        ctx.lineTo(cx - dir * 11, headY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

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
    const vColor = char.visorColor || '#ffffff';
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

    // 下半身
    ctx.save();
    ctx.strokeStyle = char.legsColor;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(cx, hipY);
    ctx.lineTo(leftFoot.x, leftFoot.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, hipY);
    ctx.lineTo(rightFoot.x, rightFoot.y);
    ctx.stroke();

    // 鎧（下半身）
    if (char.outfitType === 'armor') {
        const aLegLight = adjustColor(char.armorLegsColor, 0.55);
        const aLegDark = adjustColor(char.armorLegsColor, -0.45);

        [leftFoot, rightFoot].forEach((foot) => {
            const kneeX = (cx + foot.x) / 2;
            const kneeY = (hipY + foot.y) / 2;

            ctx.save();
            const shinGrad = ctx.createLinearGradient(kneeX, kneeY, foot.x, foot.y);
            shinGrad.addColorStop(0, aLegLight);
            shinGrad.addColorStop(0.5, char.armorLegsColor);
            shinGrad.addColorStop(1, aLegDark);

            ctx.strokeStyle = shinGrad;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(kneeX, kneeY);
            ctx.lineTo(foot.x, foot.y);
            ctx.stroke();

            // 菱形ニーガード
            ctx.fillStyle = aLegLight;
            ctx.strokeStyle = aLegLight;
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
    if (char.outfitType === 'armor') {
        const aBodyLight = adjustColor(char.armorBodyColor, 0.55);
        const aBodyDark = adjustColor(char.armorBodyColor, -0.5);

        ctx.save();
        ctx.strokeStyle = char.bodyColor;
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(cx, headY + 11);
        ctx.lineTo(cx, hipY);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = char.bodyColor;
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
            ctx.fillStyle = char.armorBodyColor;
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
        chestGrad.addColorStop(0.45, char.armorBodyColor);
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

        ctx.fillStyle = aBodyLight;
        ctx.beginPath();
        ctx.arc(cx, chestY + 6, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = char.armorBodyColor;
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
            spGrad.addColorStop(1, char.armorBodyColor);
            ctx.fillStyle = spGrad;
            ctx.strokeStyle = aBodyLight;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.ellipse(spX, spY, 7, 5, side * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
        ctx.restore();

    } else {
        ctx.strokeStyle = char.bodyColor;
        ctx.beginPath();
        ctx.moveTo(cx, headY + 11);
        ctx.lineTo(cx, hipY);
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = char.bodyColor;
        ctx.beginPath();
        ctx.ellipse(cx, (chestY + hipY) / 2, 7, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = char.bodyColor;
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
    if (char.state !== 'blowaway' && (char.state !== 'hadouken' || (char.hadouTimer || 0) >= 48)) {
        ctx.save();
        ctx.strokeStyle = char.isHeavyAttack ? '#ffd32a' : '#ecf0f1'; 
        ctx.lineWidth = char.isHeavyAttack ? 4.5 : 3.8;
        ctx.beginPath();
        ctx.moveTo(swordStart.x, swordStart.y);
        ctx.lineTo(swordEnd.x, swordEnd.y);
        ctx.stroke();

        ctx.strokeStyle = '#ffd32a';
        ctx.lineWidth = 5;
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

    if (char.state === 'guard') {
        ctx.strokeStyle = 'rgba(255, 211, 42, 0.45)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx + dir * 20, cy - 44, 25, -Math.PI/2, Math.PI/2, dir === -1);
        ctx.stroke();
    }

    ctx.restore();
}