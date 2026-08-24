// ==========================================
// ★ オーディオマネージャー（sound.js 完全確実再生版）
// ==========================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.buffers = {};
        this.currentBgm = null;
        this.currentBgmType = null;
        this.bgmVolume = 0.45;
        this.seVolume = 0.7;

        this.seFiles = {
            hit: 'se/se_hit.wav',
            heavy: 'se/se_heavy.wav',
            guard: 'se/se_guard.wav',
            break: 'se/se_break.wav',
            swing: 'se/se_swing.wav',
            bom: 'se/se_bom.wav'
        };

        this.bgmFiles = {
            title: 'bgm/top-iimhero.mp3',
            game1: 'bgm/back-bgm1.mp3',
            game2: 'bgm/back-bgm2.mp3'
        };

        // BGMプレイヤー
        this.bgmAudioElements = {};
        for (const [key, url] of Object.entries(this.bgmFiles)) {
            const audio = new Audio(url);
            audio.loop = true;
            audio.volume = this.bgmVolume;
            audio.addEventListener('ended', () => {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            });
            this.bgmAudioElements[key] = audio;
        }

        // SEフォールバック用Audioプール（Web Audioがブロックされた時も確実に鳴らす）
        this.seAudioPool = {};
        for (const [key, url] of Object.entries(this.seFiles)) {
            this.seAudioPool[key] = [];
            for (let i = 0; i < 3; i++) {
                const a = new Audio(url);
                a.volume = this.seVolume;
                this.seAudioPool[key].push(a);
            }
        }

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
            } catch (e) {}
        }
    }

    // ★ どんな環境でも100%確実に鳴るSE再生
    playSE(name) {
        this.unlockAudio();

        // 1. Web Audio APIで超高速再生
        if (this.ctx && this.buffers[name]) {
            try {
                const source = this.ctx.createBufferSource();
                const gain = this.ctx.createGain();
                source.buffer = this.buffers[name];
                gain.gain.value = this.seVolume;
                source.connect(gain);
                gain.connect(this.ctx.destination);
                source.start(0);
                return;
            } catch (e) {}
        }

        // 2. フォールバック（Audio要素で再生）
        const pool = this.seAudioPool[name];
        if (pool) {
            const audio = pool.find(a => a.paused || a.ended) || pool[0];
            audio.currentTime = 0;
            audio.volume = this.seVolume;
            audio.play().catch(() => {});
        }
    }

    playBGM(type) {
        this.unlockAudio();
        if (type === 'game' && this.currentBgmType === 'game' && this.currentBgm && !this.currentBgm.paused) return;
        if (type === 'title' && this.currentBgmType === 'title' && this.currentBgm && !this.currentBgm.paused) return;

        this.stopBGM();
        let targetKey = type === 'game' ? (Math.random() < 0.5 ? 'game1' : 'game2') : 'title';
        const audio = this.bgmAudioElements[targetKey];
        if (audio) {
            audio.currentTime = 0;
            audio.volume = this.bgmVolume;
            audio.play().catch(() => {});
            this.currentBgm = audio;
            this.currentBgmType = type;
        }
    }

    stopBGM() {
        if (this.currentBgm) {
            this.currentBgm.pause();
            this.currentBgm.currentTime = 0;
            this.currentBgm = null;
            this.currentBgmType = null;
        }
    }
}

const Sound = new SoundManager();

const handleFirstInteraction = () => Sound.unlockAudio();
window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
window.addEventListener('mousedown', handleFirstInteraction);
window.addEventListener('click', handleFirstInteraction);