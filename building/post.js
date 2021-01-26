const inputWave = document.createElement('input');
inputWave.type = 'file';
document.getElementById('wavearea').append(inputWave);

function waveToOGG(/**@type {Uint8Array}*/array, /**@type {(value:any)=>void}*/ done, loopStart, loopLength) {
    const segments = Math.ceil(array.byteLength / 16384);
    const segmentDiversion = 100;
    const pieceSegments = Math.trunc(segments / segmentDiversion);
    const lastSegments = segments % segmentDiversion;
    const sampleRate = array[24] + (array[25] << 8) + (array[26] << 16) + (array[27] << 24);
    console.log(segments, pieceSegments, lastSegments, loopStart, loopLength);
    const subProcess = (j) => {
        for (let i = 0; i < ((j === pieceSegments) ? lastSegments : segmentDiversion); i++) {
            const array1 = Uint8Array.from(array.slice((j * segmentDiversion + i) * 16384, (j * segmentDiversion + i + 1) * 16384));
            ccall("addReadBuffer", "null", ['array', 'number'], [array1, array1.length]);
        }
        ccall("waveToOGGVorbis", 'null', ['number', 'number', 'string', 'string'], [j === 0 ? 1 : 0, j == pieceSegments ? 1 : 0, loopStart >= 0 ? loopStart.toString() : null, loopLength >= 0 ? loopLength.toString() : null]);
        ccall("clearReadBuffer", "null", ["null"], []);
        if (!(j === pieceSegments)) {
            setTimeout(() => subProcess(j+1), 10);
        } else {
            // audio
            const audioContext = new AudioContext();
            const uint8Array = Uint8Array.from(window.oggData);
            const buffer = uint8Array.buffer;
            audioContext.decodeAudioData(buffer, (aBuffer) => {
                if (done) {
                    done();
                }
                const buttonStart = document.createElement('button');
                buttonStart.innerText = 'loop再生';
                /** @type {AudioBufferSourceNode} */
                let audioSource;
                buttonStart.onclick = () => {
                    if (audioSource) return;
                    audioSource = audioContext.createBufferSource();
                    audioSource.buffer = aBuffer;
                    audioSource.connect(audioContext.destination);
                    audioSource.loop = true;
                    if (loopStart >= 0 && loopLength >= 0) {
                        audioSource.loopStart = loopStart / sampleRate;
                        audioSource.loopEnd = (loopStart + loopLength) / sampleRate;
                    }
                    audioSource.start(0, 0);
                }
                document.getElementById("oggarea").appendChild(buttonStart);
                const buttonStop = document.createElement('button');
                buttonStop.innerText = '停止';
                buttonStop.onclick = () => {
                    if (audioSource) {
                        audioSource.stop();
                    }
                }
                document.getElementById("oggarea").appendChild(buttonStop);
            });
            const audio = document.createElement('audio');
            const blob = new Blob([Uint8Array.from(window.oggData)]);
            audio.src = window.URL.createObjectURL(blob);
            audio.controls = true;
            document.getElementById("oggarea").appendChild(audio);
        }
    }
    subProcess(0);
}

inputWave.onchange = (e) => {
    for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const reader = new FileReader();
        new Promise((done) => {
            reader.onload = () => {
                if (!(reader.result instanceof ArrayBuffer))return;
                const array = new Uint8Array(reader.result);
                waveToOGG(array, done, null, null);
            }
            reader.readAsArrayBuffer(file);
        });
    }
}

const main = require('./index.ts');

const midiElement = document.getElementById('midiarea');
const inputDLS = document.createElement('input');
inputDLS.type = 'file';
midiElement.appendChild(inputDLS);

let dlsResult;
inputDLS.onchange = async (e) => {
    dlsResult = await main.loadDLSFile(e);
}

const inputMIDI = document.createElement('input');
inputMIDI.type = 'file';
midiElement.appendChild(inputMIDI);

inputMIDI.onchange = async (e) => {
    console.log(dlsResult);
    Module.setStatus('midi -> wave converting');
    const result = await main.loadMIDIFile(e, dlsResult);
    Module.setStatus('wave -> ogg converting');
    if (document.getElementById('withEffect').checked) {
        waveToOGG(result.waveSegmentWithEffect, () => Module.setStatus(''), result.loopStartOffset, result.loopLength);
    } else {
        waveToOGG(result.waveSegment, () => Module.setStatus(''), result.loopStartOffset, result.loopLength);
    }
}

const div4 = document.createElement('div');
div4.appendChild(document.createTextNode("output by channel"));
const input4 = document.createElement('input');
input4.id = "outputChannelCheck";
input4.type = "checkbox";
div4.appendChild(input4);
document.getElementById('inputarea').appendChild(div4);
const div5 = document.createElement('div');
div5.appendChild(document.createTextNode("enable effect"));
const input5 = document.createElement('input');
input5.id = "withEffect";
input5.type = "checkbox";
input5.checked = true;
div5.appendChild(input5);
document.getElementById('inputarea').appendChild(div5);
const div6 = document.createElement('div');
div6.appendChild(document.createTextNode("sample rate"));
const select = document.createElement('select');
select.id = "byteRate";
[0.1, 0.25, 0.5, 1, 1.5, 2].forEach((num) => {
    const byteRate = num * 44100;
    const option = document.createElement('option');
    option.value = byteRate.toString()
    option.text = `${byteRate} Hz`;
    select.appendChild(option);
    if (byteRate === 44100) {
        option.selected = true;
    }
});
div6.appendChild(select);
document.getElementById('inputarea').appendChild(div6);