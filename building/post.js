const input = document.createElement('input');
input.type = 'file';
document.body.append(input);

function waveToOGG(/**@type {Uint8Array}*/array, /**@type {(value:any)=>void}*/ done, loopStart, loopLength) {
    const segments = Math.ceil(array.byteLength / 16384);
    const segmentDiversion = 100;
    const pieceSegments = Math.trunc(segments / segmentDiversion);
    const lastSegments = segments % segmentDiversion;
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
            const uint8Array = Uint8Array.from(window.oggData);
            const blob = new Blob([uint8Array]);
            const url = window.URL.createObjectURL(blob);
            const audio = document.createElement('audio');
            audio.src = url;
            audio.controls = true;
            audio.loop = true;
            document.body.appendChild(audio);
            if (loopStart >= 0 && loopLength >= 0) {
                let timeout;
                audio.ontimeupdate = (ev) => {
                    if (Number(ev.target.currentTime) >= (loopStart + loopLength) / 44100) {
                        ev.target.currentTime = loopStart / 44100;
                    }
                    if ((loopStart + loopLength) / 44100 >= ev.target.duration && ev.target.currentTime >= ev.target.duration - 0.3) {
                        if (timeout) {
                            clearTimeout(timeout);
                            timeout = 0;
                        } else {
                            timeout = setTimeout(() => {
                                ev.target.currentTime = loopStart / 44100;
                            }, 100);
                        }
                    }
                }
            }
            if (done) {
                done();
            }
        }
    }
    subProcess(0);
}

input.onchange = (e) => {
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

const pElement0 = document.createElement('p');
pElement0.appendChild(document.createTextNode('MIDI -> WAVE -> OGG'));
const input2 = document.createElement('input');
input2.type = 'file';
pElement0.appendChild(input2);

let dlsResult;
input2.onchange = async (e) => {
    dlsResult = await main.loadDLSFile(e);
}

const input3 = document.createElement('input');
input3.type = 'file';
pElement0.appendChild(input3);

input3.onchange = async (e) => {
    console.log(dlsResult);
    const result = await main.loadMIDIFile(e, dlsResult);
    if (document.getElementById('withEffect').checked) {
        waveToOGG(result.waveSegmentWithEffect, null, result.loopStartOffset, result.loopLength);
    } else {
        waveToOGG(result.waveSegment, null, result.loopStartOffset, result.loopLength);
    }
}

document.body.appendChild(pElement0);

const pElement = document.createElement('p');
pElement.id = 'audioarea';
document.body.appendChild(pElement);

const pElement2 = document.createElement('p');
pElement2.id = 'inputarea';
document.body.appendChild(pElement2);

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