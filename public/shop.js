// ==========================================
// ★ shop.js（セーブデータ・ショップ・賭け・ランキング）
// ==========================================

const COLOR_PRICE = 15;
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
    hasCloak: false,
    hasGodAura: false,
    lastLoginDate: ''
};

function loadPlayerData() {
    const saved = localStorage.getItem('fencing_player_data');
    if (saved) {
        try {
            playerData = { ...playerData, ...JSON.parse(saved) };
            if (!playerData.unlockedBodyColors) playerData.unlockedBodyColors = playerData.unlockedColors || ['#ff5252'];
            if (!playerData.unlockedLegsColors) playerData.unlockedLegsColors = playerData.unlockedColors || ['#ff5252'];
            if (!playerData.unlockedArmorBodyColors) playerData.unlockedArmorBodyColors = playerData.unlockedArmorColors || ['#ff5252'];
            if (!playerData.unlockedArmorLegsColors) playerData.unlockedArmorLegsColors = playerData.unlockedArmorColors || ['#ff5252'];
        } catch (e) {}
    }
    updateGoldUI();
    checkDailyLoginStatus();
    if (typeof applyPlayerCustomization === 'function') {
        applyPlayerCustomization();
    }
}

function savePlayerData() {
    localStorage.setItem('fencing_player_data', JSON.stringify(playerData));
    updateGoldUI();
    checkDailyLoginStatus();
    if (typeof applyPlayerCustomization === 'function') {
        applyPlayerCustomization();
    }
}

function updateGoldUI() {
    const goldDisplay = document.getElementById('gold-amount');
    if (goldDisplay) goldDisplay.innerText = playerData.gold;
    document.querySelectorAll('.current-gold-span').forEach(el => el.innerText = playerData.gold);
}

// ==========================================
// ★ デバッグ全解放 (+10G / 鎧解放 / 100連勝スキン解放)
// ==========================================
function debugAddGold() {
    // 1. ゴールド +10G
    playerData.gold += 10;

    // 2. CPU戦 10勝達成 (鎧解放) & 鎧を即時着用
    playerData.totalCpuWins = Math.max(playerData.totalCpuWins || 0, 10);
    playerData.outfitType = 'armor';
    savePlayerData();

    // 3. 100連勝記録を保存 (マント＆ゴッドオーラ解放)
    const records = JSON.parse(localStorage.getItem('fencing_ranking')) || [];
    if (!records.some(r => r.streak >= 100)) {
        records.push({ name: 'MASTER', streak: 100 });
        records.sort((a, b) => b.streak - a.streak);
        if (records.length > 3) records.length = 3;
        localStorage.setItem('fencing_ranking', JSON.stringify(records));
        updateRankingUI();
    }

    // 4. ショップ表示を即時更新
    renderShopUI();

    if (typeof Sound !== 'undefined') {
        Sound.playSE('bom');
    }
}

// デイリーログインボーナス
function checkDailyLoginStatus() {
    const today = new Date().toISOString().split('T')[0];
    const dailyLoginBtn = document.getElementById('daily-login-btn');
    if (dailyLoginBtn) {
        if (playerData.lastLoginDate === today) {
            dailyLoginBtn.classList.add('claimed');
            dailyLoginBtn.innerText = "✅ 本日受取済";
        } else {
            dailyLoginBtn.classList.remove('claimed');
            dailyLoginBtn.innerText = "🎁 ログインボーナス！";
        }
    }
}

function claimDailyLoginBonus() {
    const today = new Date().toISOString().split('T')[0];
    if (playerData.lastLoginDate === today) {
        alert("本日のログインボーナスは受取済みです！\n明日また受け取ってね！");
        return;
    }

    const bonus = Math.floor(Math.random() * 5) + 1;
    playerData.gold += bonus;
    playerData.lastLoginDate = today;
    savePlayerData();

    Sound.playSE('bom');
    alert(`🎉 ログインボーナス獲得！\n+${bonus} G を手に入れた！\n(現在の所持金: ${playerData.gold} G)`);
}

// 観戦ベッティングモーダル
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

// スキン工房モーダル
function openShopModal() {
    document.getElementById('shop-screen').style.display = 'flex';
    renderShopUI();
}

function closeShopModal() {
    document.getElementById('shop-screen').style.display = 'none';
    savePlayerData();
    if (typeof applyPlayerCustomization === 'function') {
        applyPlayerCustomization();
    }
}

// タブ切り替え（※勝手に鎧を着脱しない）
function switchShopTab(tab) {
    document.getElementById('tab-normal').style.display = (tab === 'normal') ? 'block' : 'none';
    document.getElementById('tab-armor').style.display = (tab === 'armor') ? 'block' : 'none';
    document.getElementById('tab-accessory').style.display = (tab === 'accessory') ? 'block' : 'none';
    document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', (tab === 'normal' && idx === 0) || (tab === 'armor' && idx === 1) || (tab === 'accessory' && idx === 2));
    });

    renderShopUI();
}

// ★ 鎧の着脱切り替え関数
function toggleArmorEquip(equip) {
    const isArmorUnlocked = (playerData.totalCpuWins || 0) >= 10;
    if (equip && !isArmorUnlocked) {
        alert(`鎧は【CPU戦で通算10勝】すると解放されます！（現在: ${playerData.totalCpuWins || 0}/10勝）`);
        return;
    }
    playerData.outfitType = equip ? 'armor' : 'normal';
    savePlayerData();
    renderShopUI();
}

function renderShopUI() {
    updateGoldUI();
    
    // ★ 1. 通常・上半身カラー (素体の色変更・鎧は脱げない)
    renderPaletteGrid('normal-body-palette', playerData.normalBodyColor, playerData.unlockedBodyColors, (c) => {
        playerData.normalBodyColor = c;
    }, playerData.unlockedBodyColors);

    // ★ 2. 通常・下半身カラー (素体の色変更・鎧は脱げない)
    renderPaletteGrid('normal-legs-palette', playerData.normalLegsColor, playerData.unlockedLegsColors, (c) => {
        playerData.normalLegsColor = c;
    }, playerData.unlockedLegsColors);

    // ★ 鎧タブのアンロック状態 ＆ 【装備する / 脱ぐ】ボタン
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

    // ★ 3. 鎧・上半身アーマー (選ぶと自動で鎧装備)
    renderPaletteGrid('armor-body-palette', playerData.armorBodyColor, playerData.unlockedArmorBodyColors, (c) => {
        if (!isArmorUnlocked) {
            alert(`鎧は【CPU戦で通算10勝】すると解放されます！（現在: ${playerData.totalCpuWins || 0}/10勝）`);
            return;
        }
        playerData.outfitType = 'armor';
        playerData.armorBodyColor = c;
    }, playerData.unlockedArmorBodyColors, !isArmorUnlocked);

    // ★ 4. 鎧・下半身アーマー (選ぶと自動で鎧装備)
    renderPaletteGrid('armor-legs-palette', playerData.armorLegsColor, playerData.unlockedArmorLegsColors, (c) => {
        if (!isArmorUnlocked) {
            alert(`鎧は【CPU戦で通算10勝】すると解放されます！（現在: ${playerData.totalCpuWins || 0}/10勝）`);
            return;
        }
        playerData.outfitType = 'armor';
        playerData.armorLegsColor = c;
    }, playerData.unlockedArmorLegsColors, !isArmorUnlocked);

    // アクセサリーリスト
    const accList = document.getElementById('accessory-list');
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
                else alert(`猛者専用スキン！【10連勝達成】でアンロックされます！（現在最高: ${currentBest}連勝）`);
            } else if (acc.id === 'god') {
                if (isUnlocked) playerData.hasGodAura = !playerData.hasGodAura;
                else alert(`前人未到の猛者専用スキン！【100連勝達成】でアンロックされます！（現在最高: ${currentBest}連勝）`);
            }
            savePlayerData();
            renderShopUI();
        };
        accList.appendChild(btn);
    });
}

function renderPaletteGrid(elementId, currentColor, unlockedArray, onSelect, unlockList, isParentLocked) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '';

    PALETTE.forEach(c => {
        const isUnlocked = unlockList.includes(c);
        const sw = document.createElement('div');
        sw.className = `color-swatch ${currentColor === c ? 'active' : ''} ${(!isUnlocked || isParentLocked) ? 'locked' : ''}`;
        sw.style.backgroundColor = c;
        sw.onclick = () => {
            if (isParentLocked) { onSelect(c); return; }
            if (isUnlocked) {
                onSelect(c);
            } else {
                if (playerData.gold >= COLOR_PRICE) {
                    if (confirm(`このカラーを ${COLOR_PRICE}G で購入しますか？`)) {
                        playerData.gold -= COLOR_PRICE;
                        unlockList.push(c);
                        onSelect(c);
                    }
                } else {
                    alert(`ゴールドが足りません！（必要: ${COLOR_PRICE}G / 現在: ${playerData.gold}G）`);
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
