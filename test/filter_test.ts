import { DFT } from '../dft';
import { Filter } from '../filter';

abstract class FilterTester {
    protected readonly _num : number;

    protected readonly _filter : Filter.FeedbackCombFilter | Filter.AllpassFilter;
    protected readonly _callback : (s : [string, string]) => void;

    protected readonly _g : Array<number>;

    constructor(buttonImpluse : HTMLButtonElement, buttonSineCurve : HTMLButtonElement, inputSineFrequency : HTMLInputElement, num : number, 
            filter: Filter.FeedbackCombFilter | Filter.AllpassFilter, 
            callback : (s : [string, string]) => void) {
        this._num = num;
        buttonImpluse.onclick = () => {
            this._setupForImpulse();
            this._processClick();
        };
        buttonSineCurve.onclick = () => {
            const freq = Number(inputSineFrequency.value) || 100;
            this._setupForSignCurve(num / freq);
            this._processClick();
        }
        this._filter = filter;
        this._callback = callback;
        this._g = new Array<number>(num);
    }

    protected _setupForImpulse() {
        this._g.fill(0, 0, this._num);
        this._g[0] = 1;
    }

    protected _setupForSignCurve(t : number) {
        this._g.fill(0, 0, this._num)
        for (let i = 0; i < this._num; i++) {
            this._g[i] = Math.sin(i * 2 * Math.PI / t);
        }
    }

    protected _processClick() {
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

class FeedbackCombFilterTester extends FilterTester {
    constructor(buttonImpulse : HTMLButtonElement, buttonSine : HTMLButtonElement, inputSFreq : HTMLInputElement, num : number, N : number, f : number, d : number, callback : (s : [string, string]) => void) {
        super(buttonImpulse, buttonSine, inputSFreq, num, new Filter.FeedbackCombFilter(f, d, N), callback);
    }
}

class AllPassFilterTester extends FilterTester {
    constructor(buttonImpulse : HTMLButtonElement, buttonSine : HTMLButtonElement, inputSFreq : HTMLInputElement, num : number, D : number, a : number, callback : (s : [string, string]) => void) {
        super(buttonImpulse, buttonSine, inputSFreq, num, new Filter.AllpassFilter(a, D), callback);
    }
}

function main() {
    const num = 131072;

    const textarea1 = document.createElement('textarea');
    textarea1.cols = 50;
    textarea1.rows = 50;
    const textarea2 = document.createElement('textarea');
    textarea2.cols = 50;
    textarea2.rows = 50;
    document.body.appendChild(textarea1);
    document.body.appendChild(textarea2);
    const frequencyInput = document.createElement('input');
    frequencyInput.type = 'number';
    frequencyInput.value = "128";
    frequencyInput.min = "1";
    frequencyInput.max = num.toString();
    document.body.appendChild(frequencyInput);

    const N = 1573;
    const f = 0.84;
    const d = 0.20;

    const buttonI1 = document.createElement('button');
    buttonI1.innerText = "CombFilterImpulseTest";
    document.body.appendChild(buttonI1);
    const buttonS1 = document.createElement('button');
    buttonS1.innerText = "CombFilterSineCurveTest";
    document.body.appendChild(buttonS1);

    new FeedbackCombFilterTester(buttonI1, buttonS1, frequencyInput, num, N, f, d, (result) => {
        textarea1.value = result[0];
        textarea2.value = result[1];
    });

    const D = 225;
    const a = 0.5;
    
    const buttonI2 = document.createElement('button');
    buttonI2.innerText = "AllPassFilterImpulseTest";
    document.body.appendChild(buttonI2);
    const buttonS2 = document.createElement('button');
    buttonS2.innerText = "AllPassFilterSineCurveTest";
    document.body.appendChild(buttonS2);
    
    new AllPassFilterTester(buttonI2, buttonS2, frequencyInput, num, D, a, (result) => {
        textarea1.value = result[0];
        textarea2.value = result[1];
    });
}

window.addEventListener('DOMContentLoaded', main);