const Chart = require('chart.js');
import { DFT } from '../dft';
import { Synthesizer } from '../synthesizer';

const num = 100000;

const N = 1573;
const f = 0.84;
const d = 0.20;
const g = new Array(num).fill(0, 0, num).map((y, x) => 0);
g[0] = 1;

const g2 = new Array(num);
const c = new Synthesizer.Reverber();
let outputText = "";
for (let i = 0; i < num; i++) {
    g2[i] = c.update(g[i]);
    outputText += `${i} ${g[i]} ${g2[i]} \n`;
}
console.log("output", outputText)

const FFTresult1 = DFT.realFFT(g.slice(0, 65536));
const FFTresult2 = DFT.realFFT(g2.slice(0, 65536));
console.log(FFTresult2);
outputText = "";
FFTresult1.forEach((f, i) => {
    outputText += `${i} ${((f.real ** 2) + (f.imaginary ** 2)) ** 0.5} ${((FFTresult2[i].real ** 2) + (FFTresult2[i].imaginary ** 2)) ** 0.5}\n`;
});
console.log("FFT", outputText);


console.log(JSON.stringify(g.slice(90000)));
console.log(JSON.stringify(g2.slice(90000)));