import { Chunk } from "./chunk";
import { Parser } from "./parser";
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

        instrumentIDMap.forEach((inamBankIDDataMap, id) => {
            const pElem = document.createElement('p');
            pElem.innerText = id;
            inamBankIDDataMap.forEach((bankIDDataMap, inam) => {
                const cdiv = document.createElement('div');
                cdiv.innerText = '☆ ' + inam;
                bankIDDataMap.forEach((data, bankID) => {
                    const {insChunk} = data;
                    const lart = insChunk.lart;
                    const art1 = lart?.art1List;
                    const button = document.createElement('button');
                    button.innerText = bankID;
                    button.addEventListener('click', () => {
                        console.log(inam, bankID, data.regionMap[69], art1);
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
                                    //const dataSize = getLittleEndianNumberFromUint8Array(segment, 86, 4);
                                    //const blockAlign = getLittleEndianNumberFromUint8Array(segment, 32, 2); // たぶん2 (16bit monoral)
                                    // 雑に50回ループさせた新wave作成 (NOTE: offsetはblockAlignを考慮させる)
                                    const loopCount = 50;
                                    const loopBlock = waveDataSegment.slice(loopStart, loopStart + loopLength);
                                    
                                    const newWaveDataSegmentSize = (dataSize / blockAlign) + loopLength * (loopCount - 1);
                                    const newWaveDataSegment = new Int16Array(newWaveDataSegmentSize);
                                    newWaveDataSegment.set(waveDataSegment, 0);
                                    for(i = 1; i < loopCount; i++) {
                                        newWaveDataSegment.set(loopBlock, dataSize / blockAlign + (i - 1) * loopLength);
                                    }
                                    
                                    waveDataSegment = newWaveDataSegment;
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

                                // Hz改変(仮)
                                // nSamplesPerSec 部分を改竄
                                const altFreq = parser.frequencyTable[Number(midiID)];
                                const freqRate = altFreq / baseFreq;
                                const newBitRate = baseBitRate * freqRate;
                                setLittleEndianNumberToUint8Array(newSegment, 24, 4, newBitRate);

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