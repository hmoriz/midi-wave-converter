
// MIDI音階 -> Hz
const frequencyTable = new Array();
for (i = 0; i < 128; i++) {
    frequencyTable[i] = 440 * (2.0 ** ((i - 69) / 12.0)) + 0.5;
}

/** @type {HTMLTextAreaElement} */
let textarea;
function loadFile(/** @type {Event} */ e) {
    for (let i = 0; i < e.target.files.length; i++) {
        /** @type {File} */
        const file = e.target.files[i];
        const reader = new FileReader();

        reader.onload = () => {
            const data = new DataView(reader.result);
            const getChar = (offset) => {
                return String.fromCodePoint(data.getUint8(offset));
            }
            const getString = (offset, length) => {
                let ret = "";
                for (let i = 0; i < length; i++) {
                    ret += getChar(offset + i);
                }
                return ret;
            };

            const getLrgnChunk = (offset) => {
                const subKey = getString(offset, 4);
                if (subKey === 'LIST') {
                    const subSize = data.getUint32(offset+4, true);
                    const subSubKey = getString(offset+8, 4);
                    if (subSubKey === 'rgn ') {
                        let subOffset = offset + 12;
                        const subSubData = new Array();
                        while (subOffset <= offset + subSize) {
                            const subSubSubKey = getString(subOffset, 4);
                            const subSubSubSize = data.getUint32(subOffset + 4, true);
                            const subSubSubData = {
                                key: subSubSubKey,
                                size: subSubSubSize,
                                offset: subOffset,
                            };
                            if (subSubSubKey === 'rgnh') {
                                subSubSubData.data = {
                                    rangeKey: {
                                        usLow : data.getUint16(subOffset + 8 , true),
                                        usHigh: data.getUint16(subOffset + 10, true),
                                    },
                                    rangeVelocity: {
                                        usLow : data.getUint16(subOffset + 12, true),
                                        usHigh: data.getUint16(subOffset + 14, true),
                                    },
                                    fusOptions: data.getUint16(subOffset + 16, true),
                                    usKeyGroup: data.getUint16(subOffset + 18, true),
                                };
                            } else if (subSubSubKey === 'wsmp') {
                                subSubSubData.data = {
                                    cbSize      : data.getUint32(subOffset + 8 , true),
                                    usUnityNote : data.getUint16(subOffset + 12, true),
                                    sFineTune   : data.getInt16 (subOffset + 14, true),
                                    lAttention  : data.getInt32 (subOffset + 16, true),
                                    fulOptions  : data.getUint32(subOffset + 20, true),
                                    cSampleLoops: data.getUint32(subOffset + 24, true),
                                    waveSamples : new Array(),
                                };
                                for (let i = 0; i < subSubSubData.data.cSampleLoops; i++) {
                                    const wOffset = subOffset + 28 + i * 16;
                                    subSubSubData.data.waveSamples.push({
                                        cbSize     : data.getUint32(wOffset   , true),
                                        uLoopType  : data.getUint32(wOffset+4 , true),
                                        uLoopStart : data.getUint32(wOffset+8 , true),
                                        uLoopLength: data.getUint32(wOffset+12, true),
                                    });
                                }
                            } else if (subSubSubKey === 'wlnk') {
                                subSubSubData.data = {
                                    fusOotions  : data.getUint16(subOffset + 8 , true),
                                    usPhaseGroup: data.getUint16(subOffset + 10, true),
                                    ulChannel   : data.getUint32(subOffset + 12, true),
                                    uTableIndex : data.getUint32(subOffset + 16, true),
                                }
                            } else if (subSubSubKey === 'LIST') {
                                const subListKey = getString(subOffset + 8, 4);
                                if (subListKey === 'lart') {
                                    let listSubOffset = subOffset + 12;
                                    const lartData = new Array();
                                    while (listSubOffset <= subOffset + subSubSubSize + 4) {
                                        const lart = getlartChunk(listSubOffset);
                                        lartData.push(lart);
                                        listSubOffset += lart.size + 4;
                                    }
                                    subSubSubData.subKey = subSubSubKey;
                                    subSubSubData.subData = {
                                        key: subSubSubKey,
                                        offset: subOffset,
                                        size: subSubSubSize,
                                        subKey: subListKey,
                                        subData: lartData,
                                    };
                                }  else {
                                    throw new Error('unknown lrgn LIST rgn LIST subkey' +  subListKey);
                                }
                            } else {
                                throw new Error('unknown lrgn LIST rgn subkey ' +  subSubSubKey);
                            }
                            subSubData.push(subSubSubData);
                            subOffset += subSubSubSize+8;
                        }
                        return {
                            key: 'lrgn',
                            size: subOffset - offset - 4,
                            offset: offset-4,
                            subKey: subKey,
                            subData: {
                                key: subKey,
                                size: subSize,
                                offset: offset,
                                subKey: subSubKey,
                                subData: subSubData,
                            },
                        }
                    }
                    throw new Error('unknown lrgn LIST subKey ' + subSubKey);
                }
                throw new Error('unknown lrgn subKey ' + subKey);
            }

            const getlartChunk = (offset) => {
                const subKey = getString(offset, 4);
                if (subKey === 'art1') {
                    const subSize = data.getUint32(offset + 4, true);
                    const lart = {
                        key: 'lart',
                        size: subSize + 4,
                        offset: offset-4,
                        subKey: subKey,
                        subData: {
                            key: subKey,
                            size: subSize,
                            offset: offset,
                            data: {
                                cbSize           : data.getUint32(offset + 8 , true),
                                cConnectionBlocks: data.getUint32(offset + 12, true),
                                connectionBlocks : new Array(),
                            },
                        }
                    };
                    for (let i = 0; i < lart.subData.data.cConnectionBlocks; i++) {
                        const subOffset = offset + 16 + i * 12;
                        lart.subData.data.connectionBlocks.push(
                            {
                                usSource     : data.getUint16(subOffset    , true),
                                usControl    : data.getUint16(subOffset + 2, true),
                                usDestination: data.getUint16(subOffset + 4, true),
                                usTransform  : data.getUint16(subOffset + 6, true),
                                lScale       : data.getInt32 (subOffset + 8, true),
                            }
                        );
                    }
                    return lart;
                }
                throw new Error('unknown lart subKey ' + subKey);
            }

            const getLinsChunk = (offset) => {
                const subKey = getString(offset, 4);
                if (subKey === 'LIST') {
                    const subSize = data.getUint32(offset +4, true);
                    const subSubKey = getString(offset+8, 4);
                    if (subSubKey === 'ins ') {
                        let subOffset = offset + 12;
                        const subSubData = new Array();
                        while (subOffset <= offset + subSize) {
                            const subSubSubKey = getString(subOffset, 4);
                            const subSubSubSize = data.getUint32(subOffset + 4, true);
                            if (subSubSubKey === 'insh') {
                                subSubData.push({
                                    key: subSubSubKey,
                                    size: subSubSubSize,
                                    offset: subOffset,
                                    data: {
                                        cRegions: data.getUint32(subOffset + 8, true),
                                        locale: {
                                            ulBank      : data.getUint32(subOffset + 12, true),
                                            ulInstrument: data.getUint32(subOffset + 16, true),
                                        },
                                    },
                                });
                            } else if (subSubSubKey === 'dlid') {
                                subSubData.push({
                                    key: subSubSubKey,
                                    size: subSubSubSize,
                                    offset: subOffset,
                                });
                            } else if (subSubSubKey === 'LIST') {
                                const subListKey = getString(subOffset + 8, 4);
                                if (subListKey === 'lrgn') {
                                    let listSubOffset = subOffset + 12;
                                    const lrgnData = new Array();
                                    while (listSubOffset <= subOffset + subSubSubSize + 4) {
                                        const lrgn = getLrgnChunk(listSubOffset);
                                        lrgnData.push(lrgn);
                                        listSubOffset += lrgn.size + 4;
                                    }
                                    subSubData.push({
                                        key: subSubSubKey,
                                        offset: subOffset,
                                        size: subSubSubSize,
                                        subKey: subListKey,
                                        subData: lrgnData,
                                    });
                                } else if (subListKey === 'lart') {
                                    let listSubOffset = subOffset + 12;
                                    const lartData = new Array();
                                    while (listSubOffset <= subOffset + subSubSubSize + 4) {
                                        const lart = getlartChunk(listSubOffset);
                                        lartData.push(lart);
                                        listSubOffset += lart.size + 4;
                                    }
                                    subSubData.push({
                                        key: subSubSubKey,
                                        offset: subOffset,
                                        size: subSubSubSize,
                                        subKey: subListKey,
                                        subData: lartData,
                                    });
                                } else if (subListKey === 'INFO') {
                                    let listSubOffset = subOffset + 12;
                                    const infoData = {};
                                    while(listSubOffset <= subOffset + subSubSubSize + 4) {
                                        const infoKey = getString(listSubOffset, 4);
                                        let infoSize = data.getUint32(listSubOffset + 4, true);
                                        const value = getString(listSubOffset + 8, infoSize-1);
                                        infoData[infoKey] = value;
                                        if (infoSize % 4 !== 0) {
                                            infoSize += 4 - (infoSize % 4);
                                        }
                                        listSubOffset += infoSize + 8;
                                    }
                                    subSubData.push({
                                        key: subSubSubKey,
                                        offset: subOffset,
                                        size: subSubSubSize,
                                        subKey: subListKey,
                                        subData: infoData,
                                    });
                                } else {
                                    subSubData.push({
                                        key: subSubSubKey,
                                        offset: subOffset,
                                        size: subSubSubSize,
                                        subKey: subListKey,
                                    });
                                }
                            } else {
                                throw new Error('unknown lins LIST ins subKey ' + subSubSubKey);
                            }
                            subOffset += subSubSubSize + 8;
                        }
                        return {
                            key: 'lins',
                            size: subOffset - offset - 4,
                            offset: offset-4,
                            subKey: subKey,
                            subData: {
                                key: subKey,
                                size: subSize,
                                offset: offset,
                                subKey: subSubKey,
                                subData: subSubData,
                            },
                        }
                    }
                    throw new Error('unknown lins LIST subKey ' + subSubKey);
                }
                throw new Error('unknown lins subKey ' + subKey);
            };
            let waveIndex = 0;
            const getWvplChunk = (offset) => {
                const subKey = getString(offset, 4);
                const subSize = data.getUint32(offset + 4, true);
                if (subKey === 'LIST') {
                    const subSubKey = getString(offset + 8, 4);
                    if (subSubKey === 'wave') {
                        const waveSize = subSize;
                        const wave = reader.result.slice(offset + 12, offset + 8 + subSize);
                        // NOTE : 先頭に RIFF を加え, wave -> WAVE に変更した上でwav生成
                        let segment = new Uint8Array(wave.byteLength + 12);
                        segment.set(['R'.charCodeAt(0)], 0);
                        segment.set(['I'.charCodeAt(0)], 1);
                        segment.set(['F'.charCodeAt(0)], 2);
                        segment.set(['F'.charCodeAt(0)], 3);
                        segment.set([waveSize & 0xFF], 4);
                        segment.set([(waveSize >> 8) & 0xFF], 5);
                        segment.set([(waveSize >> 16) & 0xFF], 6);
                        segment.set([(waveSize >> 24) & 0xFF], 7);
                        segment.set(['W'.charCodeAt(0)], 8);
                        segment.set(['A'.charCodeAt(0)], 9);
                        segment.set(['V'.charCodeAt(0)], 10);
                        segment.set(['E'.charCodeAt(0)], 11);
                        segment.set([...(new Uint8Array(wave))], 12);
                        const blob = new Blob([segment], { type: 'audio/wav' });
                        const blobURL = window.URL.createObjectURL(blob);
                        // const audio = document.createElement('audio');
                        // audio.src = blobURL;
                        // audio.controls = true;
                        // const div = document.createElement('div');
                        // div.innerText = waveIndex++;
                        // document.body.appendChild(div);
                        // div.appendChild(audio);
                        return {
                            key: 'wvpl',
                            size: subSize+4,
                            offset: offset-4,
                            subKey: subKey,
                            subData: {
                                key: subKey,
                                size: subSize,
                                offset: offset,
                                raw: wave, 
                                segment: segment,
                                wave: blobURL,
                            },
                        };
                    } else {
                        throw new Error('unknown wvpl list subKey ' + subKey);
                    }
                }
                throw new Error('unknown wvpl subKey ' + subKey);
            };
            const getListChunk = (offset) => {
                const key = getString(offset, 4);
                const size = data.getUint32(offset + 4, true);
                if (key !== 'LIST') {
                    throw new Error('key != LIST');
                }
                const subKey = getString(offset + 8, 4);
                if (subKey === 'lins') {
                    let subOffset = offset + 12;
                    const subData = new Array();
                    while (subOffset <= offset + size) {
                        const lins = getLinsChunk(subOffset);
                        subData.push(lins);
                        subOffset += lins.size + 4;
                    }
                    return {
                        key: key,
                        offset: offset,
                        size: size,
                        subKey: subKey,
                        subData: subData,
                    };
                }
                if (subKey === 'wvpl') {
                    let subOffset = offset + 12;
                    const waves = new Array();
                    while (subOffset <= offset + size) {
                        const wave = getWvplChunk(subOffset);
                        waves.push(wave);
                        subOffset += wave.size + 4;
                    }
                    return {
                        key: key,
                        offset: offset,
                        size: size,
                        subKey: subKey,
                        subData: waves,
                    }
                }
                if (subKey === 'INFO') {
                    let listSubOffset = offset + 12;
                    const infoData = {};
                    while(listSubOffset < offset + size) {
                        const infoKey = getString(listSubOffset, 4);
                        let infoSize = data.getUint32(listSubOffset + 4, true);
                        const value = getString(listSubOffset + 8, infoSize);
                        infoData[infoKey] = value;
                        if (infoSize % 2 !== 0) {
                            infoSize += 2 - (infoSize % 2);
                        }
                        listSubOffset += infoSize + 8;
                    }
                    return {
                        key: key,
                        offset: offset,
                        size: size,
                        subKey: subKey,
                        subData: infoData,
                    }
                }
                throw new Error('Unknown LIST subKey ' + subKey);
            };
            const getChunk = (offset) => {
                const key = getString(offset, 4);
                const size = data.getUint32(offset + 4, true);
                if (key === 'LIST') {
                    return getListChunk(offset);
                }
                if (key === 'ptbl') {
                    const ptbl = {
                        key: key,
                        offset: offset,
                        size: size,
                        data: {
                            cbSize  : data.getUint32(offset + 8, true),
                            cCues   : data.getUint32(offset + 12, true),
                            poolCues: new Array(),
                        },
                    };
                    for (let i = 0; i < ptbl.data.cCues; i++) {
                        const subOffset = offset + 16 + i * 4;
                        ptbl.data.poolCues.push({
                            ulOffset: data.getUint32(subOffset, true),
                        });
                    }
                    return ptbl;
                }
                return {
                    key: key,
                    offset: offset,
                    size: size,
                }
            };

            textarea.value = '';
            for (let j = 0; j < 10000; j++) {
                const bit = data.getUint8(j + 280054);
                //textarea.value += ('00' + bit.toString(16)).slice(-2) + " "
                if (bit <= 32 || bit >= 127) {
                    textarea.value += ('00' + bit.toString(16)).slice(-2) + '\t';
                } else {
                    textarea.value += getChar(j + 280054) + '\t';
                }
                if (j % 16 === 15) {
                    textarea.value += "\n"
                }
            }

            if (getString(0, 4) !== 'RIFF') {
                console.log(getString(0, 4), "!= RIFF")
                return;
            }
            const globalSize = data.getUint32(4, true);
            if (getString(8, 4) !== 'DLS ') {
                console.log(getString(4, 4), "!= DLS")
                return;
            }
            const globalOffset = 12;
            const chunks = new Array();
            let offset = globalOffset;
            while (offset <= globalSize) {
                const chunk = getChunk(offset);
                chunks.push(chunk);
                console.log(offset, chunks);
                offset += 8 + chunk.size;
            }

            const wpls = chunks[5].subData;
            const instruments = chunks[3].subData;
            const instrumentIDMap = {};
            for (let i in instruments) {
                const instrument = instruments[i];
                const insh = instrument.subData.subData.filter((d) => d.key === 'insh')[0];
                const inshData = insh && insh.data;
                const locale = inshData && inshData.locale;
                if (!locale) {
                    console.log('missing locale for', instrument);
                    continue
                }
                const instrumentID = locale.ulInstrument;
                if (!instrumentIDMap[instrumentID]) {
                    instrumentIDMap[instrumentID] = {};
                }
                const inam = instrument.subData.subData.filter((d) => d.subKey === 'INFO')[0].subData['INAM'];
                if (!inam) {
                    console.log('missing inam for', instrument);
                    continue;
                }
                if (!instrumentIDMap[instrumentID][inam]) {
                    instrumentIDMap[instrumentID][inam] = {};
                }
                const bankID = locale.ulBank;
                const lrgn = instrument.subData.subData.filter((d) => d.subKey === 'lrgn')[0];
                const regionMap = {};
                let waves = new Array();
                lrgn.subData.forEach((data) => {
                    if (data.subKey !== 'LIST')return;
                    const rgnh = data.subData.subData.filter((data) => data.key === 'rgnh')[0];
                    const low =  rgnh.data.rangeKey.usLow;
                    const high = rgnh.data.rangeKey.usHigh;
                    const wlnks = data.subData.subData.filter((data) => data.key === 'wlnk');
                    waves.push(...wlnks.map((wlnk) => {return {id: wlnk.data.uTableIndex, wave: wpls[wlnk.data.uTableIndex].subData}}));
                    for (let i = low; i <= high; i++) {
                        regionMap[i] = data;
                    }
                })
                //console.log(i, instrument, inam, regions, locale, lrgn, regionMap);
                instrumentIDMap[instrumentID][inam][bankID] = {
                    instrument,
                    regionMap,
                    waves,
                };
            }
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
                                    const baseFreq = frequencyTable[baseID];
                                    const altFreq = frequencyTable[Number(midiID)];
                                    const freqRate = altFreq / baseFreq;
                                    const segment = new Uint8Array(wave.wData.segment);
                                    const bitRate = segment[24] 
                                        + (segment[25] << 8)
                                        + (segment[26] << 16)
                                        + (segment[27] << 24);
                                    const newBitRate = bitRate * freqRate;
                                    segment.set([newBitRate & 0xFF], 24);
                                    segment.set([(newBitRate >> 8) & 0xFF], 25);
                                    segment.set([(newBitRate >> 16) & 0xFF], 26);
                                    segment.set([(newBitRate >> 24) & 0xFF], 27);
                                    console.log(wave.wData.segment, segment);
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
        };
        reader.readAsArrayBuffer(file);
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