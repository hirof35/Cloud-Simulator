"use strict";

class UltimateCloudSimulator {
    constructor(canvasId) {
        this.offsetX = 0;
        // 24時間のカラータイムライン定義 (0.0〜1.0)
        this.timeline = [
            { time: 0.0,  palette: { sky: { r: 5, g: 10, b: 25 },    cloudBase: { r: 15, g: 20, b: 35 } } },     // 深夜
            { time: 0.25, palette: { sky: { r: 240, g: 130, b: 90 }, cloudBase: { r: 130, g: 70, b: 90 }, cloudHighlight: { r: 255, g: 220, b: 140 } } }, // 朝焼け
            { time: 0.5,  palette: { sky: { r: 40, g: 130, b: 240 }, cloudBase: { r: 245, g: 245, b: 250 } } },   // 昼
            { time: 0.75, palette: { sky: { r: 190, g: 50, b: 15 },   cloudBase: { r: 80, g: 40, b: 60 }, cloudHighlight: { r: 255, g: 160, b: 30 } } },  // 夕焼け
            { time: 1.0,  palette: { sky: { r: 5, g: 10, b: 25 },    cloudBase: { r: 15, g: 20, b: 35 } } }      // 深夜(ループ用)
        ];
        
        // アニメーションループ用のアロー関数バインド
        this.animate = () => {
            // 風による横スクロール
            this.offsetX += this.config.windSpeed;
            
            // 24時間時計を進める
            this.config.timeOfDay += this.config.timeSpeed;
            if (this.config.timeOfDay > 1.0) {
                this.config.timeOfDay = 0.0; // 0時にループ
            }
            
            this.draw();
            requestAnimationFrame(this.animate);
        };

        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // 初期パラメータ設定
        this.config = {
            cloudCover: 0.5,
            windSpeed: 0.3,
            scale: 0.004,
            timeOfDay: 0.5,     // 昼からスタート
            timeSpeed: 0.0005   // 時間の流れる早さ
        };

        this.initControls();
        this.animate();
    }

    // HTMLのスライダーや表示と同期
    initControls() {
        const slider = document.getElementById('cloudCover');
        const valueDisplay = document.getElementById('coverValue');
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                valueDisplay.textContent = `${val}%`;
                this.config.cloudCover = val / 100;
            });
        }
    }

    // 線形補間
    lerp(start, end, amt) {
        return start + (end - start) * amt;
    }

    lerpColor(c1, c2, t) {
        return {
            r: this.lerp(c1.r, c2.r, t),
            g: this.lerp(c1.g, c2.g, t),
            b: this.lerp(c1.b, c2.b, t)
        };
    }

    // 擬似乱数ハッシュ
    hash2D(x, y) {
        const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
        return h - Math.floor(h);
    }

    // 2Dバリューノイズ
    noise(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;
        
        const u = fx * fx * (3.0 - 2.0 * fx);
        const v = fy * fy * (3.0 - 2.0 * fy);
        
        const a = this.hash2D(ix, iy);
        const b = this.hash2D(ix + 1, iy);
        const c = this.hash2D(ix, iy + 1);
        const d = this.hash2D(ix + 1, iy + 1);
        
        return this.lerp(this.lerp(a, b, u), this.lerp(c, d, u), v);
    }

    // フラクタル・ブラウン運動 (4レイヤー階層ノイズ)
    fbm(x, y) {
        let value = 0.0;
        let amplitude = 0.55;
        let freq = 1.0;
        for (let i = 0; i < 4; i++) {
            value += amplitude * this.noise(x * freq, y * freq);
            freq *= 2.1;
            amplitude *= 0.5;
        }
        return value;
    }

    // 現在の時間に対応するカラーパレットをブレンド抽出
    getInterpolatedPalette() {
        const t = this.config.timeOfDay;
        for (let i = 0; i < this.timeline.length - 1; i++) {
            const start = this.timeline[i];
            const end = this.timeline[i + 1];
            if (t >= start.time && t <= end.time) {
                const localT = (t - start.time) / (end.time - start.time);
                
                const sky = this.lerpColor(start.palette.sky, end.palette.sky, localT);
                const cloudBase = this.lerpColor(start.palette.cloudBase, end.palette.cloudBase, localT);
                
                let cloudHighlight = null;
                const hStart = start.palette.cloudHighlight ?? start.palette.cloudBase;
                const hEnd = end.palette.cloudHighlight ?? end.palette.cloudBase;
                if (start.palette.cloudHighlight || end.palette.cloudHighlight) {
                    cloudHighlight = this.lerpColor(hStart, hEnd, localT);
                }
                
                return { sky, cloudBase, cloudHighlight };
            }
        }
        return { sky: this.timeline[0].palette.sky, cloudBase: this.timeline[0].palette.cloudBase, cloudHighlight: null };
    }

    // レンダリングメイン処理
    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const imageData = this.ctx.createImageData(w, h);
        const data = imageData.data;
        
        // 1. 時間帯ベースの色を取得
        let { sky, cloudBase, cloudHighlight } = this.getInterpolatedPalette();
        
        // 2. 曇天・悪天候補正 (雲量90%以上で急激にグレーダウン)
        if (this.config.cloudCover > 0.9) {
            const stormFactor = (this.config.cloudCover - 0.9) / 0.1;
            const stormSky = { r: 35, g: 40, b: 50 };
            const stormCloud = { r: 50, g: 55, b: 65 };
            
            sky = this.lerpColor(sky, stormSky, stormFactor * 0.8);
            cloudBase = this.lerpColor(cloudBase, stormCloud, stormFactor * 0.9);
            if (cloudHighlight) {
                cloudHighlight = this.lerpColor(cloudHighlight, stormCloud, stormFactor);
            }
        }
        
        // 夜間判定 (星の表示輝度用)
        const isNight = this.config.timeOfDay < 0.2 || this.config.timeOfDay > 0.8;
        const nightIntensity = isNight ? (this.config.timeOfDay < 0.2 ? (0.2 - this.config.timeOfDay) / 0.2 : (this.config.timeOfDay - 0.8) / 0.2) : 0;
        
        const threshold = 1.0 - this.config.cloudCover;
        const now = Date.now();

        // 1ピクセルずつの描画ループ
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const nx = (x + this.offsetX) * this.config.scale;
                const ny = y * this.config.scale;
                
                // 雲のノイズ形状
                const n = this.fbm(nx * 12, ny * 12);
                
                // 密度計算
                let density = (n - threshold) / (1.0 - threshold);
                if (density < 0) density = 0;
                if (density > 1) density = 1;
                
                let finalR = sky.r;
                let finalG = sky.g;
                let finalB = sky.b;
                
                // 夜空の星空演出
                if (density === 0 && isNight) {
                    const starHash = this.hash2D(x, y);
                    if (starHash > 0.9993) {
                        const twinkle = (Math.sin(now * 0.005 + starHash * 100) + 1) * 0.5;
                        const starBrightness = twinkle * nightIntensity * 255;
                        finalR = Math.min(255, finalR + starBrightness);
                        finalG = Math.min(255, finalG + starBrightness);
                        finalB = Math.min(255, finalB + starBrightness);
                    }
                }
                
                // 雲の描画
                if (density > 0) {
                    let currentCloudColor = cloudBase;
                    
                    // 朝夕の立体エッジハイライト
                    if (cloudHighlight) {
                        const nEdge = this.fbm((nx + 0.01) * 12, (ny + 0.01) * 12);
                        let edgeFactor = n - nEdge;
                        if (edgeFactor > 0.02) {
                            const hRatio = Math.min(1.0, (edgeFactor - 0.02) * 15);
                            currentCloudColor = this.lerpColor(cloudBase, cloudHighlight, hRatio);
                        }
                    }
                    
                    // 背景色と雲の色を線形合成
                    finalR = this.lerp(finalR, currentCloudColor.r, density);
                    finalG = this.lerp(finalG, currentCloudColor.g, density);
                    finalB = this.lerp(finalB, currentCloudColor.b, density);
                }
                
                // ImageDataバッファへ書き込み
                const idx = (x + y * w) * 4;
                data[idx]     = finalR;
                data[idx + 1] = finalG;
                data[idx + 2] = finalB;
                data[idx + 3] = 255;
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
    }
}

// ドキュメント読み込み完了時にインスタンス化
window.addEventListener('DOMContentLoaded', () => {
    new UltimateCloudSimulator('cloudCanvas');
});