// ==========================================
// ★ shop.js v17.0（通算30勝・兜システム＆リアルタイムプレビュー）
// ==========================================

const BASE_COLOR_PRICE = 15;
const PRICE_INCREMENT = 5;

// ★ 兜専用価格（初期50G、1つごとに+20G）
const HELMET_BASE_PRICE = 50;
const HELMET_PRICE_INCREMENT = 20;

const PALETTE = [
    '#ff5252', '#40c4ff', '#2ecc71', '#9b59b6', '#e67e22',
    '#ffd32a', '#1abc9c', '#e056fd', '#f5f6fa', '#2c3e50'
];
const CPU_COLORS = PALETTE;

let currentBetTarget = 1;
let currentBetAmount = 1;

let playerData = {
    gold: 5,
    totalCpuWins: 0,
    outfitType: 'normal',
    normalBodyColor: '#ff5252',
    normalLegsColor: '#ff5252',
    armorBodyColor: '#ff5252',
    armorLegsColor: '#ff5252',
    unlockedBodyColors: ['#ff5252'],
    unlockedLegsColors: ['#ff5252'],
    unlockedArmorBodyColors: ['#ff5252'],
    unlockedArmorLegsColors: ['#ff5252'],
    // ★ 兜（ヘルメット）データ
    hasHelmet: false,
    helmetColor: '#ff5252',
    unlockedHelmetColors: ['#ff5252'],
    hasCloak: false,
    hasGodAura: false,
    visorColor: '#ffffff',
    unlockedVisorColors: ['#ffffff'],
    lastLoginTimestamp: 0
};

function loadPlayerData() {
    const saved = localStorage.getItem('fencing_player_data');
    if (saved) {
        try {
            playerData = { ...playerData, ...JSON.parse(saved) };
            if (!playerData.unlockedBodyColors) playerData.unlockedBodyColors = ['#ff5252'];
            if (!playerData.unlockedLegsColors) playerData.unlockedLegsColors = ['#ff5252'];
            if (!playerData.unlockedArmorBodyColors) playerData.unlockedArmorBodyColors = ['#ff5252'];
            if (!playerData.unlockedArmorLegsColors) playerData.unlockedArmorLegsColors = ['#ff5252'];
            if (!playerData.unlockedHelmetColors) playerData.unlockedHelmetColors = ['#ff5252'];
            if (!playerData.unlockedVisorColors) playerData.unlockedVisorColors = ['#ffffff'];
        } catch (e) {}
    }

    const eventMaxStreak = Number(localStorage.getItem('fencing_event_max_streak') || 0);
    if ((eventMaxStreak >= 1 || (playerData.unlockedVisors && playerData.unlockedVisors.includes('cyber'))) && !playerData.unlockedVisorColors.includes('#40c4ff')) {
        playerData.unlockedVisorColors.push('#40c4ff');
    }
    if ((eventMaxStreak >= 3 || (playerData.unlockedVisors && playerData.unlockedVisors.includes('flame'))) && !playerData.unlockedVisorColors.includes('#ff5252')) {
        playerData.unlockedVisorColors.push('#ff5252');
    }
    if ((eventMaxStreak >= 5 || (playerData.unlockedVisors && playerData.unlockedVisors.includes('crown'))) && !playerData.unlockedVisorColors.includes('#ffd32a')) {
        playerData.unlockedVisorColors.push('#ffd32a');
    }

    const records = JSON.parse(localStorage.getItem('fencing_ranking')) || [];
    const rankWinsSum = records.reduce((sum, r) => sum + (Number(r.streak) || 0), 0);
    if (rankWinsSum > (playerData.totalCpuWins || 0)) {
        playerData.totalCpuWins = rankWinsSum;
        localStorage.setItem('fencing_player_data', JSON.stringify(playerData));
    }

    updateGoldUI();
    startDailyLoginTimer();
    if (typeof applyPlayerCustomization === 'function') {
        applyPlayerCustomization();
    }
}

function savePlayerData() {
    localStorage.setItem('fencing_player_data', JSON.stringify(playerData));
    updateGoldUI();
    if (typeof applyPlayerCustomization === 'function') {
        applyPlayerCustomization();
    }
    renderShopPreview();
}

function updateGoldUI() {
    const goldDisplay = document.getElementById('gold-amount');
    if (goldDisplay) goldDisplay.innerText = playerData.gold;
    document.querySelectorAll('.current-gold-span').forEach(el => el.innerText = playerData.gold);
}

function getCurrentColorPrice(unlockedList) {
    const purchasedCount = Math.max(0, unlockedList.length - 1);
    return BASE_COLOR_PRICE + (purchasedCount * PRICE_INCREMENT);
}

function getCurrentHelmetPrice(unlockedList) {
    const purchasedCount = Math.max(0, unlockedList.length - 1);
    return HELMET_BASE_PRICE + (purchasedCount * HELMET_PRICE_INCREMENT);
}

function resetAllPlayerData() {
    if (confirm("⚠️ セーブデータを完全に初期化しますか？\n（所持金、スキン、連勝記録がすべて初期状態に戻ります）")) {
        localStorage.removeItem('fencing_player_data');
        localStorage.removeItem('fencing_ranking');
        localStorage.removeItem('fencing_first_login_time');
        localStorage.removeItem('fencing_event_visor_data');
        localStorage.removeItem('fencing_event_max_streak');
        alert("データを完全にリセットしました！");
        location.reload();
    }
}

function debugAddGold() {
    playerData.gold += 10;
    playerData.totalCpuWins = Math.max(playerData.totalCpuWins || 0, 30);
    playerData.outfitType = 'armor';
    playerData.hasHelmet = true;
    playerData.unlockedVisorColors = ['#ffffff', '#40c4ff', '#ff5252', '#ffd32a'];
    savePlayerData();

    const records = JSON.parse(localStorage.getItem('fencing_ranking')) || [];
    if (!records.some(r => r.streak >= 100)) {
        records.push({ name: 'MASTER', streak: 100 });
        records.sort((a, b) => b.streak - a.streak);
        if (records.length > 3) records.length = 3;
        localStorage.setItem('fencing_ranking', JSON.stringify(records));
        updateRankingUI();
    }

    renderShopUI();
    if (typeof Sound !== 'undefined') Sound.playSE('bom');
}

let loginTimerInterval = null;
function startDailyLoginTimer() {
    if (loginTimerInterval) clearInterval(loginTimerInterval);
    updateLoginBonusUI();
    loginTimerInterval = setInterval(updateLoginBonusUI, 1000);
}

function updateLoginBonusUI() {
    const dailyLoginBtn = document.getElementById('daily-login-btn');
    if (!dailyLoginBtn) return;

    const now = Date.now();
    const lastTime = Number(playerData.lastLoginTimestamp) || 0;
    const cooldownMs = 24 * 60 * 60 * 1000;
    const remainingMs = cooldownMs - (now - lastTime);

    if (remainingMs <= 0) {
        dailyLoginBtn.classList.remove('claimed');
        dailyLoginBtn.innerText = "🎁 ログインボーナス！";
    } else {
        dailyLoginBtn.classList.add('claimed');
        const totalSec = Math.floor(remainingMs / 1000);
        const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
        const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        const secs = String(totalSec % 60).padStart(2, '0');
        dailyLoginBtn.innerText = `⏳ 次回まで ${hrs}:${mins}:${secs}`;
    }
}

function claimDailyLoginBonus() {
    const now = Date.now();
    const lastTime = Number(playerData.lastLoginTimestamp) || 0;
    const cooldownMs = 24 * 60 * 60 * 1000;

    if (now - lastTime < cooldownMs) {
        alert("まだ受け取れません！\n24時間のカウントダウンが終了するまでお待ちください。");
        return;
    }

    const bonus = Math.floor(Math.random() * 5) + 1;
    playerData.gold += bonus;
    playerData.lastLoginTimestamp = now;
    savePlayerData();

    Sound.playSE('bom');
    updateLoginBonusUI();
    alert(`🎉 ログインボーナス獲得！\n+${bonus} G を手に入れた！\n(現在の所持金: ${playerData.gold} G)`);
}

function openBetModal() {
    currentBetTarget = 1;
    currentBetAmount = Math.min(1, playerData.gold);
    
    if (typeof generateRandomCpuSkin === 'function') {
        window.watchCpuSkin1 = generateRandomCpuSkin();
        window.watchCpuSkin2 = generateRandomCpuSkin(window.watchCpuSkin1.color);

        const colorBox1 = document.getElementById('bet-p1-color-box');
        if (colorBox1) colorBox1.style.color = window.watchCpuSkin1.color;

        const colorBox2 = document.getElementById('bet-p2-color-box');
        if (colorBox2) colorBox2.style.color = window.watchCpuSkin2.color;
    }

    updateBetModalUI();
    document.getElementById('bet-screen').style.display = 'flex';
}

function closeBetModal() {
    document.getElementById('bet-screen').style.display = 'none';
}

function setBetTarget(targetNum) {
    currentBetTarget = targetNum;
    document.getElementById('bet-pick-p1').classList.toggle('active', targetNum === 1);
    document.getElementById('bet-pick-p2').classList.toggle('active', targetNum === 2);
}

function setBetAmount(amount) {
    if (amount === 'all') {
        currentBetAmount = playerData.gold;
    } else {
        currentBetAmount = Math.min(amount, playerData.gold);
    }
    updateBetModalUI();
}

function updateBetModalUI() {
    updateGoldUI();
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.includes(`${currentBetAmount} G`) || (currentBetAmount === playerData.gold && btn.innerText.includes('ALL'))) {
            btn.classList.add('active');
        }
    });
}

function confirmAndStartBetMatch() {
    if (currentBetAmount > playerData.gold) {
        alert("ゴールドが足りません！");
        return;
    }

    if (currentBetAmount > 0) {
        playerData.gold -= currentBetAmount;
        savePlayerData();
    }

    closeBetModal();
    if (typeof startWatchMode === 'function') {
        startWatchMode();
    }
}

function openShopModal() {
    document.getElementById('shop-screen').style.display = 'flex';
    renderShopUI();
    renderShopPreview();
}

function closeShopModal() {
    document.getElementById('shop-screen').style.display = 'none';
    savePlayerData();
    if (typeof applyPlayerCustomization === 'function') {
        applyPlayerCustomization();
    }
}

function switchShopTab(tab) {
    document.getElementById('tab-normal').style.display = (tab === 'normal') ? 'block' : 'none';
    document.getElementById('tab-armor').style.display = (tab === 'armor') ? 'block' : 'none';
    document.getElementById('tab-visor').style.display = (tab === 'visor') ? 'block' : 'none';
    document.getElementById('tab-accessory').style.display = (tab === 'accessory') ? 'block' : 'none';
    
    document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', 
            (tab === 'normal' && idx === 0) || 
            (tab === 'armor' && idx === 1) || 
            (tab === 'visor' && idx === 2) || 
            (tab === 'accessory' && idx === 3)
        );
    });

    renderShopUI();
    renderShopPreview();
}

function toggleArmorEquip(equip) {
    const isArmorUnlocked = (playerData.totalCpuWins || 0) >= 10;
    if (equip && !isArmorUnlocked) {
        alert(`鎧は【CPU戦で通算10勝】すると解放されます！（現在: ${playerData.totalCpuWins || 0}/10勝）`);
        return;
    }
    playerData.outfitType = equip ? 'armor' : 'normal';
    savePlayerData();
    renderShopUI();
    renderShopPreview();
}

// ★ 兜の着脱関数
function toggleHelmetEquip(equip) {
    const isHelmetUnlocked = (playerData.totalCpuWins || 0) >= 30;
    if (equip && !isHelmetUnlocked) {
        alert(`兜は【CPU戦で通算30勝】すると解放されます！（現在: ${playerData.totalCpuWins || 0}/30勝）`);
        return;
    }
    playerData.hasHelmet = equip;
    savePlayerData();
    renderShopUI();
    renderShopPreview();
}

function adjustPreviewColor(hex, lum) {
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

// ★ リアルタイム・スキンプレビュー（兜・鎧・バイザー・マント・オーラ完全描画）
function renderShopPreview() {
    const pCanvas = document.getElementById('shop-preview-canvas');
    if (!pCanvas) return;
    const pCtx = pCanvas.getContext('2d');
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);

    const cx = pCanvas.width / 2;
    const cy = pCanvas.height - 14;

    pCtx.save();
    pCtx.lineWidth = 4.5;
    pCtx.lineCap = 'round';
    pCtx.lineJoin = 'round';

    // 影
    pCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    pCtx.beginPath();
    pCtx.ellipse(cx, cy + 2, 22, 5, 0, 0, Math.PI * 2);
    pCtx.fill();

    const headY = cy - 64;
    const chestY = cy - 46;
    const hipY = cy - 28;

    const leftFoot = { x: cx - 10, y: cy };
    const rightFoot = { x: cx + 10, y: cy };
    const leftHand = { x: cx - 10, y: cy - 40 };
    const rightHand = { x: cx + 10, y: cy - 40 };

    // マント
    if (playerData.hasCloak) {
        pCtx.fillStyle = 'rgba(192, 57, 43, 0.85)';
        pCtx.beginPath();
        pCtx.moveTo(cx - 4, chestY);
        pCtx.quadraticCurveTo(cx - 20, cy - 25, cx - 24, cy - 8);
        pCtx.lineTo(cx - 12, cy - 6);
        pCtx.closePath();
        pCtx.fill();
    }

    // ゴッドオーラ
    if (playerData.hasGodAura) {
        pCtx.fillStyle = '#ffd32a';
        pCtx.shadowBlur = 6;
        pCtx.shadowColor = '#ffd32a';
        for (let i = 0; i < 4; i++) {
            pCtx.beginPath();
            pCtx.arc(cx + (Math.sin(Date.now() * 0.005 + i) * 16), cy - 20 - (i * 12), 2.5, 0, Math.PI * 2);
            pCtx.fill();
        }
    }

    // 頭部
    pCtx.fillStyle = playerData.normalBodyColor;
    pCtx.beginPath();
    pCtx.arc(cx, headY, 9.5, 0, Math.PI * 2);
    pCtx.fill();

    // ★ 兜（フルヘルム）描画
    if (playerData.hasHelmet) {
        const hColor = playerData.helmetColor || '#ff5252';
        const hLight = adjustPreviewColor(hColor, 0.45);
        const hDark = adjustPreviewColor(hColor, -0.45);

        // 兜本体
        pCtx.save();
        pCtx.fillStyle = hColor;
        pCtx.strokeStyle = '#ffd32a';
        pCtx.lineWidth = 1.3;
        pCtx.beginPath();
        pCtx.arc(cx, headY - 1, 11, Math.PI * 0.75, Math.PI * 2.25);
        pCtx.lineTo(cx + 9, headY + 5);
        pCtx.lineTo(cx - 9, headY + 5);
        pCtx.closePath();
        pCtx.fill();
        pCtx.stroke();

        // 兜トサカ
        pCtx.fillStyle = hLight;
        pCtx.beginPath();
        pCtx.moveTo(cx - 3, headY - 11);
        pCtx.lineTo(cx + 6, headY - 17);
        pCtx.lineTo(cx + 3, headY - 10);
        pCtx.closePath();
        pCtx.fill();
        pCtx.stroke();
        pCtx.restore();
    }

    // バイザー
    pCtx.save();
    const vColor = playerData.visorColor || '#ffffff';
    pCtx.strokeStyle = vColor;
    pCtx.lineWidth = (vColor === '#ffffff') ? 2 : 3;
    if (vColor !== '#ffffff') {
        pCtx.shadowBlur = 6;
        pCtx.shadowColor = vColor;
    }
    pCtx.beginPath();
    pCtx.moveTo(cx + 2, headY - 1);
    pCtx.lineTo(cx + 10, headY - 1);
    pCtx.stroke();
    pCtx.restore();

    // 下半身
    pCtx.strokeStyle = playerData.normalLegsColor;
    pCtx.beginPath();
    pCtx.moveTo(cx, hipY); pCtx.lineTo(leftFoot.x, leftFoot.y); pCtx.stroke();
    pCtx.beginPath();
    pCtx.moveTo(cx, hipY); pCtx.lineTo(rightFoot.x, rightFoot.y); pCtx.stroke();

    if (playerData.outfitType === 'armor') {
        const aLegLight = adjustPreviewColor(playerData.armorLegsColor, 0.45);
        const aLegDark = adjustPreviewColor(playerData.armorLegsColor, -0.45);

        [leftFoot, rightFoot].forEach((foot) => {
            const kneeX = (cx + foot.x) / 2;
            const kneeY = (hipY + foot.y) / 2;

            pCtx.strokeStyle = playerData.armorLegsColor;
            pCtx.lineWidth = 6;
            pCtx.beginPath();
            pCtx.moveTo(kneeX, kneeY); pCtx.lineTo(foot.x, foot.y); pCtx.stroke();

            // 菱形ニーガード
            pCtx.save();
            pCtx.fillStyle = aLegLight;
            pCtx.strokeStyle = '#ffd32a';
            pCtx.lineWidth = 1.3;
            pCtx.beginPath();
            pCtx.moveTo(kneeX, kneeY - 4.5);
            pCtx.lineTo(kneeX + 4, kneeY);
            pCtx.lineTo(kneeX, kneeY + 4.5);
            pCtx.lineTo(kneeX - 4, kneeY);
            pCtx.closePath();
            pCtx.fill();
            pCtx.stroke();
            pCtx.restore();

            // 鉄靴サバトン
            pCtx.fillStyle = aLegDark;
            pCtx.beginPath();
            pCtx.ellipse(foot.x + 2, foot.y, 6, 3.5, 0, 0, Math.PI * 2);
            pCtx.fill();

            pCtx.fillStyle = '#ecf0f1';
            pCtx.beginPath();
            pCtx.ellipse(foot.x + 2, foot.y - 1, 3.5, 1.8, 0, 0, Math.PI * 2);
            pCtx.fill();
        });
    }

    // 上半身
    if (playerData.outfitType === 'armor') {
        pCtx.strokeStyle = playerData.normalBodyColor;
        pCtx.beginPath();
        pCtx.moveTo(cx, headY + 9); pCtx.lineTo(cx, hipY); pCtx.stroke();

        pCtx.fillStyle = playerData.armorBodyColor;
        pCtx.beginPath();
        pCtx.ellipse(cx, (chestY + hipY) / 2, 9.5, 13, 0, 0, Math.PI * 2);
        pCtx.fill();

        pCtx.strokeStyle = '#ffd32a';
        pCtx.lineWidth = 1.3;
        pCtx.beginPath();
        pCtx.arc(cx - 6, chestY - 1, 6, 0, Math.PI * 2);
        pCtx.fill(); pCtx.stroke();
        pCtx.beginPath();
        pCtx.arc(cx + 6, chestY - 1, 6, 0, Math.PI * 2);
        pCtx.fill(); pCtx.stroke();
    } else {
        pCtx.strokeStyle = playerData.normalBodyColor;
        pCtx.beginPath();
        pCtx.moveTo(cx, headY + 9); pCtx.lineTo(cx, hipY); pCtx.stroke();
        pCtx.fillStyle = playerData.normalBodyColor;
        pCtx.beginPath();
        pCtx.ellipse(cx, (chestY + hipY) / 2, 6, 11, 0, 0, Math.PI * 2);
        pCtx.fill();
    }

    // 腕
    pCtx.strokeStyle = playerData.normalBodyColor;
    pCtx.beginPath();
    pCtx.moveTo(cx, chestY); pCtx.lineTo(leftHand.x, leftHand.y); pCtx.stroke();
    pCtx.beginPath();
    pCtx.moveTo(cx, chestY); pCtx.lineTo(rightHand.x, rightHand.y); pCtx.stroke();

    // 剣
    pCtx.strokeStyle = '#ecf0f1';
    pCtx.lineWidth = 3;
    pCtx.beginPath();
    pCtx.moveTo(rightHand.x, rightHand.y);
    pCtx.lineTo(rightHand.x + 18, rightHand.y - 24);
    pCtx.stroke();

    pCtx.restore();
}

function renderShopUI() {
    updateGoldUI();
    
    const normalBodyPrice = getCurrentColorPrice(playerData.unlockedBodyColors);
    const normalLegsPrice = getCurrentColorPrice(playerData.unlockedLegsColors);
    const armorBodyPrice = getCurrentColorPrice(playerData.unlockedArmorBodyColors);
    const armorLegsPrice = getCurrentColorPrice(playerData.unlockedArmorLegsColors);
    const helmetPrice = getCurrentHelmetPrice(playerData.unlockedHelmetColors);
    const visorPrice = getCurrentColorPrice(playerData.unlockedVisorColors);

    const tNB = document.getElementById('title-normal-body');
    if (tNB) tNB.innerText = `■ 上半身カラー (次回: ${normalBodyPrice}G)`;
    const tNL = document.getElementById('title-normal-legs');
    if (tNL) tNL.innerText = `■ 下半身カラー (次回: ${normalLegsPrice}G)`;
    const tAB = document.getElementById('title-armor-body');
    if (tAB) tAB.innerText = `■ 鎧・上半身アーマー (次回: ${armorBodyPrice}G)`;
    const tAL = document.getElementById('title-armor-legs');
    if (tAL) tAL.innerText = `■ 鎧・下半身アーマー (次回: ${armorLegsPrice}G)`;
    const tHelmet = document.getElementById('title-armor-helmet');
    if (tHelmet) tHelmet.innerText = `■ 鎧・兜フルヘルム (次回: ${helmetPrice}G)`;
    const tVisor = document.getElementById('title-visor');
    if (tVisor) tVisor.innerText = `■ バイザーカラー (次回: ${visorPrice}G)`;

    // 1. 通常・上半身
    renderPaletteGrid('normal-body-palette', playerData.normalBodyColor, playerData.unlockedBodyColors, (c) => {
        playerData.normalBodyColor = c;
    }, playerData.unlockedBodyColors, false, normalBodyPrice);

    // 2. 通常・下半身
    renderPaletteGrid('normal-legs-palette', playerData.normalLegsColor, playerData.unlockedLegsColors, (c) => {
        playerData.normalLegsColor = c;
    }, playerData.unlockedLegsColors, false, normalLegsPrice);

    // 鎧タブ（鎧上下 ＆ ★兜）
    const isArmorUnlocked = (playerData.totalCpuWins || 0) >= 10;
    const isWearingArmor = (playerData.outfitType === 'armor');

    const armorStatusEl = document.getElementById('armor-unlock-status');
    if (armorStatusEl) {
        if (!isArmorUnlocked) {
            armorStatusEl.innerHTML = `<span style="color:#ffd32a;">🔒 鎧の解放条件: CPU戦通算10勝（現在: ${playerData.totalCpuWins || 0}/10勝）</span>`;
        } else {
            armorStatusEl.innerHTML = isWearingArmor ? 
                `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:6px; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:8px;">
                    <span style="color:#0be881; font-weight:bold; font-size:12px;">🛡️ 鎧を【装備中】</span>
                    <button class="menu-btn" style="padding:4px 10px; font-size:11px; width:auto; margin:0; background:#607d8b; box-shadow:none;" onclick="toggleArmorEquip(false)">✕ 鎧を脱ぐ</button>
                 </div>` : 
                `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:6px; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:8px;">
                    <span style="color:#a4b0be; font-size:12px;">🛡️ 鎧は未装備 (通常服)</span>
                    <button class="menu-btn" style="padding:4px 10px; font-size:11px; width:auto; margin:0; background:linear-gradient(135deg, #0be881, #05c46b); box-shadow:0 2px 8px rgba(11,232,129,0.4);" onclick="toggleArmorEquip(true)">🛡️ 鎧を装備する</button>
                 </div>`;
        }
    }

    // ★ 兜ステータス
    const isHelmetUnlocked = (playerData.totalCpuWins || 0) >= 30;
    const isWearingHelmet = !!playerData.hasHelmet;
    const helmetStatusEl = document.getElementById('helmet-unlock-status');
    if (helmetStatusEl) {
        if (!isHelmetUnlocked) {
            helmetStatusEl.innerHTML = `<span style="color:#ffd32a;">🔒 兜の解放条件: CPU戦通算30勝（現在: ${playerData.totalCpuWins || 0}/30勝）</span>`;
        } else {
            helmetStatusEl.innerHTML = isWearingHelmet ? 
                `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:6px; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:8px;">
                    <span style="color:#0be881; font-weight:bold; font-size:12px;">👑 兜を【装備中】</span>
                    <button class="menu-btn" style="padding:4px 10px; font-size:11px; width:auto; margin:0; background:#607d8b; box-shadow:none;" onclick="toggleHelmetEquip(false)">✕ 兜を脱ぐ</button>
                 </div>` : 
                `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:6px; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:8px;">
                    <span style="color:#a4b0be; font-size:12px;">👑 兜は未装備</span>
                    <button class="menu-btn" style="padding:4px 10px; font-size:11px; width:auto; margin:0; background:linear-gradient(135deg, #0be881, #05c46b); box-shadow:0 2px 8px rgba(11,232,129,0.4);" onclick="toggleHelmetEquip(true)">👑 兜を装備する</button>
                 </div>`;
        }
    }

    // 3. 鎧・上半身
    renderPaletteGrid('armor-body-palette', playerData.armorBodyColor, playerData.unlockedArmorBodyColors, (c) => {
        if (!isArmorUnlocked) { alert(`鎧は【CPU戦で通算10勝】すると解放されます！`); return; }
        playerData.outfitType = 'armor';
        playerData.armorBodyColor = c;
    }, playerData.unlockedArmorBodyColors, !isArmorUnlocked, armorBodyPrice);

    // 4. 鎧・下半身
    renderPaletteGrid('armor-legs-palette', playerData.armorLegsColor, playerData.unlockedArmorLegsColors, (c) => {
        if (!isArmorUnlocked) { alert(`鎧は【CPU戦で通算10勝】すると解放されます！`); return; }
        playerData.outfitType = 'armor';
        playerData.armorLegsColor = c;
    }, playerData.unlockedArmorLegsColors, !isArmorUnlocked, armorLegsPrice);

    // ★ 5. 鎧・兜パレット (50G〜+20G)
    renderPaletteGrid('armor-helmet-palette', playerData.helmetColor, playerData.unlockedHelmetColors, (c) => {
        if (!isHelmetUnlocked) { alert(`兜は【CPU戦で通算30勝】すると解放されます！（現在: ${playerData.totalCpuWins || 0}/30勝）`); return; }
        playerData.hasHelmet = true;
        playerData.helmetColor = c;
    }, playerData.unlockedHelmetColors, !isHelmetUnlocked, helmetPrice);

    // 6. 頭部バイザー
    const visorPaletteWithWhite = ['#ffffff', ...PALETTE.filter(c => c !== '#ffffff')];
    renderPaletteGrid('visor-palette', playerData.visorColor, playerData.unlockedVisorColors, (c) => {
        playerData.visorColor = c;
    }, playerData.unlockedVisorColors, false, visorPrice, visorPaletteWithWhite);

    // 7. 猛者スキン
    const accList = document.getElementById('accessory-list');
    if (accList) {
        accList.innerHTML = '';
        const records = JSON.parse(localStorage.getItem('fencing_ranking')) || [];
        const maxRecordStreak = records.length > 0 ? Math.max(...records.map(r => r.streak)) : 0;
        const currentBest = Math.max((typeof winStreak !== 'undefined' ? winStreak : 0), maxRecordStreak);

        const accessories = [
            { id: 'none', name: 'なし (標準)', reqStreak: 0 },
            { id: 'cloak', name: '🦹 英雄のマント', reqStreak: 10 },
            { id: 'god', name: '✨ 黄金のゴッドオーラ', reqStreak: 100 }
        ];

        accessories.forEach(acc => {
            const isUnlocked = (acc.reqStreak === 0) || (currentBest >= acc.reqStreak);
            const isEquipped = (acc.id === 'cloak' && playerData.hasCloak) || (acc.id === 'god' && playerData.hasGodAura) || (acc.id === 'none' && !playerData.hasCloak && !playerData.hasGodAura);

            const btn = document.createElement('button');
            btn.className = `acc-item-btn ${isEquipped ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`;
            let statusText = isEquipped ? '【装備中】' : (isUnlocked ? '装備する' : `🔒 条件: ${acc.reqStreak}連勝 (現在:${currentBest})`);
            btn.innerHTML = `<span>${acc.name}</span><span style="font-size:11px; color:#ffd32a;">${statusText}</span>`;

            btn.onclick = () => {
                if (acc.id === 'none') {
                    playerData.hasCloak = false;
                    playerData.hasGodAura = false;
                } else if (acc.id === 'cloak') {
                    if (isUnlocked) playerData.hasCloak = !playerData.hasCloak;
                    else alert(`猛者専用スキン！【10連勝達成】でアンロックされます！`);
                } else if (acc.id === 'god') {
                    if (isUnlocked) playerData.hasGodAura = !playerData.hasGodAura;
                    else alert(`前人未到の猛者専用スキン！【100連勝達成】でアンロックされます！`);
                }
                savePlayerData();
                renderShopUI();
            };
            accList.appendChild(btn);
        });
    }

    renderShopPreview();
}

function renderPaletteGrid(elementId, currentColor, unlockedArray, onSelect, unlockList, isParentLocked, currentPrice, customPalette) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '';

    const list = customPalette || PALETTE;

    list.forEach(c => {
        const isUnlocked = unlockList.includes(c);
        const sw = document.createElement('div');
        sw.className = `color-swatch ${currentColor === c ? 'active' : ''} ${(!isUnlocked || isParentLocked) ? 'locked' : ''}`;
        sw.style.backgroundColor = c;
        sw.onclick = () => {
            if (isParentLocked) { onSelect(c); return; }
            if (isUnlocked) {
                onSelect(c);
            } else {
                if (playerData.gold >= currentPrice) {
                    if (confirm(`このカラーを ${currentPrice} G で購入しますか？`)) {
                        playerData.gold -= currentPrice;
                        unlockList.push(c);
                        onSelect(c);
                    }
                } else {
                    alert(`ゴールドが足りません！（必要: ${currentPrice}G / 現在: ${playerData.gold}G）`);
                }
            }
            savePlayerData();
            renderShopUI();
        };
        el.appendChild(sw);
    });
}

function updateRankingUI() {
    const rankingList = document.getElementById('ranking-list');
    if (!rankingList) return;
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

loadPlayerData();