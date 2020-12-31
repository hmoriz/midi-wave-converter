import { Chunk } from "./chunk";

export type DataForMap = {
    insChunk : Chunk.InsChunk;
    regionMap : Object;
    waves : Array<{
        id : number,
        wave : Chunk.Chunk;
    }>;
};

class ParseResult {
    wpls            : Chunk.WvplChunk;
    instruments     : Chunk.LinsChunk;
    chunks          : Array<Chunk.Chunk>;
    instrumentIDMap : Map<number, Map<String, Map<Number, DataForMap>>>;

    constructor(data : Partial<ParseResult>) {
        Object.assign(this, data);
    }
};

export class Parser{
    frequencyTable : Array<number>;

    constructor() {
        // MIDI音階 -> Hz
        this.frequencyTable = new Array<number>();
        for (let i = 0; i < 128; i++) {
            this.frequencyTable[i] = 440 * (2.0 ** ((i - 69) / 12.0)) + 0.5;
        }
    }

    async parseFile(file : File) : Promise<ParseResult> {
        const reader = new FileReader();

        return new Promise((done) => {
            reader.onload = () => {
                if (!(reader.result instanceof ArrayBuffer))return;
                const result = this._parseDLS(reader.result);
                done(result);
            }
            reader.readAsArrayBuffer(file);
        });
    }

    private _parseDLS(arrayBuffer : ArrayBuffer) : ParseResult {
        const data = new DataView(arrayBuffer);
        const getChar = (offset : number) => {
            return String.fromCodePoint(data.getUint8(offset));
        }
        const getString = (offset : number, length: number) => {
            let ret = "";
            for (let i = 0; i < length; i++) {
                ret += getChar(offset + i);
            }
            return ret;
        };

        const getLrgnChunk = (offset) => {
            if (getString(offset, 4) !== 'LIST') {
                throw new Error('lrgn must be LIST');
            }
            const listSize = data.getUint32(offset + 4, true);
            if (getString(offset+8, 4) !== 'lrgn') {
                throw new Error('not lrgn Chunk : ' + getString(offset + 8, 4))
            }
            const lrgn = new Chunk.LrgnChunk(offset); 
            let subOffset = offset + 12;
            while (subOffset < offset + 8 + listSize) {
                const subKey = getString(subOffset, 4);
                if (subKey === 'LIST') {
                    const lrgnSize = data.getUint32(subOffset+4, true);
                    const lrgnSubKey = getString(subOffset+8, 4);
                    if (lrgnSubKey === 'rgn ') {
                        let rgnSubOffset = subOffset + 12;
                        const rgn = new Chunk.RgnChunk(rgnSubOffset, lrgnSize);
                        while (rgnSubOffset < subOffset + 8 + lrgnSize) {
                            const rgnSubKey = getString(rgnSubOffset, 4);
                            const rgnSubSize = data.getUint32(rgnSubOffset + 4, true);
                            if (rgnSubKey === 'rgnh') {
                                const rgnh = new Chunk.RgnhChunk(rgnSubOffset, rgnSubSize, {
                                    rangeKey: {
                                        usLow : data.getUint16(rgnSubOffset + 8 , true),
                                        usHigh: data.getUint16(rgnSubOffset + 10, true),
                                    },
                                    rangeVelocity: {
                                        usLow : data.getUint16(rgnSubOffset + 12, true),
                                        usHigh: data.getUint16(rgnSubOffset + 14, true),
                                    },
                                    fusOptions: data.getUint16(rgnSubOffset + 16, true),
                                    usKeyGroup: data.getUint16(rgnSubOffset + 18, true),
                                });
                                if (rgn.rgnh) {
                                    throw new Error('rgn.rgnh already defined ' + rgn.rgnh);
                                }
                                rgn.rgnh = rgnh;
                            } else if (rgnSubKey === 'wsmp') {
                                const wsmp = new Chunk.WsmpChunk(rgnSubOffset, rgnSubSize, {
                                    cbSize      : data.getUint32(rgnSubOffset + 8 , true),
                                    usUnityNote : data.getUint16(rgnSubOffset + 12, true),
                                    sFineTune   : data.getInt16 (rgnSubOffset + 14, true),
                                    lAttention  : data.getInt32 (rgnSubOffset + 16, true),
                                    fulOptions  : data.getUint32(rgnSubOffset + 20, true),
                                    cSampleLoops: data.getUint32(rgnSubOffset + 24, true),
                                });
                                if (wsmp.cSampleLoops === 1) {
                                    const wOffset = rgnSubOffset + 28;
                                    wsmp.waveSampleLoop = {
                                        cbSize     : data.getUint32(wOffset   , true),
                                        ulLoopType  : data.getUint32(wOffset+4 , true),
                                        ulLoopStart : data.getUint32(wOffset+8 , true),
                                        ulLoopLength: data.getUint32(wOffset+12, true),
                                    };
                                }
                                if (rgn.wsmp) {
                                    throw new Error('rgn.wsmp already defined ' + rgn.wsmp);
                                }
                                rgn.wsmp = wsmp;
                            } else if (rgnSubKey === 'wlnk') {
                                const wlnk = new Chunk.WlnkChunk(rgnSubOffset, rgnSubSize, {
                                    fusOptions   : data.getUint16(rgnSubOffset + 8 , true),
                                    usPhaseGroup : data.getUint16(rgnSubOffset + 10, true),
                                    ulChannel    : data.getUint32(rgnSubOffset + 12, true),
                                    ulTableIndex : data.getUint32(rgnSubOffset + 16, true),
                                });
                                if (rgn.wlnk) {
                                    throw new Error('rgn.wlnk already defined ' + rgn.wlnk);
                                }
                                rgn.wlnk = wlnk;
                            } else if (rgnSubKey === 'LIST') {
                                const subListKey = getString(rgnSubOffset + 8, 4);
                                if (subListKey === 'lart') {
                                    rgn.lart = getLartChunk(rgnSubOffset);
                                    
                                }  else {
                                    throw new Error('unknown lrgn LIST rgn LIST subkey' +  subListKey);
                                }
                            } else {
                                throw new Error('unknown lrgn LIST rgn subkey ' +  rgnSubKey);
                            }
                            rgnSubOffset += rgnSubSize+8;
                        }
                        lrgn.addChild(rgn);
                    } else {
                        throw new Error('unknown lrgn LIST subKey ' + lrgnSubKey);
                    }
                    subOffset += lrgnSize + 8;
                } else {
                    throw new Error('unknown lrgn subkey ' + subKey);
                }
            }
            return lrgn;
        }

        const getLartChunk = (offset : number) => {
            if (getString(offset, 4) !== 'LIST') {
                throw new Error('lart must be LIST');
            }
            const listSize = data.getUint32(offset + 4, true);
            if (getString(offset+8, 4) !== 'lart') {
                throw new Error('not lart Chunk : ' + getString(offset + 8, 4))
            }
            const lart = new Chunk.LartChunk(offset);
            let subOffset = offset + 12;
            while (subOffset < offset + 8 + listSize) {
                const subKey = getString(subOffset, 4);
                const subSize = data.getUint32(subOffset + 4, true);
                if (subKey === 'art1') {
                    const art1Chunk = new Chunk.Art1Chunk(subOffset, subSize, {
                        cbSize: data.getUint32(subOffset + 8, true),
                        cConnectionBlocks: data.getUint32(subOffset + 12, true),
                    });
                    for (let i = 0; i < art1Chunk.cConnectionBlocks; i++) {
                        const connectionBlockOffset = subOffset + 16 + i * 12;
                        const connectionBlock = new Chunk.Art1ConnectionBlock({
                            usSource     : data.getUint16(connectionBlockOffset    , true),
                            usControl    : data.getUint16(connectionBlockOffset + 2, true),
                            usDestination: data.getUint16(connectionBlockOffset + 4, true),
                            usTransform  : data.getUint16(connectionBlockOffset + 6, true),
                            lScale       : data.getInt32 (connectionBlockOffset + 8, true),
                        });
                        art1Chunk.addConnectionBlock(connectionBlock);
                    }
                    lart.addChild(art1Chunk);
                }
                subOffset += subSize + 8;
            }
            return lart;
        }

        const getLinsChunk = (offset : number) => {
            if (getString(offset, 4) !== 'LIST') {
                throw new Error('lins must be LIST');
            }
            const listSize = data.getUint32(offset + 4, true);
            if (getString(offset+8, 4) !== 'lins') {
                throw new Error('not lins Chunk : ' + getString(offset + 8, 4))
            }
            const linsChunk = new Chunk.LinsChunk(offset);
            let subOffset = offset + 12;
            while (subOffset < offset + 8 + listSize) {
                const subKey = getString(subOffset, 4);
                if (subKey === 'LIST') {
                    const listSize = data.getUint32(subOffset +4, true);
                    const listSubKey = getString(subOffset+8, 4);
                    if (listSubKey === 'ins ') {
                        const ins = new Chunk.InsChunk(subOffset + 8, listSize);
                        let insSubOffset = subOffset + 12;
                        while (insSubOffset < subOffset + listSize) {
                            const insSubKey = getString(insSubOffset, 4);
                            const insSubSize = data.getUint32(insSubOffset + 4, true);
                            if (insSubKey === 'insh') {
                                const insh = new Chunk.InshChunk(insSubOffset, insSubSize, {
                                    cRegions: data.getUint32(insSubOffset + 8, true),
                                    Locale: {
                                        ulBank      : data.getUint32(insSubOffset + 12, true),
                                        ulInstrument: data.getUint32(insSubOffset + 16, true),
                                    },
                                });
                                if (ins.insh) {
                                    throw new Error('ins.insh already defined ' + ins.insh);
                                }
                                ins.insh = insh;
                            } else if (insSubKey === 'dlid') {
                                // TODO
                                throw new Error('TODO ins.dlid');
                            } else if (insSubKey === 'LIST') {
                                const insListSubKey = getString(insSubOffset + 8, 4);
                                if (insListSubKey === 'lrgn') {
                                    const lrgn = getLrgnChunk(insSubOffset);
                                    if (ins.lrgn) {
                                        throw new Error('ins.lrgn already defined ' + ins.insh);
                                    }
                                    ins.lrgn = lrgn;
                                } else if (insListSubKey === 'lart') {
                                    const lart = getLartChunk(insSubOffset);
                                    if (ins.lart) {
                                        throw new Error('ins.lrgn already defined ' + ins.insh);
                                    }
                                    ins.lart = lart;
                                } else if (insListSubKey === 'INFO') {
                                    let listSubOffset = insSubOffset + 12;
                                    const infoChunk = new Chunk.InfoChunk(insSubOffset, insSubSize);
                                    while(listSubOffset <= insSubOffset + insSubSize + 4) {
                                        const infoKey = getString(listSubOffset, 4);
                                        let infoSize = data.getUint32(listSubOffset + 4, true);
                                        const value = getString(listSubOffset + 8, infoSize-1);
                                        infoChunk.dataMap.set(infoKey, value);
                                        if (infoSize % 4 !== 0) {
                                            infoSize += 4 - (infoSize % 4);
                                        }
                                        listSubOffset += infoSize + 8;
                                    }
                                    if (ins.info) {
                                        throw new Error('ins.INFO already defined ' + ins.info);
                                    }
                                    ins.info = infoChunk;
                                } else {
                                    throw new Error('unknown lins LIST ins LIST subKey ' + insListSubKey);
                                }
                            } else {
                                throw new Error('unknown lins LIST ins subKey ' + insSubKey);
                            }
                            insSubOffset += insSubSize + 8;
                        }
                        linsChunk.addChild(ins);
                    } else {
                        throw new Error('unknown lins LIST subKey ' + listSubKey);
                    }
                    subOffset += listSize + 8;
                } else {
                    throw new Error('unknown lins subKey ' + subKey);
                }
            }
            return linsChunk;
        };
        let waveIndex = 0;
        const getWvplChunk = (offset : number) => {
            if (getString(offset, 4) !== 'LIST') {
                throw new Error('lins must be LIST');
            }
            const listSize = data.getUint32(offset + 4, true);
            if (getString(offset+8, 4) !== 'wvpl') {
                throw new Error('not wvpl Chunk : ' + getString(offset + 8, 4))
            }
            const wvplChunk = new Chunk.WvplChunk(offset);
            let subOffset = offset + 12;
            while (subOffset < offset + 8 + listSize) {
                const wvplSubKey = getString(subOffset, 4);
                const wvplSubSize = data.getUint32(subOffset + 4, true);
                if (wvplSubKey === 'LIST') {
                    const wvplListSubKey = getString(subOffset + 8, 4);
                    if (wvplListSubKey === 'wave') {
                        // TODO: もっと細かくparseさせたほうが良い
                        const waveSize = wvplSubSize;
                        const wave = arrayBuffer.slice(subOffset + 12, subOffset + 8 + wvplSubSize);
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
                        // const audio = document.createElement('audio');
                        // audio.src = blobURL;
                        // audio.controls = true;
                        // const div = document.createElement('div');
                        // div.innerText = waveIndex++;
                        // document.body.appendChild(div);
                        // div.appendChild(audio);
                        const waveChunk = new Chunk.WaveChunk(subOffset + 8, wvplSubSize, {
                            rawData: wave,
                            segmentData: segment,
                            waveData: blob,
                        });
                        wvplChunk.addChild(waveChunk);
                    } else {
                        throw new Error('unknown wvpl list subKey ' + wvplSubKey);
                    }
                } else {
                    throw new Error('unknown wvpl subKey ' + wvplSubKey);
                }
                subOffset += wvplSubSize + 8;
            }
            return wvplChunk;
        };

        const getListChunk = (offset : number) => {
            const key = getString(offset, 4);
            const size = data.getUint32(offset + 4, true);
            if (key !== 'LIST') {
                throw new Error('key != LIST');
            }
            const subKey = getString(offset + 8, 4);
            if (subKey === 'lins') {
                const lins = getLinsChunk(offset);
                return lins;
            }
            if (subKey === 'wvpl') {
                const wvpl = getWvplChunk(offset);
                return wvpl;
            }
            if (subKey === 'INFO') {
                let listSubOffset = offset + 12;
                const infoChunk = new Chunk.InfoChunk(offset + 8, size-4);
                while(listSubOffset < offset + size) {
                    const infoKey = getString(listSubOffset, 4);
                    let infoSize = data.getUint32(listSubOffset + 4, true);
                    const value = getString(listSubOffset + 8, infoSize);
                    infoChunk.dataMap.set(infoKey, value);
                    if (infoSize % 2 !== 0) {
                        infoSize += 2 - (infoSize % 2);
                    }
                    listSubOffset += infoSize + 8;
                }
                return infoChunk;
            }
            throw new Error('Unknown LIST subKey ' + subKey);
        };

        const getChunk = (offset : number) => {
            const key = getString(offset, 4);
            const size = data.getUint32(offset + 4, true);
            if (key === 'LIST') {
                return getListChunk(offset);
            }
            if (key === 'ptbl') {
                const ptbl = new Chunk.PtblChunk(offset, size, {
                    cbSize: data.getUint32(offset + 8 , true),
                    cCues:  data.getUint32(offset + 12, true),
                });
                for (let i = 0; i < ptbl.cCues; i++) {
                    const subOffset = offset + 16 + i * 4;
                    ptbl.poolCues.push(data.getUint32(subOffset, true));
                }
                return ptbl;
            }
            const chunk = new Chunk.VarChunk(key, offset, size);
            chunk.rawData = arrayBuffer.slice(offset + 8, offset + 8 + size);
            return chunk;
        };

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
        const chunks = new Array<Chunk.Chunk>();
        let offset = globalOffset;
        while (offset <= globalSize) {
            const chunk = getChunk(offset);
            chunks.push(chunk);
            console.log(offset, offset.toString(16), chunks);
            offset += 8 + Number(chunk.size);
        }

        const wpls = chunks.find((chunk) => chunk instanceof Chunk.WvplChunk) as Chunk.WvplChunk;
        const instruments = chunks.find((chunk) => chunk instanceof Chunk.LinsChunk) as Chunk.LinsChunk;
        const instrumentIDMap = new Map<number, Map<String, Map<Number, DataForMap>>>();
        instruments.insList.forEach((insChunk) => {
            const insh = insChunk.insh;
            const inshData = insh.Locale
            const locale = insh.Locale;
            if (!locale) {
                console.log('missing locale for', inshData);
                return;
            }
            const instrumentID = locale.ulInstrument;
            if (!instrumentIDMap.get(instrumentID)) {
                instrumentIDMap.set(instrumentID, new Map());
            }
            const inam = insChunk.info?.dataMap.get('INAM');
            if (!inam) {
                console.log('missing inam for', insChunk);
                return;
            }
            if (!instrumentIDMap.get(instrumentID).get(inam)) {
                instrumentIDMap.get(instrumentID).set(inam, new Map());
            }
            const bankID = locale.ulBank;
            const lrgn = insChunk.lrgn;
            const regionMap = {};
            let waves = new Array();
            lrgn.rgnList.forEach((rgn) => {
                const rgnh = rgn.rgnh;
                if (!rgnh) {
                    console.log('not found rgnh for', rgn);
                    return;
                }
                const low =  rgnh.rangeKey.usLow;
                const high = rgnh.rangeKey.usHigh;
                const wlnk = rgn.wlnk;
                waves.push({id: wlnk.ulTableIndex, wave: wpls.waveList[wlnk.ulTableIndex]});
                for (let i = low; i <= high; i++) {
                    regionMap[i] = rgn;
                }
            })
            //console.log(i, instrument, inam, regions, locale, lrgn, regionMap);
            instrumentIDMap.get(instrumentID).get(inam).set(bankID, {
                insChunk,
                regionMap,
                waves,
            });
        });
        return new ParseResult({
            wpls: wpls,
            instruments: instruments,
            chunks : chunks, 
            instrumentIDMap : instrumentIDMap,
        });
    }
};