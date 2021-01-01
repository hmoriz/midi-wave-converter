import { Chunk } from "./chunk";
import { Parser } from "./parser";
import { Synthesizer } from "./synthesizer";
const Chart = require('chart.js');

function getLittleEndianNumberFromUint8Array(/**@type {Uint8Array}*/data, offset, size) {
    let ret = 0;
    for (let i = 0; i < size; i++) {
        ret += data[offset + i] << (i * 8);
    }
    return ret;
}

function setLittleEndianNumberToUint8Array(/**@type {Uint8Array} */data, offset, size, value) {
    for (let i = 0; i < size; i++) {
        data.set([(value >> (i * 8)) & 0xff], offset+i);
    }
}

function makeChart(wpls) {
    const datasets = new Array();
    wpls.waveList.forEach((wpl) => {
        if (datasets.length >= 4)return;
        const segment = wpl.segmentData;
        const waveData = new Uint8Array(segment.slice(90));
        const waveValues = new Array();
        for (let i = 0; i < Math.min(waveData.length / 2, 1000); i++ ){
            let v = getLittleEndianNumberFromUint8Array(waveData, i * 2, 2);
            if (v > 32768) {
                v = -((65536 - v) & 32767);
            }
            if (v === 32768) {v = -v}
            waveValues.push(v);
        }
        datasets.push({
            label: (datasets.length + 1).toString(),
            data: waveValues,
            borderColor: `rgb(${Math.round(Math.random() * 256)}, ${Math.round(Math.random() * 256)}, ${Math.round(Math.random() * 256)})`,
            backgroundColor: "rgba(0,0,0,0)",
        })
    });
    console.log(datasets);
    const labels = new Array();
    for (let i = 0; i < 1000; i++) {
        labels.push(i.toString());
    }
    const c = new Chart(canvas, 
        {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets,
            },
            options: {
                responsive: true,
                title: {
                    display: true,
                    text: 'test',
                },
                scales: {
                    xAxes: [{
                        display: true,
                        scaleLabel: {
                            display: true,
                            labelString: 'f',
                        },
                    }],
                    yAxes: [{
                        ticks: {
                            suggestedMin: -32768,
                            suggestedMax: 32768,
                        }
                    }]
                }
            }
        }
    );
    console.log(c);
    return c;
}

/** @type {HTMLCanvasElement} */
let canvas;
async function loadFile(/** @type {Event} */ e) {
    for (let i = 0; i < e.target.files.length; i++) {
        /** @type {File} */
        const file = e.target.files[i];
        const parser = new Parser();
        const parseResult = await parser.parseFile(file);
        const {wpls, instrumentIDMap} = parseResult;

        console.log(instrumentIDMap);

        makeChart(wpls);

        instrumentIDMap.forEach((inamBankIDDataMap, id) => {
            const pElem = document.createElement('p');
            pElem.innerText = id;
            inamBankIDDataMap.forEach((bankIDDataMap, inam) => {
                const cdiv = document.createElement('div');
                cdiv.innerText = '☆ ' + inam;
                bankIDDataMap.forEach((data, bankID) => {
                    const {insChunk} = data;
                    const lart = insChunk.lart;
                    const art1Info = Synthesizer.getArt1InfoFromLarts(lart)
                    console.log(id, bankID, lart, art1Info);
                    if (art1Info && (art1Info.EG2AttackTime > 0 || art1Info.EG2DecayTime > 0 || art1Info.EG2ReleaseTime > 0)) {
                        console.log(id, inam, bankID, art1Info.EG2AttackTime, art1Info.EG2DecayTime, art1Info.EG2ReservedTime, art1Info.EG2ReleaseTime, art1Info.EG2SustainLevel, art1Info.EG2ToPitch, art1Info);
                    }
                    const button = document.createElement('button');
                    button.innerText = bankID;
                    button.addEventListener('click', () => {
                        console.log(inam, bankID, data.regionMap[69], lart?.art1List);
                        const ccdiv = document.createElement('div');
                        ccdiv.innerText = '● ' + bankID;
                        ccdiv.appendChild(document.createElement('br'));
                        Object.keys(data.regionMap).forEach((midiID) => {
                            /** @type {Chunk.RgnChunk} */
                            const regionData = data.regionMap[midiID]; // as Chunk.RgnChunk;
                            const wsmp = regionData.wsmp;
                            const wlnk = regionData.wlnk;
                            // const lart = regionData.lart;
                            // console.log(lart);
                            if (!wlnk) return;
                            const wave = {
                                id: wlnk.ulTableIndex, 
                                wData: wpls.waveList[wlnk.ulTableIndex]};
                            if (!wave.wData) return;
                            const span = document.createElement('span');
                            span.style.display = 'inline-block';
                            span.innerText = '・ ' + midiID;

                            const audio = document.createElement('audio');
                            if (wsmp) {
                                // 元のデータ
                                let segment = new Uint8Array(wave.wData.segmentData);
                                const baseID = wsmp.usUnityNote;
                                const baseFreq = parser.frequencyTable[baseID];
                                const baseBitRate = getLittleEndianNumberFromUint8Array(segment, 24, 4);

                                // waveのdata部分を抽出して変更しやすいようにInt16Array生成
                                const dataSize = getLittleEndianNumberFromUint8Array(segment, 86, 4);
                                const blockAlign = getLittleEndianNumberFromUint8Array(segment, 32, 2); // たぶん2 (16bit monoral)
                                if (blockAlign !== 2) {
                                    throw new Error("Sorry! not implemented for blockAlign ", blockAlign);
                                }
                                let waveDataSegment = new Int16Array(dataSize / blockAlign);
                                for(let i = 0; i < dataSize / blockAlign; i++) {
                                    const v = getLittleEndianNumberFromUint8Array(segment, 90 + (i * blockAlign), blockAlign);
                                    if (v > 0x8000) {
                                        v = -((0x10000 - v) & 0x7FFF);
                                    }
                                    if (v === 0x8000) {
                                        v = -0x8000;
                                    }
                                    waveDataSegment.set([v], i);
                                }

                                // ループ設定
                                if (wsmp.cSampleLoops == 1 && wsmp.waveSampleLoop.cbSize > 0) {
                                    const waveSample = wsmp.waveSampleLoop;
                                    const loopStart = waveSample.ulLoopStart;
                                    const loopLength = waveSample.ulLoopLength;
                                    // 雑に50回 or 合計5秒分くらいループさせた新wave作成 (NOTE: offsetはblockAlignを考慮させる)
                                    let sec = 5.0;
                                    if (art1Info) {
                                        sec = Math.max(sec, art1Info.EG1AttackTime + art1Info.EG1DecayTime, art1Info.EG1AttackTime + art1Info.EG1ReleaseTime);
                                    }
                                    const loopCount = Math.max(50, Math.round(sec / (loopLength / baseBitRate)));
                                    const loopBlock = waveDataSegment.slice(loopStart, loopStart + loopLength);
                                    
                                    const newWaveDataSegmentSize = (dataSize / blockAlign) + loopLength * (loopCount - 1);
                                    const newWaveDataSegment = new Int16Array(newWaveDataSegmentSize);
                                    newWaveDataSegment.set(waveDataSegment, 0);
                                    for(i = 1; i < loopCount; i++) {
                                        newWaveDataSegment.set(loopBlock, dataSize / blockAlign + (i - 1) * loopLength);
                                    }
                                    
                                    waveDataSegment = newWaveDataSegment;
                                }

                                // Hz改変
                                const altFreq = parser.frequencyTable[Number(midiID)];
                                const freqRate = altFreq / baseFreq;
                                let newWaveDataSegment = new Uint16Array(waveDataSegment.length);
                                const volumes = new Array();
                                const lfos = new Array();
                                let dx = 0; // EG2のdxを累積させる用
                                for (i = 0; i < waveDataSegment.length; i++) {
                                    const sec = i / baseBitRate;
                                    const noteSec = 2.0; // 仮値

                                    // EG2(Envelope Generator for Pitch)情報をxに雑に適用
                                    let x = i * freqRate;
                                    if (art1Info) {
                                        let ddx = 0;
                                        if (art1Info.EG2AttackTime > 0 || art1Info.EG2DecayTime > 0 || art1Info.EG2ReleaseTime > 0) {
                                            if (sec < art1Info.EG2AttackTime) {
                                                // Attack Zone
                                                if (sec === 0) {
                                                    ddx = 0
                                                } else {
                                                    ddx = art1Info.EG2ToPitch * sec / art1Info.EG2AttackTime;
                                                }
                                            } else if (sec < noteSec) {
                                                // Decay or Sustain Zone
                                                if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                    ddx = 0;
                                                } else {
                                                    if (sec === art1Info.EG2AttackTime) {
                                                        ddx = art1Info.EG2ToPitch;
                                                    } else {
                                                        ddx = art1Info.EG2ToPitch * (sec - art1Info.EG2AttackTime) / (art1Info.EG2DecayTime);
                                                    }
                                                }
                                                ddx = Math.max(ddx, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
                                            } else {
                                                // Sustain or Release Zone
                                                let dddx = art1Info.EG2ToPitch;
                                                if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                    dddx = 0;
                                                } else {
                                                    if (sec !== art1Info.EG2AttackTime) {
                                                        dddx = art1Info.EG2ToPitch * (sec - art1Info.EG2AttackTime) / (art1Info.EG2DecayTime);
                                                    }
                                                }
                                                dddx = Math.max(dddx, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
                                                if (art1Info.EG2ReleaseTime === 0) {
                                                    ddx = 0;
                                                } else {
                                                    if (sec === noteSec) {
                                                        ddx = dddx;
                                                    } else {
                                                        ddx = art1Info.EG2ToPitch * -Math.log10((sec - noteSec) / (art1Info.EG2ReleaseTime));
                                                    }
                                                }
                                                ddx = Math.min(ddx, dddx);
                                            }
                                            ddx = Math.max(0, Math.min(art1Info.EG2ToPitch, ddx));
                                        }
                                        dx += ddx / baseBitRate;
                                        //console.log(x, dx, ddx, sec, baseBitRate, art1Info.EG2ToPitch);
                                    }
                                    x += dx;
                                    let y;
                                    // TODO : 一旦「線形補間」
                                    if (Number.isInteger(x)) {
                                        y = waveDataSegment[x];
                                    } else {
                                        const x1 = Math.trunc(x);
                                        const x2 = Math.ceil(x);
                                        const y1 = waveDataSegment[x1];
                                        const y2 = waveDataSegment[x2];
                                        y = (x2 - x) * y1 + (x - x1) * y2;
                                    }
                                    // EG1(Envelope Generator for Volume)情報を反映
                                    let volume = 1.0;
                                    if (art1Info) {
                                        let decayTime = art1Info.EG1DecayTime;
                                        if (art1Info.EG1KeyToDecay > 0) {
                                            decayTime += art1Info.EG1KeyToDecay * (Number(midiID) / 128);
                                        }
                                        if (sec < art1Info.EG1AttackTime) {
                                            // Attack Zone
                                            volume = sec / art1Info.EG1AttackTime;
                                        } else if (sec < noteSec) {
                                            // Decay or Sustain Zone
                                            if (sec === 0 || decayTime === 0) {
                                                volume = 0;
                                            } else {
                                                if (sec === art1Info.EG1AttackTime) {
                                                    volume = 1.0;
                                                } else {
                                                    volume = -Math.log10((sec - art1Info.EG1AttackTime) / decayTime);
                                                }
                                            }
                                            volume = Math.max(volume, art1Info.EG1SustainLevel / 100.0);
                                        } else {
                                            // Sustain or Release Zone
                                            let dVolume = 1.0;
                                            if (art1Info.EG1DecayTime === 0) {
                                                dVolume = 0;
                                            } else {
                                                if (sec === art1Info.EG1AttackTime) {
                                                    dVolume = 1.0;
                                                } else {
                                                    dVolume = -Math.log10((sec - art1Info.EG1AttackTime) / decayTime);
                                                }
                                            }
                                            dVolume = Math.max(dVolume, art1Info.EG1SustainLevel / 100.0);
                                            if (art1Info.EG1ReleaseTime === 0) {
                                                volume = 0;
                                            } else {
                                                if (sec === noteSec) {
                                                    volume = dVolume;
                                                } else {
                                                    volume = -Math.log10((sec - noteSec) / (art1Info.EG1ReleaseTime));
                                                }
                                            }
                                            volume = Math.min(volume, dVolume);
                                        }
                                        volume = Math.min(1.0, Math.max(0, volume));
                                    }
                                    volumes.push(volume);
                                    // LFO情報を反映
                                    let lfo = 0;
                                    if (art1Info) {
                                        if (art1Info.LFOPitch > 0 && sec >= art1Info.LFODelay) {
                                            lfo = Math.sin((sec - art1Info.LFODelay) * Math.PI * 2 / art1Info.LFOFrequency) * (32768 * art1Info.LFOPitch);
                                            volume *= 0.5 / art1Info.LFOPitch;
                                        } 
                                    }
                                    lfos.push(lfo);
                                    newWaveDataSegment.set([Math.round((y + lfo) * volume)], i);
                                }
                                // console.log(volumes);
                                // console.log(lfos);
                                waveDataSegment = newWaveDataSegment;
                                
                                //const dataSize = getLittleEndianNumberFromUint8Array(segment, 86, 4);
                                // Int16ArrayをUint8Arrayに戻して新しいSegmentを作る
                                const newDataSize = waveDataSegment.length * 2;
                                const newWaveSize = segment.length + (newDataSize - dataSize);
                                const newSegment = new Uint8Array(newWaveSize);
                                newSegment.set(segment, 0);
                                newSegment.set(segment.slice(90 + dataSize), 90 + newDataSize);
                                setLittleEndianNumberToUint8Array(newSegment, 4, 4, newWaveSize);
                                setLittleEndianNumberToUint8Array(newSegment, 86, 4, newDataSize);
                                for (let i = 0; i < waveDataSegment.length; i++) {
                                    setLittleEndianNumberToUint8Array(newSegment, 90 + i * 2, 2, waveDataSegment[i]);
                                }

                                const newBlob = new Blob([newSegment], { type: 'audio/wav' });
                                audio.src = window.URL.createObjectURL(newBlob);
                            } else {
                                audio.src = wave.wData.wave;
                            }
                            audio.controls = true;
                            span.appendChild(audio);
                            ccdiv.appendChild(span);
                        });
                        // data.waves.forEach(wdata => {
                        //     const span = document.createElement('span');
                        //     span.style.display = 'inline-block';
                        //     span.innerHTML = '・ ' + wdata.id;
                        //     const audio = document.createElement('audio');
                        //     audio.src = wdata.wave.wave;
                        //     audio.controls = true;
                        //     span.appendChild(audio);
                        //     ccdiv.appendChild(span);
                        //     button.style.display = 'none';
                        // });
                        cdiv.appendChild(ccdiv);
                    });
                    cdiv.appendChild(button);
                });
                pElem.appendChild(cdiv);
            });
            document.body.appendChild(pElem);
        });
    }
}


function main() {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', loadFile);
    document.body.appendChild(input);

    canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 720;
    canvas.style.display = 'block';
    document.body.appendChild(canvas);
}

window.addEventListener('DOMContentLoaded', main);