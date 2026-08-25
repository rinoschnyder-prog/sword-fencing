// ==========================================
// ★ sound.js v18.1（BGM完全ローテーション切り替え版）
// ==========================================

class SoundManager {
    constructor() {
        this.ctx = null;
        this.buffers = {};
        this.currentBgm = null;
        this.currentBgmType = null;
        this.bgmVolume = 0.45;
        this.seVolume = 0.7;
        this.bgmMuted = false;
        this.seMuted = false;

        this.seFiles = {
            hit: 'se/se_hit.wav',
            heavy: 'se/se_heavy.wav',
            guard: 'se/se_guard.wav',
            break: 'se/se_break.wav',
            swing: 'se/se_swing.wav',
            bom: 'se/se_bom.wav'
        };

        this.titleBgmUrl = 'bgm/top-iimhero.mp3';
        this.gameBgmList = [
            'bgm/back-bgm1.mp3',
            'bgm/back-bgm2.mp3'
        ];
        this.currentGameBgmIndex = 0;

        this.bgmAudioElements = {};
        const titleAudio = new Audio(this.titleBgmUrl);
        titleAudio.loop = true;
        titleAudio.volume = this.getEffectiveBgmVolume();
        this.bgmAudioElements['title'] = titleAudio;

        this.gameBgmAudioElements = this.gameBgmList.map(url => {
            const a = new Audio(url);
            a.loop = true;
            a.volume = this.getEffectiveBgmVolume();
            return a;
        });

        this.seAudioPool = {};
        for (const [key, url] of Object.entries(this.seFiles)) {
            this.seAudioPool[key] = [];
            for (let i = 0; i < 3; i++) {
                const a = new Audio(url);
                a.volume = this.getEffectiveSeVolume();
                this.seAudioPool[key].push(a);
            }
        }

        this.initAudioContext();
    }

    getEffectiveBgmVolume() {
        return this.bgmMuted ? 0 : this.bgmVolume;
    }

    getEffectiveSeVolume() {
        return this.seMuted ? 0 : this.seVolume;
    }

    updateBgmVolumes() {
        const vol = this.getEffectiveBgmVolume();
        if (this.currentBgm) this.currentBgm.volume = vol;
        for (let k in this.bgmAudioElements) this.bgmAudioElements[k].volume = vol;
        if (this.gameBgmAudioElements) this.gameBgmAudioElements.forEach(a => a.volume = vol);
    }

    updateSeVolumes() {
        const vol = this.getEffectiveSeVolume();
        for (let k in this.seAudioPool) {
            this.seAudioPool[k].forEach(a => a.volume = vol);
        }
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

    playSE(name) {
        if (this.seMuted) return;
        this.unlockAudio();

        if (this.ctx && this.buffers[name]) {
            try {
                const source = this.ctx.createBufferSource();
                const gain = this.ctx.createGain();
                source.buffer = this.buffers[name];
                gain.gain.value = this.getEffectiveSeVolume();
                source.connect(gain);
                gain.connect(this.ctx.destination);
                source.start(0);
                return;
            } catch (e) {}
        }

        const pool = this.seAudioPool[name];
        if (pool) {
            const audio = pool.find(a => a.paused || a.ended) || pool[0];
            audio.currentTime = 0;
            audio.volume = this.getEffectiveSeVolume();
            audio.play().catch(() => {});
        }
    }

    // ★ 試合ごとに確実に次のBGMへ切り替えて再生
    playBGM(type) {
        this.unlockAudio();

        if (type === 'title' && this.currentBgmType === 'title' && this.currentBgm && !this.currentBgm.paused) return;

        this.stopBGM();

        let audio = null;
        if (type === 'game') {
            audio = this.gameBgmAudioElements[this.currentGameBgmIndex];
            this.currentGameBgmIndex = (this.currentGameBgmIndex + 1) % this.gameBgmAudioElements.length;
        } else {
            audio = this.bgmAudioElements['title'];
        }

        if (audio) {
            audio.currentTime = 0;
            audio.volume = this.getEffectiveBgmVolume();
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