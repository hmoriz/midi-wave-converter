export namespace Chunk {

    export abstract class Chunk {
        key   : String;
        offset: number;
        size  : number;

        constructor(key: String, offset: number, size: number) {
            this.key = key;
            this.offset = offset;
            this.size = size;
        }
    }

    export class VarChunk extends Chunk {
        rawData : ArrayBuffer;
    }

    class ListChunk extends Chunk {
        subType: String;
        protected children: Array<Chunk>;

        constructor(offset: number, subType: String) {
            super("LIST", offset, 4);
            this.subType = subType;
            this.children = new Array<Chunk>();
        }

        addChild(child: Chunk) {
            this.children.push(child);
            this.size += child.size + 8;
        }

        getChildren() {
            return this.children;
        }
    }

    export class DLSChunk extends Chunk {
        lins: LinsChunk;
    }

    export class LinsChunk extends ListChunk {
        insList: Array<InsChunk>;

        constructor(offset: number) {
            super(offset, 'lins');
            this.insList = new Array();
        }

        addChild(child : InsChunk) {
            super.addChild(child);
            this.insList.push(child);
        }
    }

    export class InsChunk extends Chunk {
        insh : InshChunk;
        lrgn : LrgnChunk;
        lart?: LartChunk;
        info?: InfoChunk;

        constructor(offset : number, size : number) {
            super('ins', offset, size)
        }
    }

    export class InshChunk extends Chunk {
        cRegions: number;
        Locale:  {
            ulBank      : number,
            ulInstrument: number,
        };
        constructor(offset: number, size: number, data?: Partial<InshChunk>) {
            super('insh', offset, size);
            Object.assign(this, data);
        }
    }

    export class LrgnChunk extends ListChunk {
        rgnList: Array<RgnChunk>;

        constructor(offset: number) {
            super(offset, 'lrgn');
            this.rgnList = new Array();
        }

        addChild(child: RgnChunk) {
            super.addChild(child);
            this.rgnList.push(child);
        }
    }

    export class RgnChunk extends Chunk {
        rgnh : RgnhChunk;
        wsmp?: WsmpChunk;
        wlnk : WlnkChunk;
        lart?: LartChunk;

        constructor(offset: number, size :number) {
            super('rgn', offset, size);
        }
    }

    export class RgnhChunk extends Chunk {
        rangeKey: {
            usLow : number,
            usHigh: number,
        };
        rangeVelocity: {
            usLow : number,
            usHigh: number,
        };
        fusOptions: number;
        usKeyGroup: number;

        constructor(offset: number, size: number, data?: Partial<RgnhChunk>) {
            super('rgnh', offset, size);
            Object.assign(this, data);
        }
    }

    export class WsmpChunk extends Chunk {
        cbSize          : number;
        usUnityNote     : number;
        sFineTune       : number;
        lAttention      : number;
        fulOptions      : number;
        cSampleLoops    : number;
        waveSampleLoop? : {
            cbSize      : number,
            ulLoopType  : number,
            ulLoopStart : number,
            ulLoopLength: number,
        }; 

        constructor(offset: number, size: number, data?: Partial<WsmpChunk>) {
            super('wsmp', offset, size);
            Object.assign(this, data);
            this.cbSize = size;
        } 
    }

    export class WlnkChunk extends Chunk {
        fusOptions   : number;
        usPhaseGroup : number;
        ulChannel    : number;
        ulTableIndex : number;

        constructor(offset: number, size: number, data?: Partial<WlnkChunk>) {
            super('wlnk', offset, size);
            Object.assign(this, data);
        }
    }

    export class LartChunk extends ListChunk {
        art1List: Array<Art1Chunk>;

        constructor(offset : number) {
            super(offset, 'lart');
            this.art1List = new Array();
        }

        addChild(child: Art1Chunk) {
            super.addChild(child);
            this.art1List.push(child);
        }
    }

    export class Art1Chunk extends Chunk {
        cbSize: number;
        cConnectionBlocks: number;
        connectionBlocks: Array<Art1ConnectionBlock>;

        constructor(offset: number, size: number, data?: Partial<Art1Chunk>) {
            super('art1', offset, size);
            Object.assign(this, data);
            this.connectionBlocks = new Array();
        }

        addConnectionBlock(cb : Art1ConnectionBlock) {
            this.connectionBlocks.push(cb);
            if (this.connectionBlocks.length > this.cConnectionBlocks) {
                throw new Error('cConnectionBlocks invalid :' + this.cConnectionBlocks);
            }
        }
    }

    export const ART1SOURCE = {
        CONN_SRC_NONE          : 0x0000,
        CONN_SRC_LFO           : 0x0001,
        CONN_SRC_KEYONVELOCITY : 0x0002,
        CONN_SRC_KEYNUMBER     : 0x0003,
        CONN_SRC_EG1           : 0x0004,
        CONN_SRC_EG2           : 0x0005,
    };

    export const ART1DESTINATION = {
        CONN_DST_NONE     : 0x0000,
        CONN_DST_GAIN     : 0x0001,
        CONN_DST_RESERVED : 0x0002,
        CONN_DST_PITCH    : 0x0003,
        CONN_DST_PAN      : 0x0004,

        CONN_LFO_FREQUENCY : 0x0104,
        CONN_LFO_DELAY     : 0x0105,

        CONN_EG1_ATTACK  : 0x0206,
        CONN_EG1_DECAY   : 0x0207,
        CONN_EG1_RESERVED: 0x0208,  // <-- NOTE : これは gm.gls では十中八九SUSTAIN LEVEL
        CONN_EG1_RELEASE : 0x0209,
        CONN_EG1_SUSTAIN : 0x020A,  // <-- NOTE : これは gm.gls で何に使われているかよくわからない(使用されている形跡は普通にある)

        CONN_EG2_ATTACK  : 0x030A,
        CONN_EG2_DECAY   : 0x030B,
        CONN_EG2_RESERVED: 0x030C,  // <-- NOTE : これは gm/gls ではたぶんSUSTAIN LEVEL
        CONN_EG2_RELEASE : 0x030D,
        CONN_EG2_SUSTAIN : 0x030E,
    }

    export type Art1Source = typeof ART1SOURCE[keyof typeof ART1SOURCE];
    export type Art1Destination = typeof ART1DESTINATION[keyof typeof ART1DESTINATION];

    export class Art1ConnectionBlock {
        usSource      : Art1Source;
        usControl     : number;
        usDestination : Art1Destination;
        usTransform   : number;
        lScale        : number;

        constructor(data? :Partial<Art1ConnectionBlock>) {
            Object.assign(this, data);
        }
    }

    export class InfoChunk extends Chunk {
        dataMap: Map<String, String>

        constructor(offset : number, size : number) {
            super('INFO', offset, size);
            this.dataMap = new Map<String, String>();
        }
    }

    export class PtblChunk extends Chunk {
        cbSize : number;
        cCues : number;
        poolCues : Array<number>;

        constructor(offset : number, size : number, data? : Partial<PtblChunk>) {
            super('ptbl', offset, size);
            this.poolCues = new Array();
            Object.assign(this, data);
        }
    }

    export class WvplChunk extends ListChunk {
        waveList : Array<WaveChunk>;

        constructor(offset : number) {
            super(offset, 'wvpl');
            this.waveList = new Array();
        }

        addChild(child : WaveChunk) {
            super.addChild(child);
            this.waveList.push(child);
        }
    }

    export class WaveChunk extends Chunk {
        rawData     : ArrayBuffer;
        segmentData : Uint8Array;
        waveData    : Blob;

        constructor(offset : number, size: number, data?: Partial<WaveChunk>) {
            super('wave', offset, size);
            Object.assign(this, data);
        }
    }
}