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

    export class Art1ConnectionBlock {
        usSource      : number;
        usControl     : number;
        usDestination : number;
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