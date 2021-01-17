export namespace DFT {

    export class Complex {
        readonly real : number;
        readonly imaginary : number;

        constructor(real : number, imaginary : number) {
            this.real = real;
            this.imaginary = imaginary;
        }

        static FromExp(theta : number) : Complex {
            return new Complex(Math.cos(theta), Math.sin(theta))
        }

        static Sum(complexes : Array<Complex>) {
            let ret = new Complex(0, 0);
            complexes.forEach(complex => ret = ret.add(complex));
            return ret;
        }

        add(other : Complex) : Complex {
            const real = this.real + other.real;
            const imaginary = this.imaginary + other.imaginary;
            return new Complex(real, imaginary);
        }

        sub(other : Complex) : Complex {
            const real = this.real - other.real;
            const imaginary = this.imaginary - other.imaginary;
            return new Complex(real, imaginary);
        }

        mul(other : Complex) : Complex {
            const real = this.real * other.real - this.imaginary * other.imaginary;
            const imaginary = this.real * other.imaginary + this.imaginary * other.real;
            return new Complex(real, imaginary);
        }
    }

    export function realDFT(f : Array<number>) : Array<Complex>{
        return dft(f.map(r => new Complex(r, 0)));
    }

    // 雑にフーリエ変換
    function dft(f : Array<Complex>) : Array<Complex>{
        const N = f.length, T = -2 * Math.PI / N;
        const r = (new Array(N)).fill(0).map((_, k) => Complex.Sum(
            f.map((fn, n) => Complex.FromExp(T * n * k).mul(fn))
        ));
        return r;
    }

    // 雑にフーリエ逆変換
    export function idft(f : Array<Complex>) : Array<Complex>{
        const N = f.length, T = 2 * Math.PI / N;
        const r = (new Array(N)).fill(0).map((_, k) => Complex.Sum(
            f.map((fn, n) => Complex.FromExp(T * n * k).mul(fn).mul(new Complex(1/N, 0)))
        ));
        return r;
    }

    // 雑にフーリエ変換その2
    export function fft(f : Array<Complex>) : Array<Complex> {
        if (f.length % 2 !== 0) return dft(f);
        const arr = (new Array(f.length)).fill(0).map((_, k) => k);
        // 配列fを2つの配列に分ける
        const arr0 = arr.filter(n => n % 2 === 0).map(n => f[n]);
        const arr1 = arr.filter(n => n % 2 === 1).map(n => f[n]);
        // 2つの要素をそれぞれフーリエ変換
        const dft0 = fft(arr0);
        const dft1 = fft(arr1);
        // いい感じに足す
        return arr.map(n => dft0[n % (arr.length/2)].add(Complex.FromExp(-n * 2 * Math.PI / arr.length).mul(dft1[n % (arr.length/2)])));
    }

        // 雑に逆フーリエ変換その2
        export function ifft(F : Array<Complex>) : Array<Complex> {
            F.map(c => new Complex(c.real, -c.imaginary));
            const result = fft(F);
            return result.map(c => new Complex(c.real, -c.imaginary).mul(new Complex(1/F.length, 0)));
        }

    export function realFFT(f: Array<number>) : Array<Complex> {
        if (f.length >= 512 && f.length % 2 !== 0) {
            return fft(f.map(n => new Complex(n, 0)).slice(0, f.length-1));
        }
        return fft(f.map(n => new Complex(n, 0)));
    }
}
