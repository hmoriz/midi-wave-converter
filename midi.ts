import { MIDI } from "./chunk";

export class ParseResult {
    mthd : MIDI.MThdChunk;
    mtrks : Array<MIDI.MTrkChunk>;

    constructor() {
        this.mtrks = new Array();
    }
}

export class MIDIParser {
    private _arrayBuffer : ArrayBuffer;
    private _data : DataView;
    constructor() {

    }

    async parseFile(file : File) : Promise<ParseResult> {
        const reader = new FileReader();

        return new Promise((done) => {
            reader.onload = () => {
                if (!(reader.result instanceof ArrayBuffer))return;
                const result = this._parseMIDI(reader.result);
                done(result);
            }
            reader.readAsArrayBuffer(file);
        });
    }

    private _getChar (offset : number) : string {
        return String.fromCodePoint(this._data.getUint8(offset));
    }
    private _getString (offset : number, length: number) : string {
        let ret = "";
        for (let i = 0; i < length; i++) {
            ret += this._getChar(offset + i);
        }
        return ret;
    };

    private _parseMIDIEvent(offset : number) : MIDI.MIDIEvent {
        const e = new MIDI.MIDIEvent();
        e.length = 0;
        const command = this._data.getUint8(offset);
        e.channel = command & 0x0F;
        if (command <= 0x7F) {
            console.error("Unknown command" + command.toString(16));
        } else if (0x80 <= command && command <= 0x8F) {
            // NOTE_OFF
            e.noteID = 0;
            e.velocity = 0;
            e.length = 3;
        } else if (0x90 <= command && command <= 0x9F) {
            // NOTE_ON
            e.isNoteEvent = true;
            e.noteID = this._data.getUint8(offset + 1);
            e.velocity = this._data.getUint8(offset + 2);
            e.length = 3;
        } else if (0xA0 <= command && command <= 0xAF) {
            // POLYPHONIC_KEY_PRESSURE
            e.isNoteEvent = true;
            e.length = 3;
            console.warn('Unknown', offset.toString(16));
        } else if (0xB0 <= command && command <= 0xBF) {
            // CONTROL_CHANGE
            e.isControlEvent = true;
            const subCommand = this._data.getUint8(offset + 1);
            e.controlCommand = subCommand;
            e.value1 = this._data.getUint8(offset + 2);
            e.value2 = 0;
            e.length = 3;
            if (0x70 <= subCommand && subCommand <= 0x7F) {
                console.warn('unknown subCommand', offset.toString(16), subCommand);
            } else if (subCommand >= 0x80) {
                console.error('Unknown subCommand', offset.toString(16), subCommand);
            }
        } else if (0xC0 <= command && command <= 0xCF) {
            // PROGRAM_CHANGE
            e.length = 2;
            e.isProgramChangeEvent = true;
            e.programID = this._data.getUint8(offset + 1);
            console.warn('Unknown', offset.toString(16));
        } else if (0xD0 <= command && command <= 0xDF) {
            // 
            e.length = 2;
        } else if (0xE0 <= command && command <= 0xEF) {
            // PITCH BEND 
            e.length = 3;
            e.isPitchBendChangeEvent = true;
            const lsb = this._data.getUint8(offset + 1);
            const msb = this._data.getUint8(offset + 2);
            e.value1 = ((lsb & 0x7F) + ((msb & 0x7F) << 7)) - 0x2000;
        } else {
            console.warn('Unknown', offset.toString(16));
        }
        e.value = (new Uint8Array(this._arrayBuffer)).slice(offset, offset+e.length);
        return e;
    }

    private _parseMTrkMetaEvent(offset : number) : MIDI.MetaEvent {
        if (this._data.getUint8(offset) !== 0xFF) {
            throw new Error('not metaEvent on ' + offset.toString(16));
        }
        const e = new MIDI.MetaEvent({
            metaEventType: this._data.getUint8(offset+1),
            length: this._data.getUint8(offset + 2),
        });
        e.textValue = this._getString(offset + 3, e.length);
        e.value = (new Uint8Array(this._arrayBuffer)).slice(offset + 3, offset + 3 + e.length);
        return e;
    }

    private _parseMtrkChunk(offset : number) : MIDI.MTrkChunk {
        const chunkKey = this._getString(offset, 4);
        const chunkSize = this._data.getUint32(offset + 4, false);
        if (chunkKey !== 'MTrk') {
            throw new Error('File does NOT have MTrk Header : ' + chunkKey);
        }
        const mtrk = new MIDI.MTrkChunk(offset, chunkSize);

        let subOffset = offset + 8;
        while (subOffset < offset + 8 + chunkSize) {
            let deltaSize = 1;
            let delta = this._data.getUint8(subOffset);
            if (delta >= 0x80) {
                let subDelta = delta;
                delta &= 0x7F;
                while(subDelta >= 0x80) {
                    subDelta = this._data.getUint8(subOffset + deltaSize)
                    deltaSize++;
                    delta = (delta << 7) + (subDelta & 0x7F);
                }
            }
            const eventType = this._data.getUint8(subOffset + deltaSize);
            let eventSize = chunkSize;
            let event : MIDI.MIDIEvent | MIDI.SysExEvent | MIDI.MetaEvent;
            if (eventType >= 0xF0) {
                switch (eventType) {
                    case 0xF0: 
                    case 0xF7: {
                        const length = this._data.getUint8(subOffset + deltaSize + 1);
                        const data = (new Uint8Array(this._arrayBuffer)).slice(subOffset+3, subOffset+3+length);
                        const e = new MIDI.SysExEvent();
                        e.escapingType = eventType === 0xF7;
                        e.length = length;
                        e.value = data;
                        event = e;
                        eventSize = e.length + 2;
                        break;
                    }
                    case 0xFF: {
                        const e = this._parseMTrkMetaEvent(subOffset + deltaSize);
                        event = e;
                        eventSize = e.length + 3;
                        break;
                    }
                    default:
                        console.warn('unknown eventtype', subOffset.toString(16), delta, eventType);
                        return mtrk;
                }
            } else {
                const e = this._parseMIDIEvent(subOffset + deltaSize);
                event = e;
                eventSize = e.length;
            }
            const mtrkEvent = new MIDI.MTrkEvent({offset: subOffset, deltaTime: delta});
            mtrkEvent.event = event;
            mtrk.Events.push(mtrkEvent);
            subOffset += deltaSize + eventSize;
        }
        return mtrk;
    }

    private _parseMIDI(arrayBuffer : ArrayBuffer) : ParseResult {
        this._arrayBuffer = arrayBuffer;
        this._data = new DataView(arrayBuffer);
        const ret = new ParseResult();

        const firstChunkKey = this._getString(0, 4);
        const firstChunkSize = this._data.getUint32(4, false);
        if (firstChunkKey !== 'MThd') {
            throw new Error('File does NOT have MThd Header : ' + firstChunkKey);
        }
        ret.mthd = new MIDI.MThdChunk(0, firstChunkSize, {
            format: this._data.getUint16(8, false),
            nTracks: this._data.getUint16(10, false),
            division: this._data.getUint16(12, false),
        });

        let mtrkChunkOffset = 14;
        while (mtrkChunkOffset < arrayBuffer.byteLength) {
            const mtrk = this._parseMtrkChunk(mtrkChunkOffset);
            ret.mtrks.push(mtrk);
            mtrkChunkOffset += mtrk.size + 8; 
        }


        return ret;
    }
}