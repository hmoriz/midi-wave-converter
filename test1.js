import { Parser } from "./parser";

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

/** @type {HTMLTextAreaElement} */
let textarea;
async function loadFile(/** @type {Event} */ e) {
    for (let i = 0; i < e.target.files.length; i++) {
        /** @type {File} */
        const file = e.target.files[i];
        const parser = new Parser();
        const parseResult = await parser.parseFile(file);
        const {wpls, instrumentIDMap} = parseResult;

        console.log(instrumentIDMap);
        for (let id in instrumentIDMap) {
            const inamBankIDDataMap = instrumentIDMap[id];
            const pElem = document.createElement('p');
            pElem.innerText = id;
            for (let inam in inamBankIDDataMap) {
                const bankIDDataMap = inamBankIDDataMap[inam];
                const cdiv = document.createElement('div');
                cdiv.innerText = '☆ ' + inam;
                for(let bankID in bankIDDataMap) {
                    const data = bankIDDataMap[bankID];
                    const button = document.createElement('button');
                    button.innerText = bankID;
                    button.addEventListener('click', () => {
                        const ccdiv = document.createElement('div');
                        ccdiv.innerText = '● ' + bankID;
                        ccdiv.appendChild(document.createElement('br'));
                        Object.keys(data.regionMap).forEach((midiID) => {
                            const regionData = data.regionMap[midiID];
                            const wsmp = regionData.subData.subData.filter((data) => data.key === 'wsmp')[0];
                            const wlnk = regionData.subData.subData.filter((data) => data.key === 'wlnk')[0];
                            if (!wlnk) return;
                            const wave = {
                                id: wlnk.data.uTableIndex, 
                                wData: wpls[wlnk.data.uTableIndex].subData};
                            if (!wave.wData) return;
                            const span = document.createElement('span');
                            span.style.display = 'inline-block';
                            span.innerText = '・ ' + midiID;

                            const audio = document.createElement('audio');
                            if (wsmp) {
                                // Hzを変更させる(nSamplesPerSec 部分を改竄)
                                const baseID = wsmp.data.usUnityNote;
                                const baseFreq = parser.frequencyTable[baseID];
                                const altFreq = parser.frequencyTable[Number(midiID)];
                                const freqRate = altFreq / baseFreq;
                                let segment = new Uint8Array(wave.wData.segment);
                                const bitRate = getLittleEndianNumberFromUint8Array(segment, 24, 4);
                                const newBitRate = bitRate * freqRate;
                                setLittleEndianNumberToUint8Array(segment, 24, 4, newBitRate);

                                // ループ設定
                                if (wsmp.data.waveSamples && wsmp.data.waveSamples.length == 1) {
                                    const waveSample = wsmp.data.waveSamples[0];
                                    const loopStart = waveSample.uLoopStart;
                                    const loopLength = waveSample.uLoopLength;
                                    const waveSize = getLittleEndianNumberFromUint8Array(segment, 4, 4);
                                    const dataSize = getLittleEndianNumberFromUint8Array(segment, 86, 4);
                                    const blockAlign = getLittleEndianNumberFromUint8Array(segment, 32, 2); // たぶん2 (16bit monoral)
                                    // 雑に50回ループさせた新wave作成 (NOTE: offsetはblockAlignを考慮させる)
                                    const loopCount = 50;
                                    const newWaveSize = waveSize + (loopLength * (loopCount - 1) * blockAlign);
                                    const newDataSize = dataSize + (loopLength * (loopCount - 1) * blockAlign);
                                    const newSegment = new Uint8Array(newWaveSize + 8); // waveSizeは先頭8バイトを考慮してない
                                    newSegment.set(segment, 0);
                                    setLittleEndianNumberToUint8Array(newSegment, 4, 4, newWaveSize);
                                    setLittleEndianNumberToUint8Array(newSegment, 86, 4, newDataSize);
                                    for (let i = 1; i < loopCount; i++) {
                                        const offsetStart = 90 + (loopStart + loopLength * i) * blockAlign;
                                        newSegment.set([...segment.slice(90 + loopStart * blockAlign, 90 + (loopStart + loopLength) * blockAlign)], offsetStart);
                                    }
                                    newSegment.set([...segment.slice(90 + (loopStart + loopLength) * blockAlign)], 90 + (loopStart + loopLength * loopCount) * blockAlign);
                                    segment = newSegment;
                                }
                                const newBlob = new Blob([segment], { type: 'audio/wav' });
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
                }
                pElem.appendChild(cdiv);
            }
            document.body.appendChild(pElem);
        }
    }
}


function main() {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', loadFile);
    document.body.appendChild(input);

    textarea = document.createElement('textarea');
    textarea.cols = 150;
    textarea.rows = 50;
    textarea.style.display = 'block';
    document.body.appendChild(textarea);
}

window.addEventListener('DOMContentLoaded', main);