// カラーインターフェース
interface Color {
    r: number;
    g: number;
    b: number;
}

// 時間帯ごとのパレット
interface TimePalette {
    sky: Color;
    cloudBase: Color;  // 雲の基本色
    cloudHighlight?: Color; // 夕焼け時などのエッジ発光色（任意）
}

// シミュレーターの全設定
interface CompleteConfig {
    cloudCover: number;  // 0.0 〜 1.0 (ユーザー入力)
    windSpeed: number;   // 風速
    scale: number;       // 雲の細かさ
    timeOfDay: number;   // 0.0 〜 1.0 (時間経過)
    timeSpeed: number;   // 時間が進む速度
}

class UltimateCloudSimulator {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: CompleteConfig;
    private offsetX: number = 0;

    // 24時間のカラータイムライン定義
    private timeline: { time: number; palette: TimePalette }[] = [
        { time: 0.0,  palette: { sky: { r: 5, g: 10, b: 25 },    cloudBase: { r: 15, g: 20, b: 35 } } },     // 深夜
        { time: 0.25, palette: { sky: { r: 240, g: 130, b: 90 }, cloudBase: { r: 130, g: 70, b: 90 }, cloudHighlight: { r: 255, g: 220, b: 140 } } }, // 朝焼け
        { time: 0.5,  palette: { sky: { r: 40, g: 130, b: 240 }, cloudBase: { r: 245, g: 245, b: 250 } } },   // 昼
        { time: 0.75, palette: { sky: { r: 190, g: 50, b: 15 },   cloudBase: { r: 80, g: 40, b: 60 }, cloudHighlight: { r: 255, g: 160, b: 30 } } },  // 夕焼け
        { time: 1.0,  palette: { sky: { r: 5, g: 10, b: 25 },    cloudBase: { r: 15, g: 20, b: 35 } } }      // 深夜(ループ用)
    ];

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

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
    private initControls(): void {
        const slider = document.getElementById('cloudCover') as HTMLInputElement;
        const valueDisplay = document.getElementById('coverValue') as HTMLSpanElement;
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', (e) => {
                const val = parseInt((e.target as HTMLInputElement).value);
                valueDisplay.textContent = `${val}%`;
                this.config.cloudCover = val / 100;
            });
        }
    }

    // 線形補間(リニアインターポレーション)
    private lerp(start: number, end: number, amt: number): number {
        return start + (end - start) * amt;
    }

    private lerpColor(c1: Color, c2: Color, t: number): Color {
        return {
            r: this.lerp(c1.r, c2.r, t),
            g: this.lerp(c1.g, c2.g, t),
            b: this.lerp(c1.b, c2.b, t)
        };
    }

    // 擬似乱数ハッシュ
    private hash2D(x: number, y: number): number {
        const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
        return h - Math.floor(h);
    }

    // 2Dバリューノイズ
    private noise(x: number, y: number): number {
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

    // フラクタル・ブラウン運動 (階層ノイズ)
    private fbm(x: number, y: number): number {
        let value = 0.0;
        let amplitude = 0.55;
        let freq = 1.0;
        for (let i = 0; i < 4; i++) { // 4レイヤー重ねてリアルに
            value += amplitude * this.noise(x * freq, y * freq);
            freq *= 2.1;
            amplitude *= 0.5;
        }
        return value;
    }

    // 現在の時間に対応するカラーパレットをブレンド抽出
    private getInterpolatedPalette(): { sky: Color; cloudBase: Color; cloudHighlight: Color | null } {
        const t = this.config.timeOfDay;
        for (let i = 0; i < this.timeline.length - 1; i++) {
            const start = this.timeline[i];
            const end = this.timeline[i + 1];
            if (t >= start.time && t <= end.time) {
                const localT = (t - start.time) / (end.time - start.time);
                
                const sky = this.lerpColor(start.palette.sky, end.palette.sky, localT);
                const cloudBase = this.lerpColor(start.palette.cloudBase, end.palette.cloudBase, localT);
                
                // ハイライト色の補間処理（両方に存在する場合のみ）
                let cloudHighlight: Color | null = null;
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

    // レンダリングコアプロセス
    private draw(): void {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const imageData = this.ctx.createImageData(w, h);
        const data = imageData.data;

        // 1. 基本となる時間帯の色を取得
        let { sky, cloudBase, cloudHighlight } = this.getInterpolatedPalette();

        // 2. 曇天・悪天候補正 (雲量が90%を超えると全体を暗いグレーへ)
        if (this.config.cloudCover > 0.9) {
            const stormFactor = (this.config.cloudCover - 0.9) / 0.1; // 0.0 〜 1.0
            const stormSky: Color = { r: 35, g: 40, b: 50 };
            const stormCloud: Color = { r: 50, g: 55, b: 65 };
            
            sky = this.lerpColor(sky, stormSky, stormFactor * 0.8);
            cloudBase = this.lerpColor(cloudBase, stormCloud, stormFactor * 0.9);
            if (cloudHighlight) {
                cloudHighlight = this.lerpColor(cloudHighlight, stormCloud, stormFactor);
            }
        }

        // 夜判定 (星を表示する閾値)
        const isNight = this.config.timeOfDay < 0.2 || this.config.timeOfDay > 0.8;
        const nightIntensity = isNight ? (this.config.timeOfDay < 0.2 ? (0.2 - this.config.timeOfDay) / 0.2 : (this.config.timeOfDay - 0.8) / 0.2) : 0;

        const threshold = 1.0 - this.config.cloudCover;

        // ピクセルループ
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                // サンプリング座標 (風のオフセットを適用)
                const nx = (x + this.offsetX) * this.config.configScale();
                const ny = y * this.config.configScale();

                // 雲の基本形状ノイズ
                const n = this.fbm(nx * 12, ny * 12);

                // 雲密度計算
                let density = (n - threshold) / (1.0 - threshold);
                if (density < 0) density = 0;
                if (density > 1) density = 1;

                // 基本の合成色を決定
                let finalR = sky.r;
                let finalG = sky.g;
                let finalB = sky.b;

                // 空の部分（雲がない場所）かつ夜なら、低確率で星を描画
                if (density === 0 && isNight) {
                    // ピクセルごとのハッシュ値で星を配置
                    const starHash = this.hash2D(x, y);
                    if (starHash > 0.9993) { // 確率を絞る
                        const twinkle = (Math.sin(Date.now() * 0.005 + starHash * 100) + 1) * 0.5; // またたき効果
                        const starBrightness = twinkle * nightIntensity * 255;
                        finalR = Math.min(255, finalR + starBrightness);
                        finalG = Math.min(255, finalG + starBrightness);
                        finalB = Math.min(255, finalB + starBrightness);
                    }
                }

                if (density > 0) {
                    let currentCloudColor = cloudBase;

                    // 朝夕の立体感演出（エッジハイライト / 逆光効果）
                    if (cloudHighlight) {
                        // 少しずらした座標のノイズをサンプリングして「厚みの変化（勾配）」を作る
                        const nEdge = this.fbm((nx + 0.01) * 12, (ny + 0.01) * 12);
                        let edgeFactor = n - nEdge; // 雲の境界付近で大きな値になる
                        
                        if (edgeFactor > 0.02) {
                            // 雲のフチをハイライトカラーへブレンド
                            const hRatio = Math.min(1.0, (edgeFactor - 0.02) * 15);
                            currentCloudColor = this.lerpColor(cloudBase, cloudHighlight, hRatio);
                        }
                    }

                    // 空と雲をブレンド
                    finalR = this.lerp(finalR, currentCloudColor.r, density);
                    finalG = this.lerp(finalG, currentCloudColor.g, density);
                    finalB = this.lerp(finalB, currentCloudColor.b, density);
                }

                // ImageData配列へ書き込み
                const idx = (x + y * w) * 4;
                data[idx]     = finalR;
                data[idx + 1] = finalG;
                data[idx + 2] = finalB;
                data[idx + 3] = 255;
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    // ヘルパー：スケール値の調整
    private configScale(): number {
        return this.config.scale;
    }

    // ループアニメーション
    private animate = (): void => {
        // 風による横スクロール
        this.offsetX += this.config.windSpeed;
        
        // 24時間時計を進める
        this.config.timeOfDay += this.config.timeSpeed;
        if (this.config.timeOfDay > 1.0) {
            this.config.timeOfDay = 0.0; // 0時にループ
        }

        this.draw();
        
        // デバッグ用：現在のゲーム内時間をコンソールや画面に出したい場合はここを利用
        requestAnimationFrame(this.animate);
    }
}

// 起動
window.addEventListener('DOMContentLoaded', () => {
    new UltimateCloudSimulator('cloudCanvas');
});