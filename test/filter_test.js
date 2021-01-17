import { DFT } from '../dft';
import { Filter } from '../filter';

const num = 100000;

const N = 1573;
const f = 0.84;
const d = 0.20;
const gL = new Array(num).fill(0, 0, num).map((y, x) => 0);
const gR = new Array(num).fill(0, 0, num).map((y, x) => 0);
gL[0] = 1;
gR[0] = 1;

const g2 = [new Array(), new Array()];
const c = new Filter.FeedbackCombFilter(f, d, N);
let outputText = "";
for (let i = 0; i < num; i++) {
    //[g2[0][i], g2[1][i]] = c.update(gR[i], gL[i]);
    g2[0][i] = c.update(gL[i]);
    outputText += `${i} ${gL[i]} ${g2[0][i]} \n`;
}
console.log("output", outputText)

const FFTresult1 = DFT.realFFT(gL.slice(0, 65536));
const FFTresult2 = DFT.realFFT(g2[0].slice(0, 65536));
console.log(FFTresult2);
outputText = "";
FFTresult1.forEach((f, i) => {
    outputText += `${i} ${((f.real ** 2) + (f.imaginary ** 2)) ** 0.5} ${((FFTresult2[i].real ** 2) + (FFTresult2[i].imaginary ** 2)) ** 0.5}\n`;
});
console.log("FFT", outputText);


console.log(JSON.stringify(gL.slice(90000)));
console.log(JSON.stringify(g2.slice(90000)));