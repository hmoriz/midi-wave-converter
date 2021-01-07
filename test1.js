import { DLS } from "./chunk";
import { DLSParser, getFrequencyFromNoteID, ParseResult as DLSParseResult } from "./dls";
import { MIDIParser } from "./midi";
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
    const labels = new Array();
    for (let i = 0; i < 100000; i++) {
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
    window.c = c;
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
        addChart(c, waveValues)
    });
    console.log(c);
    return c;
}

function addChart(/** @type {Chart} */c, dataArray) {
    c.data.datasets.push({
        label: (c.data.datasets.length + 1).toString(),
        data: dataArray,
        borderColor: `rgb(${Math.round(Math.random() * 256)}, ${Math.round(Math.random() * 256)}, ${Math.round(Math.random() * 256)})`,
        backgroundColor: "rgba(0,0,0,0)",
    });
    c.update();
}

function addChartFromUint8ToInt16(/** @type {Chart} */c, /** @type {Uint8Array} */ dataArray) {
    const newArray = new Array();
    for (let i = 0; i < dataArray.length / 2; i++) {
        let v = getLittleEndianNumberFromUint8Array(dataArray, i * 2, 2);
        if (v > 32768) {
            v = -((65536 - v) & 32767);
        }
        if (v === 32768) {v = -v}
        newArray.push(v);
    }
    addChart(c, newArray);
}

/** @type {HTMLCanvasElement} */
let canvas;
/** @type {DLSParseResult} */
let dlsParseResult;
async function loadDLSFile(/** @type {Event} */ e) {
    for (let i = 0; i < e.target.files.length; i++) {
        /** @type {File} */
        const file = e.target.files[i];
        const parser = new DLSParser();
        const parseResult = await parser.parseFile(file);
        dlsParseResult = parseResult;
        const {wpls, instrumentIDNameBankMap, instrumentIDMap} = parseResult;

        console.log(instrumentIDMap);

        makeChart(wpls);

        instrumentIDNameBankMap.forEach((inamBankIDDataMap, id) => {
            const pElem = document.createElement('p');
            pElem.innerText = id;
            inamBankIDDataMap.forEach((bankIDDataMap, inam) => {
                const cdiv = document.createElement('div');
                cdiv.innerText = '☆ ' + inam;
                bankIDDataMap.forEach((data, bankID) => {
                    const {insChunk} = data;
                    const lart = insChunk.lart;
                    const art1Info = Synthesizer.getArt1InfoFromLarts(lart)
                    console.log(id, bankID, insChunk, lart, art1Info);
                    if (art1Info && (art1Info.EG2AttackTime > 0 || art1Info.EG2DecayTime > 0 || art1Info.EG2ReleaseTime > 0)) {
                        console.log(id, inam, bankID, art1Info.EG2AttackTime, art1Info.EG2DecayTime, art1Info.EG2ReservedTime, art1Info.EG2ReleaseTime, art1Info.EG2SustainLevel, art1Info.EG2ToPitch, art1Info);
                    }
                    const button = document.createElement('button');
                    button.innerText = bankID;
                    button.addEventListener('click', () => {
                        const ccdiv = document.createElement('div');
                        ccdiv.innerText = '● ' + bankID;
                        ccdiv.appendChild(document.createElement('br'));
                        data.regionMap.forEach((velocityRegionDataMap, noteID) => {
                            const regionData = velocityRegionDataMap.get(100); // 数が多すぎるので
                            const wsmp = regionData.wsmp;
                            const wlnk = regionData.wlnk;
                            // const lart = regionData.lart;
                            // console.log(lart);
                            if (!wlnk) return;
                            const wave = {
                                id: wlnk.ulTableIndex,
                                wData: data.waves.get(wlnk.ulTableIndex),
                            }
                            const span = document.createElement('span');
                            span.style.display = 'inline-block';
                            span.innerText = '・ ' + noteID;

                            const audio = document.createElement('audio');
                            if (wsmp) {
                                // 元のデータ
                                let segment = new Uint8Array(wave.wData.segmentData);
                                const baseID = wsmp.usUnityNote;
                                const baseFreq = getFrequencyFromNoteID(baseID);
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
                                const altFreq = getFrequencyFromNoteID(noteID);
                                const freqRate = altFreq / baseFreq;
                                let newWaveDataSegment = new Uint16Array(waveDataSegment.length);
                                let lastX = 0;
                                let sampleOffsetSpeedGain = 0; // EG2のdxを累積させる用
                                let minY = -1;
                                let maxY = 1;
                                for (i = 0; i < waveDataSegment.length; i++) {
                                    const sec = i / baseBitRate;
                                    const noteSec = 2.0; // 仮値

                                    // EG2(Envelope Generator for Pitch)情報をxに雑に適用
                                    let nextSampleOffsetSpeedGain = sampleOffsetSpeedGain;
                                    if (art1Info) {
                                        let sampleOffsetSpeedCents = 0;
                                        if (art1Info.EG2ToPitch > 0) {
                                            if (art1Info.EG2AttackTime > 0 || art1Info.EG2DecayTime > 0 || art1Info.EG2ReleaseTime > 0) {
                                                if (sec < art1Info.EG2AttackTime) {
                                                    // Attack Zone
                                                    if (sec === 0) {
                                                        sampleOffsetSpeedCents = 0
                                                    } else {
                                                        sampleOffsetSpeedCents = art1Info.EG2ToPitch * sec / art1Info.EG2AttackTime;
                                                    }
                                                } else if (sec < noteSec) {
                                                    // Decay or Sustain Zone
                                                    if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                        sampleOffsetSpeedCents = 0;
                                                    } else {
                                                        if (sec === art1Info.EG2AttackTime) {
                                                            sampleOffsetSpeedCents = art1Info.EG2ToPitch;
                                                        } else {
                                                            sampleOffsetSpeedCents = art1Info.EG2ToPitch * (sec - art1Info.EG2AttackTime) / (art1Info.EG2DecayTime);
                                                        }
                                                    }
                                                    sampleOffsetSpeedCents = Math.max(sampleOffsetSpeedCents, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
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
                                                        sampleOffsetSpeedCents = 0;
                                                    } else {
                                                        if (sec === noteSec) {
                                                            sampleOffsetSpeedCents = dddx;
                                                        } else {
                                                            sampleOffsetSpeedCents = art1Info.EG2ToPitch * (sec - noteSec) / (art1Info.EG2ReleaseTime);
                                                        }
                                                    }
                                                    sampleOffsetSpeedCents = Math.min(sampleOffsetSpeedCents, dddx);
                                                }
                                                // ddx : cent単位
                                                sampleOffsetSpeedCents = Math.max(0, Math.min(art1Info.EG2ToPitch, sampleOffsetSpeedCents));
                                            }
                                        }
                                        // LFO情報もpositionDXに適用 (cent単位)
                                        let lfo = 0;
                                        if (art1Info.LFOToPitch > 0) {
                                            // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                                            if (sec >= art1Info.LFODelay) {
                                                lfo = -Math.sin((sec - art1Info.LFODelay) * Math.PI * 2 * art1Info.LFOFrequency) * art1Info.LFOToPitch;
                                            }
                                        }
                                        sampleOffsetSpeedCents += lfo;
                                        // Key Number To Pitch もpositionDXに反映 (cent単位)
                                        let keyNumberToPitch = 0;
                                        if (art1Info.KeyNumberToPitch > 0) {
                                            keyNumberToPitch = art1Info.KeyNumberToPitch * (noteID / 128);
                                        }
                                        sampleOffsetSpeedCents += keyNumberToPitch;
                                        if (wsmp) {
                                            // sFineTune を加味 (NOTE : DLSの仕様では65536で割るべきっぽいけどgm.dlsのfineTuneの内容的に行わない)
                                            sampleOffsetSpeedCents += wsmp.sFineTune;
                                        }
                                        // dx : 増加率 (0は等倍, 1につき1オクターブ)
                                        nextSampleOffsetSpeedGain = (2 ** (sampleOffsetSpeedCents / 1200)) - 1.0;
                                        if (sec <= 3 && i % 10000 === 0)
                                            console.log(noteID, i, x, sec, freqRate, lastX, nextSampleOffsetSpeedGain, sampleOffsetSpeedCents, art1Info.LFOToPitch);
                                    }
                                    let x = lastX + freqRate * (1.0 + nextSampleOffsetSpeedGain);
                                    sampleOffsetSpeedGain = nextSampleOffsetSpeedGain;
                                    lastX = x;
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
                                    let dAttenuation = 96;
                                    let eg1Attenuation = 96;
                                    if (art1Info) {
                                        let attackTime = art1Info.EG1AttackTime;
                                        if (art1Info.EG1VelocityToAttack > 0) {
                                            attackTime -= Synthesizer.getSecondsFromArt1Scale(art1Info.EG1VelocityToAttack * (100 / 128));
                                        }
                                        let decayTime = art1Info.EG1DecayTime;
                                        if (art1Info.EG1KeyToDecay > 0) {
                                            decayTime += Synthesizer.getSecondsFromArt1Scale(art1Info.EG1KeyToDecay * (noteID / 128));
                                        }
                                        if (sec < attackTime) {
                                            // Attack Zone
                                            eg1Attenuation = Math.min(96, sec === 0 ? 96 : 20 * Math.log10(attackTime / sec));
                                        } else if (sec < noteSec) {
                                            // Decay or Sustain Zone
                                            if (sec === 0 || decayTime === 0) {
                                                eg1Attenuation = 96;
                                            } else {
                                                if (sec === attackTime) {
                                                    eg1Attenuation = 0;
                                                } else {
                                                    eg1Attenuation = 96 * (sec - attackTime) / decayTime;
                                                }
                                            }
                                            eg1Attenuation = Math.min(eg1Attenuation, 96 * (1 - art1Info.EG1SustainLevel / 100.0));
                                        } else {
                                            // Sustain or Release Zone
                                            if (sec === 0 || decayTime === 0) {
                                                dAttenuation = 96;
                                            } else {
                                                if (sec === attackTime) {
                                                    dAttenuation = 0;
                                                } else {
                                                    dAttenuation = 96 * (sec - attackTime) / decayTime;
                                                }
                                            }
                                            dAttenuation = Math.min(dAttenuation, 96 * (1 - art1Info.EG1SustainLevel / 100.0));
                                            if (art1Info.EG1ReleaseTime === 0) {
                                                eg1Attenuation = 96;
                                            } else {
                                                if (sec === noteSec) {
                                                    eg1Attenuation = dAttenuation;
                                                } else {
                                                    eg1Attenuation = 96 * (sec - noteSec) / art1Info.EG1ReleaseTime;
                                                }
                                            }
                                            eg1Attenuation = Math.max(eg1Attenuation, dAttenuation);
                                        }
                                        eg1Attenuation = Math.min(96, Math.max(0, eg1Attenuation));
                                        //if (Math.abs(sec-noteSec) <= 1.0) console.log(offset, channelID, noteID, sec, sec-noteSec, sec <= attackTime, sec-noteSec <= 0, eg1Attenuation, dAttenuation, attackTime, art1Info.EG1AttackTime, art1Info.EG1VelocityToAttack);
                                    }
                                    // LFO情報を反映
                                    let lfo = 0;
                                    let lfoAttenuation = 0;
                                    if (art1Info) {
                                        if (art1Info.LFOToVolume > 0) {
                                            // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                                            if (sec >= art1Info.LFODelay) {
                                                lfo = Math.sin((sec - art1Info.LFODelay) * Math.PI * 2 / art1Info.LFOFrequency) * art1Info.LFOToVolume;
                                                lfoAttenuation = lfo;
                                            }
                                        } 
                                    }
                                    // WSMPのAttenuationを加味
                                    let wsmpAttenuation = 0;
                                    if (wsmp) {
                                        if (wsmpAttenuation === 0x80000000) {
                                            y = 0;
                                        }
                                        wsmpAttenuation = wsmp.lAttenuation / 65536 / 40;
                                    }
                                    y = (y * (0.1 ** ((Math.max(0, eg1Attenuation + wsmpAttenuation + lfoAttenuation)) / 20))) * (90.0 / 100.0);
                                    // if (sec <= 3.0 && i % 1000 === 0) {
                                    //     console.log(noteID, i, sec, x, y, eg1Attenuation, wsmpAttenuation, lfoAttenuation, 0.1 ** ((Math.max(0, eg1Attenuation + wsmpAttenuation + lfoAttenuation)) / 20));
                                    // }

                                    newWaveDataSegment.set([y], i);
                                    minY = Math.min(minY, y);
                                    maxY = Math.max(y, maxY);
                                }
                                waveDataSegment = newWaveDataSegment;

                                const compressMax = Math.abs(maxY) / 32767;
                                const compressMin = Math.abs(minY) / 32767;
                                const compress = Math.max(compressMax, compressMin);
                                if (compress>= 1) {
                                    for (let i = 0; i < waveDataSegment.length; i++) {
                                        waveDataSegment.set([Math.round(waveDataSegment[i] / compress * 0.9)], i);
                                    }
                                }
                                
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

async function loadMIDIFile(/** @type {Event} */ e) {
    for (let i = 0; i < e.target.files.length; i++) {
        /** @type {File} */
        const file = e.target.files[i];
        const parser = new MIDIParser();
        const parseResult = await parser.parseFile(file);
        console.log(parseResult);
        const synthesizeResult = Synthesizer.synthesizeMIDI(parseResult, dlsParseResult);
        const blob = new Blob([synthesizeResult.waveSegment]);
        const url = window.URL.createObjectURL(blob);
        const newAudio = document.createElement('audio');
        newAudio.src = url;
        newAudio.controls = true;
        document.getElementById("audioarea").appendChild(newAudio);
        synthesizeResult.channelToWaveSegment.forEach((waveSegment, channelID) => {
            const div = document.createElement('div');
            div.innerText = `● ${channelID} :   `;
            const blob = new Blob([waveSegment]);
            const url = window.URL.createObjectURL(blob);
            const channelAudio = document.createElement('audio');
            channelAudio.src = url;
            channelAudio.controls = true;
            div.appendChild(channelAudio)
            document.getElementById("audioarea").appendChild(div);       
        })
        addChartFromUint8ToInt16(window.c, synthesizeResult.waveSegment.slice(130000, 350000));
    }
}

function main() {
    const div1 = document.createElement('div');
    div1.innerText = 'gm.dls    ';
    const input = document.createElement('input');
    input.type = 'file';
    input.placeholder = 'gm.dls';
    input.accept = 'dls';
    input.addEventListener('change', loadDLSFile);
    div1.appendChild(input);
    document.getElementById('inputarea').appendChild(div1);

    const div2 = document.createElement('div');
    div2.innerText = 'any midi file (*.mid)    ';
    const input2 = document.createElement('input');
    input2.type = 'file';
    input2.accept = 'mid';
    input2.addEventListener('change', loadMIDIFile);
    div2.appendChild(input2);
    document.getElementById('inputarea').appendChild(div2);

    canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 720;
    canvas.style.display = 'block';
    document.body.appendChild(canvas);
}

window.addEventListener('DOMContentLoaded', main);