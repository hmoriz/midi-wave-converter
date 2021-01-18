import { DFT } from '../dft';
import { Filter } from '../filter';

abstract class FilterTester {
    protected readonly _button : HTMLButtonElement;
    protected readonly _num : number;

    constructor(button : HTMLButtonElement, num : number) {
        this._button = button;
        this._num = num;
        this._button.onclick = () => {this._impulse()};
    }

    _impulse() {
    }
}

class FeedbackCombFilterTester extends FilterTester {
    private _filter : Filter.FeedbackCombFilter;
    private _callback : (s : [string, string]) => void;

    private _g : Array<number>;
    constructor(button : HTMLButtonElement, num : number, N : number, f : number, d : number, callback : (s : [string, string]) => void) {
        super(button, num);
        this._filter = new Filter.FeedbackCombFilter(f, d, N);
        this._callback = callback;

        this._g = new Array(num);
    }

    _impulse()  {
        this._g.fill(0, 0, this._num).map((y, x) => 0);
        this._g[0] = 1;
        const g2 = new Array();
        let outputText = "";
        for(let i = 0; i < this._num; i++) {
            g2[i] = this._filter.update(this._g[i]);
            outputText += `${i} ${g2[i]} \n`;
        }
        const fftSize = 2 ** (Math.floor(Math.log2(this._num)));
        const FFTresult = DFT.realFFT(g2.slice(0, fftSize));
        let outputTextFFT = "";
        FFTresult.forEach((f, i) => {
            outputTextFFT += `${i} ${((f.real ** 2) + (f.imaginary ** 2)) ** 0.5}\n`;
        });
        this._callback([outputText, outputTextFFT]);
    }
}

function main() {
    const num = 131072;
    
    const N = 1573;
    const f = 0.84;
    const d = 0.20;
    
    const textarea1 = document.createElement('textarea');
    textarea1.cols = 50;
    textarea1.rows = 50;
    const textarea2 = document.createElement('textarea');
    textarea2.cols = 50;
    textarea2.rows = 50;
    const button = document.createElement('button');
    button.innerText = "CombFilterTest";
    document.body.appendChild(textarea1);
    document.body.appendChild(textarea2);
    document.body.appendChild(button);
    
    new FeedbackCombFilterTester(button, num, N, f, d, (result) => {
        textarea1.value = result[0];
        textarea2.value = result[1];
    });
}

window.addEventListener('DOMContentLoaded', main);