// 各種フィルタを集めたnamespace
// constructorで設置してoffset順にupdateを実行することでリアルタイムな処理も可能
export namespace Filter {
    // バックフォワードコムフィルタ
    export class CombFilter {
        private _buffer1 : Array<number>;
        //private _buffer2 : Array<number>;
        private _f : number;
        private _N : number;
        private _offset : number;

        constructor(f : number, N : number) {
            this._f = f;
            this._N = N;
            this._offset = 0;
            this._buffer1 = new Array<number>(this._N+1).fill(0, 0, this._N+1);
            //this._buffer2 = new Array<number>(2).fill(0, 0, 2);
        }

        update(input : number) : number {
            this._offset++;
            const offset1W = (this._offset % this._buffer1.length);
            let offset1R = offset1W - this._N;
            while (offset1R < 0) {
                offset1R += this._buffer1.length;
            }
            const ret = this._buffer1[offset1R] * this._f + input;
            this._buffer1[offset1W] = -ret;
            return ret;
        }
    }

    // Low-pass Comb Filter(だと思うもの)
    // See: https://ccrma.stanford.edu/~jos/pasp/Lowpass_Feedback_Comb_Filter.html
    export class FeedbackCombFilter {
        private _buffer1 : Array<number>;
        private _buffer2 : Array<number>;
        private _f : number;
        private _d : number;
        private _N : number;
        private _offset : number;

        constructor(f : number, d : number, N : number) {
            this._f = f;
            this._d = d;
            this._N = N;
            this._offset = 0;
            this._buffer1 = new Array<number>(this._N+1).fill(0, 0, this._N+1);
            this._buffer2 = new Array<number>(2).fill(0, 0, 2);
        }

        update(input : number) : number {
            this._offset++;
            const offset1W = (this._offset % this._buffer1.length);
            let offset1R = offset1W - (this._buffer1.length-1);
            while (offset1R < 0) {
                offset1R += this._buffer1.length;
            }
            const offset2W = (this._offset % this._buffer2.length);
            let offset2R = offset2W - (this._buffer2.length-1);
            while (offset2R < 0) {
                offset2R += this._buffer2.length;
            }
            const R = (1 - this._d) * this._buffer1[offset1R] + this._d * this._buffer2[offset2R]
            const ret = this._buffer1[offset1W];
            this._buffer2[offset2W] = R;
            this._buffer1[offset1W] = input + this._f * R;
            return ret;
        }
    }

    // All-pass Filter(だと思うもの)
    // See: http://shinngoushori.com/wp-content/uploads/2018/05/all_pass_filter-1.pdf
    export class AllpassFilter {
        private _buffer1 : Array<number>;
        //private _buffer2 : Array<number>;
        private _a : number;
        private _D : number;
        private _offset : number;

        constructor(a : number, D : number) {
            this._a = a;
            this._D = D;
            this._offset = 0;
            this._buffer1 = new Array<number>(this._D+1).fill(0, 0, this._D+1);
            //this._buffer2 = new Array<number>(2).fill(0, 0, 2);
        }

        update(input : number) : number {
            this._offset++;
            const offset1W = (this._offset % this._buffer1.length);
            let offset1R = offset1W - this._D;
            while (offset1R < 0) {
                offset1R += this._buffer1.length;
            }
            const ret = this._buffer1[offset1R] - this._a * input; 
            this._buffer1[offset1W] = input + this._a * ret;
            return ret;
        }
    }

    // リバーブ処理を行うフィルタ(Freeverbというアルゴリズムを参考にしている)
    // いい感じに処理させるためコンストラクタに入力のサンプリング周波数が必要(デフォルト44100Hzを想定)
    // See: https://ccrma.stanford.edu/~jos/pasp/Freeverb.html
    // See: http://dsp-book.narod.ru/soundproc.pdf pp.77-81
    export class Reverber {
        gain      : number = 0.015;
        dry       : number = 0;
        frequency : number = 44100;
        static readonly defaultFrequency = 44100;
        private _wet = 1 / 3;
        get wet() {
            return this._wet;
        }
        set wet(v : number) {
            this._wet = v;
            this._wet1 = this._wet * (this._width / 2 + 0.5);
            this._wet2 = this._wet * ((1-this._width)/2);
        }
        private _width = 1;
        private _wet1 = this._wet * (this._width / 2 + 0.5);
        private _wet2 = this._wet * ((1-this._width)/2);

        private readonly _fdnsR : Array<[number, number, number]> = [
            [0.84, 0.2, 1557+23],
            [0.84, 0.2, 1617+23],
            [0.84, 0.2, 1491+23],
            [0.84, 0.2, 1422+23],
            [0.84, 0.2, 1277+23],
            [0.84, 0.2, 1356+23],
            [0.84, 0.2, 1188+23],
            [0.84, 0.2, 1116+23],
        ];
        private readonly _fdnsL : Array<[number, number, number]> = [
            [0.84, 0.2, 1557],
            [0.84, 0.2, 1617],
            [0.84, 0.2, 1491],
            [0.84, 0.2, 1422],
            [0.84, 0.2, 1277],
            [0.84, 0.2, 1356],
            [0.84, 0.2, 1188],
            [0.84, 0.2, 1116],
        ];
        private readonly _aps : Array<[number, number]> = [
            [0.5, 225],
            [0.5, 556],
            [0.5, 441],
            [0.5, 341],
        ];

        private _LBCF1L : [FeedbackCombFilter, FeedbackCombFilter, FeedbackCombFilter, FeedbackCombFilter];
        private _LBCF2L : [FeedbackCombFilter, FeedbackCombFilter, FeedbackCombFilter, FeedbackCombFilter];
        private _LBCF1R : [FeedbackCombFilter, FeedbackCombFilter, FeedbackCombFilter, FeedbackCombFilter];
        private _LBCF2R : [FeedbackCombFilter, FeedbackCombFilter, FeedbackCombFilter, FeedbackCombFilter];
        private _APF : [AllpassFilter, AllpassFilter, AllpassFilter, AllpassFilter];

        constructor(frequency : number = Reverber.defaultFrequency) {
            this._LBCF1R = [null, null, null, null];
            this._LBCF2R = [null, null, null, null];
            this._LBCF1L = [null, null, null, null];
            this._LBCF2L = [null, null, null, null];
            this._APF = [null, null, null, null];
            for(let i = 0; i < 4; i++) {
                this._LBCF1R[i] = new FeedbackCombFilter(this._fdnsR[i][0], this._fdnsR[i][1], Math.ceil(this._fdnsR[i][2] * frequency / Reverber.defaultFrequency));
                this._LBCF2R[i] = new FeedbackCombFilter(this._fdnsR[i+4][0], this._fdnsR[i+4][1], Math.ceil(this._fdnsR[i+4][2] * frequency / Reverber.defaultFrequency));
                this._LBCF1L[i] = new FeedbackCombFilter(this._fdnsL[i][0], this._fdnsL[i][1], Math.ceil(this._fdnsL[i][2] * frequency / Reverber.defaultFrequency));
                this._LBCF2L[i] = new FeedbackCombFilter(this._fdnsL[i+4][0], this._fdnsL[i+4][1], Math.ceil(this._fdnsL[i+4][2] * frequency / Reverber.defaultFrequency));
                this._APF[i] = new AllpassFilter(this._aps[i][0], Math.ceil(this._aps[i][1] * frequency / Reverber.defaultFrequency));
            }
        }

        update(inputR : number, inputL : number) : [number, number] {
            // R
            let resultR : number;
            {
                const input = (inputR + inputL) * this.gain;
                const result1s = this._LBCF1R.map(lbcf => lbcf.update(input));
                const result2s = this._LBCF2R.map(lbcf => lbcf.update(input));

                const result1 = result1s.reduce((a, b) => a+b, 0);
                const result2 = result2s.reduce((a, b) => a+b, 0);

                const lbcfResult = result1 + result2;

                const resultA = this._APF[0].update(lbcfResult);
                const resultB = this._APF[1].update(resultA);
                const resultC = this._APF[2].update(resultB);
                const resultD = this._APF[3].update(resultC);
                resultR = resultD;
            }

            // R
            let resultL : number;
            {
                const input = (inputR + inputL) * this.gain;
                const result1s = this._LBCF1L.map(lbcf => lbcf.update(input));
                const result2s = this._LBCF2L.map(lbcf => lbcf.update(input));

                const result1 = result1s.reduce((a, b) => a+b, 0);
                const result2 = result2s.reduce((a, b) => a+b, 0);

                const lbcfResult = result1 + result2;

                const resultA = this._APF[0].update(lbcfResult);
                const resultB = this._APF[1].update(resultA);
                const resultC = this._APF[2].update(resultB);
                const resultD = this._APF[3].update(resultC);
                resultL = resultD;
            }

            return [
                inputR * this.dry + this._wet1 * resultR + this._wet2 * resultL,
                inputL * this.dry + this._wet1 * resultL + this._wet2 * resultR,
            ]
        }
    }
}