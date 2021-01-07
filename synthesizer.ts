import { DLS, MIDI } from "./chunk";
import { getFrequencyFromNoteID, InstrumentData, ParseResult as DLSParseInfo } from './dls';
import { ParseResult as MidiParseInfo } from "./midi";

export namespace Synthesizer {

    function getBigEndianNumberFromUint8Array(data : Uint8Array, offset : number, size : number) {
        let ret = 0;
        for (let i = 0; i < size; i++) {
            ret = (ret << 8) + data[offset + i];
        }
        return ret;
    }

    function getLittleEndianNumberFromUint8Array(data : Uint8Array, offset : number, size : number) {
        let ret = 0;
        for (let i = 0; i < size; i++) {
            ret += data[offset + i] << (i * 8);
        }
        return ret;
    }
    
    function setLittleEndianNumberToUint8Array(data : Uint8Array, offset : number, size : number, value : number) {
        for (let i = 0; i < size; i++) {
            data.set([(value >> (i * 8)) & 0xff], offset+i);
        }
    }
    
    export function getSecondsFromArt1Scale(lScale: number) {
        if (lScale === -0x80000000) {
            return 0;
        }
        return 2 ** (lScale / 1200 / 65536);
    }

    function getFrequencyFromArt1CentScale(lScale: number) {
        return 440 * (2 ** ((lScale / 65536 - 6900)/1200));
    }
    
    export class Art1Info {
        EG1AttackTime       : number = 0;
        EG1DecayTime        : number = 0;
        EG1ReservedTime     : number = 0;
        EG1ReleaseTime      : number = 0;
        EG1SustainLevel     : number = 100.0;
        EG1VelocityToAttack : number = 0;
        EG1KeyToDecay       : number = 0;
    
        EG2AttackTime   : number = 0;
        EG2DecayTime    : number = 0;
        EG2ReservedTime : number = 0;
        EG2ReleaseTime  : number = 0;
        EG2SustainLevel : number = 100.0;
        EG2KeyToDecay   : number = 0;

        LFOFrequency : number = 5.0;
        LFOToVolume  : number = 0;
        LFOToPitch   : number = 0;
        LFODelay     : number = 0;

        EG2ToPitch : number = 0;

        Pan : number = 0;
        
        KeyNumberToPitch : number = 0;

        PitchPerModWheel : number = 0;
    }
    
    export function getArt1InfoFromLarts(lart?: DLS.LartChunk) : Art1Info {
        const ret = new Art1Info();
        if (!lart || !lart.art1List) return ret;
        const art1s = lart.art1List;
        art1s.forEach(art1 => {
            art1.connectionBlocks.forEach(cb => {
                switch (cb.usDestination) {
                    case DLS.ART1DESTINATION.CONN_LFO_FREQUENCY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.LFOFrequency = getFrequencyFromArt1CentScale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_LFO_DELAY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.LFODelay = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_ATTACK:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1AttackTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYONVELOCITY) {
                            ret.EG1VelocityToAttack = cb.lScale;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_DECAY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1DecayTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.EG1KeyToDecay = cb.lScale;
                            console.log('CONN_EG1_DECAY', 'CONN_SRC_KEYNUMBER', cb.lScale, getFrequencyFromArt1CentScale(cb.lScale));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_RESERVED:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : おそらくここで定義されているのがSUSTAIN_LEVEL
                            ret.EG1SustainLevel = Math.max(0, Math.min(100.0, cb.lScale / 10));
                            if (cb.lScale < 0 || cb.lScale > 1000) {
                                console.warn('CONN_EG1_RESERVED', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            }
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_RELEASE:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1ReleaseTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_SUSTAIN:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1ReservedTime = getSecondsFromArt1Scale(cb.lScale);
                            console.warn('CONN_EG1_SUSTAIN', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_ATTACK:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2AttackTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_DECAY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2DecayTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.EG2KeyToDecay = getSecondsFromArt1Scale(cb.lScale);
                            console.warn('CONN_EG2_DECAY', 'CONN_SRC_KEYNUMBER', cb.lScale, getFrequencyFromArt1CentScale(cb.lScale));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_RESERVED:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : おそらくここで定義されているのがSUSTAIN_LEVEL
                            ret.EG2SustainLevel = Math.max(0, Math.min(100.0, cb.lScale / 10));
                            if (cb.lScale < 0 || cb.lScale > 1000) {
                                console.error('CONN_EG2_RESERVED', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            }
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_RELEASE:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2ReleaseTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_SUSTAIN:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2ReservedTime = getSecondsFromArt1Scale(cb.lScale);
                            console.warn('CONN_EG2_SUSTAIN', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_DST_GAIN:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_LFO) {
                            // LFO -> Volume
                            ret.LFOToVolume = cb.lScale / 655360;
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_CC7) {
                            // CC7(Volume Controller) -> Volume
                            // あったら対応(なさそう)
                            console.error("CC7ToVolume", cb.lScale);
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_CC11) {
                            // CC11(Expression Controller) -> Volume
                            // あったら対応(なさそう)
                            console.error("CC11ToVolume", cb.lScale);
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_DST_PITCH:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_LFO) {
                            // LFO -> Pitch
                            ret.LFOToPitch = Math.max(-1200, Math.min(1200, cb.lScale / 655360.0));
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.KeyNumberToPitch = Math.max(-1200, Math.min(1200, cb.lScale / 655360.0));
                            console.error("KeyNumberToPitch", cb.lScale); // DLS仕様書にはあるがgm.dlsにはなさそう
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_EG2) {
                            // EG2 Value to Pitch (max pitch delta)
                            ret.EG2ToPitch = Math.max(-1200, Math.min(1200, cb.lScale / 655360.0));
                            console.log("EG2ToPitch", cb.lScale, cb.lScale / 65536, getFrequencyFromArt1CentScale(cb.lScale), ret.EG2ToPitch);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_DST_PAN:
                        // console.error("PAN", cb.lScale, cb.usSource, cb.lScale / 655360.0);
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : 仕様書によれば0.1%単位らしいけど範囲に収めることを考えて65536 * 10で割る
                            ret.Pan = Math.max(-50, Math.min(50, cb.lScale / 655360.0));
                            return;
                        }
                }
                console.warn('Unknown ART1 Destination', cb);
            })
        })
        return ret;
    }

    class NoteInfo {
        noteID : number;
        velocity : number;
        endTick   : number;
        endOffset : number;
        length : number;
    }

    const CONTROLLER = {
        MODULATION_WHEEL : 1,
        VOLUME           : 7,
        PAN              : 10,
    };

    type Controller = typeof CONTROLLER[keyof typeof CONTROLLER];

    class InstrumentInfo {
        instrumentID : number = 0;
        bankID      : number = 0;
        volume      : number = 100;
        controllers : Map<Controller, number> = new Map<number, number>();

        constructor(data? : Partial<InstrumentInfo>) {
            Object.assign(this, data);
        }
    }

    export class SynthesizeResult {
        waveSegment : Uint8Array;
        channelToWaveSegment : Map<number, Uint8Array>;

        constructor() {
            this.channelToWaveSegment = new Map();
        }
    }

    export function synthesizeMIDI(midi : MidiParseInfo, dls : DLSParseInfo) :  SynthesizeResult {
        const riffData = new Array<number>(); // uint8
        const waveDataR = new Array<number>(); // int16
        const waveDataL = new Array<number>(); // int16
        riffData[0] = 'R'.charCodeAt(0);
        riffData[1] = 'I'.charCodeAt(0);
        riffData[2] = 'F'.charCodeAt(0);
        riffData[3] = 'F'.charCodeAt(0);
        riffData[8]  = 'W'.charCodeAt(0);
        riffData[9]  = 'A'.charCodeAt(0);
        riffData[10] = 'V'.charCodeAt(0);
        riffData[11] = 'E'.charCodeAt(0);
        riffData[12] = 'f'.charCodeAt(0);
        riffData[13] = 'm'.charCodeAt(0);
        riffData[14] = 't'.charCodeAt(0);
        riffData[15] = ' '.charCodeAt(0);
        riffData[16] = 16;   // fmt block in 20-32
        riffData[17] = 0;
        riffData[18] = 0;
        riffData[19] = 0;
        riffData[20] = 1;    // linear PCM
        riffData[21] = 0;
        riffData[22] = 2;    // Stereo
        riffData[23] = 0;
        riffData[24] = 0x44; // 44100 Hz
        riffData[25] = 0xAC;
        riffData[26] = 0x00;
        riffData[27] = 0x00;
        riffData[28] = 0x10; // 44100 * 4 = 176400 bytes / sec
        riffData[29] = 0xB1;
        riffData[30] = 0x02;
        riffData[31] = 0x00;
        riffData[32] = 4;    // 4byte / frame
        riffData[33] = 0;
        riffData[34] = 16;   // 16bit / frame
        riffData[35] = 0;
        riffData[36] = 'd'.charCodeAt(0);
        riffData[37] = 'a'.charCodeAt(0);
        riffData[38] = 't'.charCodeAt(0);
        riffData[39] = 'a'.charCodeAt(0);
        riffData[40] = 0;
        riffData[41] = 0;
        riffData[42] = 0;
        riffData[43] = 0;

        // tick -> tempo change Info(number)
        const tickTempoMap = new Map<number, number>();
        // channel ID -> tick -> Instrument Info
        const tickInstrumentMap = new Map<number, Map<number, InstrumentInfo>>();
        // channel ID -> tick
        const channelToInstrumentLastTick = new Map<number, number>();
        // channel ID -> tick -> [Note info]
        const tickNotesMap = new Map<number, Map<number, Array<NoteInfo>>>();
        // channel ID -> Note ID -> tick
        const channelToNoteLastTick = new Map<number, Map<number, number>>();
        // channel ID -> tick -> pitchBend Info (number)
        const tickPitchBendMap = new Map<number, Map<number, number>>();

        // Truckを見てChannel -> tick -> 各種データを集める
        let maxTick = 0;
        midi.mtrks.forEach(mtrk => {
            let tick = 0;
            mtrk.Events.forEach(mtrkEvent => {
                tick += mtrkEvent.deltaTime;
                if (mtrkEvent.event instanceof MIDI.MIDIEvent) {
                    if (mtrkEvent.event.isNoteEvent) {
                        if (mtrkEvent.event.velocity > 0) {
                            // NOTE ON
                            const noteID = mtrkEvent.event.noteID;
                            const noteInfo = new NoteInfo();
                            noteInfo.noteID = noteID;
                            noteInfo.velocity = mtrkEvent.event.velocity;
                            if(!tickNotesMap.get(mtrkEvent.event.channel))tickNotesMap.set(mtrkEvent.event.channel, new Map());
                            if(!tickNotesMap.get(mtrkEvent.event.channel).get(tick)) {
                                tickNotesMap.get(mtrkEvent.event.channel).set(tick, new Array());
                            }
                            tickNotesMap.get(mtrkEvent.event.channel).get(tick).push(noteInfo);
                            if(!channelToNoteLastTick.get(mtrkEvent.event.channel))channelToNoteLastTick.set(mtrkEvent.event.channel, new Map());
                            if (channelToNoteLastTick.get(mtrkEvent.event.channel).get(noteInfo.noteID) >= 0) {
                                // 前回のONイベントがOFFにならずに残っているので一つ前のtickでオフにさせる
                                const lastTick = channelToNoteLastTick.get(mtrkEvent.event.channel).get(noteID);
                                const noteInfo = tickNotesMap.get(mtrkEvent.event.channel).get(lastTick).find(nInfo => noteID === nInfo.noteID);
                                noteInfo.endTick = tick -1;
                            }
                            // 前回のONイベント更新(NoteID別)
                            channelToNoteLastTick.get(mtrkEvent.event.channel).set(noteInfo.noteID, tick);
                        } else {
                            // NOTE OFF
                            const noteID = mtrkEvent.event.noteID;
                            const lastTick = channelToNoteLastTick.get(mtrkEvent.event.channel).get(noteID);
                            if (lastTick >= 0) {
                                const noteInfo = tickNotesMap.get(mtrkEvent.event.channel).get(lastTick).find(nInfo => noteID === nInfo.noteID);
                                noteInfo.endTick = tick;
                                channelToNoteLastTick.get(mtrkEvent.event.channel).set(noteID, -1);
                            }
                        }
                    } else if (mtrkEvent.event.isControlEvent) {
                        const lastTick = channelToInstrumentLastTick.get(mtrkEvent.event.channel);
                        let instrumentInfo : InstrumentInfo
                        if (lastTick) {
                            let lastInstrument = tickInstrumentMap.get(mtrkEvent.event.channel).get(lastTick)
                            instrumentInfo = new InstrumentInfo(lastInstrument);
                        } else {
                            instrumentInfo = new InstrumentInfo();
                        }
                        if (mtrkEvent.event.controlCommand === 0x00 || mtrkEvent.event.controlCommand === 0x20) {
                            // BANK Select (0x00 -> LSB, 0x20 -> MSB)
                            if (mtrkEvent.event.controlCommand === 0x00) {
                                // LSB
                                instrumentInfo.bankID = instrumentInfo.bankID & 0xFF00 + mtrkEvent.event.value1;
                            } else {
                                // MSB
                                instrumentInfo.bankID = instrumentInfo.bankID & 0x00FF + (mtrkEvent.event.value1 << 8);
                            }
                        } else if (mtrkEvent.event.controlCommand === 0x07) {
                            // Volume
                            instrumentInfo.volume = mtrkEvent.event.value1;
                        } else if (mtrkEvent.event.controlCommand === 0x0A) {
                            // PAN
                            console.warn("PAN Control", mtrkEvent.event.value1);
                            instrumentInfo.controllers.set(CONTROLLER.PAN, mtrkEvent.event.value1);
                        }
                        if (!tickInstrumentMap.get(mtrkEvent.event.channel)) tickInstrumentMap.set(mtrkEvent.event.channel, new Map());
                        tickInstrumentMap.get(mtrkEvent.event.channel).set(tick, instrumentInfo);
                        channelToInstrumentLastTick.set(mtrkEvent.event.channel, tick);
                    } else if (mtrkEvent.event.isProgramChangeEvent) {
                        // Program ID
                        const lastTick = channelToInstrumentLastTick.get(mtrkEvent.event.channel);
                        let instrumentInfo = new InstrumentInfo();
                        if (lastTick) {
                            let lastInstrument = tickInstrumentMap.get(mtrkEvent.event.channel).get(lastTick);
                            instrumentInfo = new InstrumentInfo(lastInstrument);
                        }
                        instrumentInfo.instrumentID = mtrkEvent.event.programID;
                        if (!tickInstrumentMap.get(mtrkEvent.event.channel)) tickInstrumentMap.set(mtrkEvent.event.channel, new Map());
                        tickInstrumentMap.get(mtrkEvent.event.channel).set(tick, instrumentInfo);
                        channelToInstrumentLastTick.set(mtrkEvent.event.channel, tick);
                    } else if (mtrkEvent.event.isPitchBendChangeEvent) {
                        if (!tickPitchBendMap.get(mtrkEvent.event.channel)) tickPitchBendMap.set(mtrkEvent.event.channel, new Map());
                        tickPitchBendMap.get(mtrkEvent.event.channel).set(tick, mtrkEvent.event.value1);
                    }
                } else if (mtrkEvent.event instanceof MIDI.SysExEvent) {
                } else if (mtrkEvent.event instanceof MIDI.MetaEvent) {
                    if (mtrkEvent.event.metaEventType === 0x51) {
                        // tempo event
                        const tempo = getBigEndianNumberFromUint8Array(mtrkEvent.event.value, 0, mtrkEvent.event.value.length);
                        tickTempoMap.set(tick, tempo);
                    }
                } else {
                    throw new Error();
                }
            });
            maxTick = Math.max(maxTick, tick);
        });

        const channelIDs = new Set<number>();
        tickInstrumentMap.forEach((_, channelID) => channelIDs.add(channelID));
        tickNotesMap.forEach((_, channelID) => channelIDs.add(channelID));

        const notePerTick = midi.mthd.division; // ticks per 1/4 note (ex. 480)

        // tick(number) -> offset(number)
        const tickToOffset = new Map<number, number>();
        let tempo = 400000; // μs per 1/4 note (ex. 600000 for 100/min, 200000 for 300/min)
        let offset = 0;
        let maxOffset = 0;
        for (let tick = 0; tick <= maxTick; tick++) {
            const tempoEvent = tickTempoMap.get(tick);
            if (tempoEvent) {
                tempo = tempoEvent;
            }
            offset += (1 / notePerTick) * (tempo / 1000000) * 44100;
            if (tempoEvent) console.log(tick, tempo, offset);
            tickToOffset.set(tick, offset);
            maxOffset = Math.max(maxOffset, offset);
        }

        // channel ID -> offset -> Instrument Info
        const offsetInstrumentMap = new Map<number, Map<number, InstrumentInfo>>();

        tickInstrumentMap.forEach((map, channelID) => {
            offsetInstrumentMap.set(channelID, new Map());
            map.forEach((instrumentInfo, tick) => {
                const offset = Math.trunc(tickToOffset.get(tick));
                offsetInstrumentMap.get(channelID).set(offset, instrumentInfo);
            });
        });

        // channel ID -> offset -> [Note info]
        const offsetNotesMap = new Map<number, Map<number, Array<NoteInfo>>>();

        tickNotesMap.forEach((map, channelID) => {
            offsetNotesMap.set(channelID, new Map());
            map.forEach((noteInfoArray, tick) => {
                noteInfoArray.forEach(noteInfo => {
                    const offset = Math.trunc(tickToOffset.get(tick));
                    let endOffset : number;
                    if (noteInfo.endTick) {
                        endOffset = Math.trunc(tickToOffset.get(noteInfo.endTick));
                    } else {
                        endOffset = maxOffset;
                    }
                    noteInfo.endOffset = endOffset;
                    noteInfo.length = noteInfo.endOffset - offset;
                    if(!offsetNotesMap.get(channelID).get(offset))offsetNotesMap.get(channelID).set(offset, new Array());
                    offsetNotesMap.get(channelID).get(offset).push(noteInfo);
                })
            });
        });

        // channelID -> offset -> Pitch Info(number)
        const offsetPitchBendMap = new Map<number, Map<number, number>>();
        tickPitchBendMap.forEach((map, channelID) => {
            offsetPitchBendMap.set(channelID, new Map());
            map.forEach((pitchBendInfo, tick) => {
                const offset = Math.trunc(tickToOffset.get(tick));
                offsetPitchBendMap.get(channelID).set(offset, pitchBendInfo);
            })
        })
        
        // channelID -> [waveDataR(Int16Array), waveDataL(Int16Array)]
        const channelWaveDatas = new Map<number, [Array<number>, Array<number>]>();

        // channelID -> noteID -> [attacked offset, valocity, sample_offset_speed_gain, last_sample_offset]
        const noteIDAttackedOffsetMap = new Map<number, Map<number, [number, NoteInfo, number, number]>>();
        // channelID -> [instrument, wave, art1Info(for ins), lart(for ins)]
        const instrumentMap = new Map<number, [InstrumentInfo, InstrumentData, Art1Info, DLS.LartChunk]>();
        // channelID -> noteID -> velocity -> art1Info(for rgn)
        const regionArt1InfoMap = new Map<number, Map<number, Map<Number, Art1Info>>>();
        channelIDs.forEach(channelID => {
            channelWaveDatas.set(channelID, [new Array(), new Array()]);
            noteIDAttackedOffsetMap.set(channelID, new Map<number, [number, NoteInfo, number, number]>());
            regionArt1InfoMap.set(channelID, new Map<number, Map<number, Art1Info>>());
        });
        // channelID -> pitchBend(number)
        const pitchBendMap = new Map<number, number>();
        let waveDataRMin = 1;
        let waveDataRMax = -1;
        // channeiID -> [waveDataMin, waveDataMax]
        const channelWaveDataMaxMin = new Map<number, [number, number]>();
        for (let offset = 0; offset < maxOffset; offset++) {
            if (offset % 10000 === 0)console.log("Synthesize Processing... ", offset, "/", Math.ceil(maxOffset));
            waveDataR[offset] = 0;
            waveDataL[offset] = 0;
            
            channelIDs.forEach((channelID) => {
                channelWaveDatas.get(channelID)[0][offset] = 0;
                channelWaveDatas.get(channelID)[1][offset] = 0;
                // if (channelID !== 0) return; // 仮置
                const instrumentEvent = offsetInstrumentMap.get(channelID)?.get(offset);
                if (instrumentEvent) {
                    /** @ts-ignore  */
                    const instrumentData = dls.instrumentIDMap.get(instrumentEvent.instrumentID).get(channelID === 9 ? 2147483648 : instrumentEvent.bankID);
                    instrumentMap.set(channelID, [instrumentEvent, instrumentData, getArt1InfoFromLarts(instrumentData.insChunk.lart), instrumentData.insChunk.lart]);
                }
                const noteEvents = offsetNotesMap.get(channelID)?.get(offset);
                if (noteEvents) {
                    noteEvents.forEach(noteEvent => {
                        noteIDAttackedOffsetMap.get(channelID).set(noteEvent.noteID, [offset, noteEvent, 0, 0]);
                    })
                }
                const pitchBendEvent = offsetPitchBendMap.get(channelID)?.get(offset);
                if (pitchBendEvent) {
                    pitchBendMap.set(channelID, pitchBendEvent);
                }
                const attackedMap = noteIDAttackedOffsetMap.get(channelID);
                if (attackedMap) {
                    const instData = instrumentMap.get(channelID);
                    let instrumentInfo : InstrumentInfo;
                    let instrumentData : InstrumentData;
                    let art1Info       : Art1Info;
                    let lart           : DLS.LartChunk;
                    if (instData) {
                        [instrumentInfo, instrumentData, art1Info, lart] = instrumentMap.get(channelID);
                    }
                    attackedMap?.forEach(([attackedOffset, noteInfo, sampleOffsetSpeedGain, lastSampleOffset], noteID) => {
                        if (!instData) return;
                        const position = offset - attackedOffset;
                        const positionFromReleased = offset - noteInfo.endOffset;
                        const sec = position / 44100;
                        const secFromReleased = positionFromReleased / 44100;
                        const rgn = instrumentData.regionMap.get(noteID).get(noteInfo.velocity);
                        if (!rgn) {
                            // rgnが存在しないなどないはず
                            console.error("not defined RGN", noteID, noteInfo.velocity, instrumentData.regionMap);
                            noteIDAttackedOffsetMap.get(channelID).delete(noteID);
                            return;
                        }
                        if (!lart && rgn.lart) {
                            // lartが存在しない -> regionごとのlartのほうを取得(with cache)
                            if (!regionArt1InfoMap.get(channelID).get(noteID)) regionArt1InfoMap.get(channelID).set(noteID, new Map<Number, Art1Info>());
                            let art1InfoCache = regionArt1InfoMap.get(channelID).get(noteID).get(noteInfo.velocity);
                            if (art1InfoCache) {
                                art1Info = art1InfoCache;
                            } else {
                                art1Info = getArt1InfoFromLarts(rgn.lart);
                                regionArt1InfoMap.get(channelID).get(noteID).set(noteInfo.velocity, art1Info);
                            }
                        } else if (!lart && !rgn.lart) {
                            console.error("no ins lart nor rgn lart", instrumentInfo.instrumentID, rgn);
                        }
                        if (secFromReleased >= art1Info.EG1ReleaseTime) {
                            noteIDAttackedOffsetMap.get(channelID).delete(noteID);
                        } else {
                            const waveChunk = instrumentData.waves.get(rgn.wlnk.ulTableIndex);
                            if (!waveChunk) {
                                console.error("cannot load waveInfo from ", rgn);
                                noteIDAttackedOffsetMap.get(channelID).delete(noteID);
                                return;
                            }
                            const bps = waveChunk.bytesPerSecond;
                            const sampleOffsetDefaultSpeed = bps / 44100;
                            const wsmp = rgn.wsmp || waveChunk.wsmpChunk;
                            let baseFrequency = 0;
                            let waveLoopStart = 0;
                            let waveLoopLength = 0;
                            let waveLooping = false;
                            let freqRate = 1;
                            if (wsmp) {
                                baseFrequency = getFrequencyFromNoteID(wsmp.usUnityNote);
                                const altFreq = getFrequencyFromNoteID(noteID);
                                freqRate = altFreq / baseFrequency;
                                if (wsmp.waveSampleLoop) {
                                    waveLooping = true;
                                    waveLoopStart = wsmp.waveSampleLoop.ulLoopStart;
                                    waveLoopLength = wsmp.waveSampleLoop.ulLoopLength;
                                }
                            }
                            // EG2(Envelope Generator for Pitch)情報をpositionDXに雑に適用
                            let nextSampleOffsetSpeedGain = sampleOffsetSpeedGain;
                            if (art1Info) {
                                let sampleOffsetSpeedCents = 0;
                                if (art1Info.EG2ToPitch) {
                                    if (art1Info.EG2AttackTime > 0 || art1Info.EG2DecayTime > 0 || art1Info.EG2ReleaseTime > 0) {
                                        if (sec < art1Info.EG2AttackTime) {
                                            // Attack Zone
                                            if (sec === 0) {
                                                sampleOffsetSpeedCents = 0
                                            } else {
                                                sampleOffsetSpeedCents = art1Info.EG2ToPitch * sec / art1Info.EG2AttackTime;
                                            }
                                        } else if (positionFromReleased <= 0) {
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
                                                if (noteInfo.endOffset === offset) {
                                                    sampleOffsetSpeedCents = dddx;
                                                } else {
                                                    sampleOffsetSpeedCents = art1Info.EG2ToPitch * secFromReleased / (art1Info.EG2ReleaseTime);
                                                }
                                            }
                                            sampleOffsetSpeedCents = Math.min(sampleOffsetSpeedCents, dddx);
                                        }
                                        // sampleOffsetSpeedCents : cent単位
                                        sampleOffsetSpeedCents = Math.max(0, Math.min(art1Info.EG2ToPitch, sampleOffsetSpeedCents));
                                    }
                                }
                                // LFO情報もpositionDXに適用 (cent単位)
                                let lfo = 0;
                                if (art1Info.LFOToPitch) {
                                    // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                                    if (sec >= art1Info.LFODelay) {
                                        lfo = Math.sin((sec - art1Info.LFODelay) * Math.PI * 2 * art1Info.LFOFrequency) * art1Info.LFOToPitch;
                                    }
                                }
                                sampleOffsetSpeedCents += lfo;
                                if (wsmp) {
                                    // sFineTune を加味 (NOTE : DLSの仕様では65536で割るべきっぽいけどgm.dlsのfineTuneの内容的に行わない)
                                    sampleOffsetSpeedCents += wsmp.sFineTune;
                                }
                                // sampleOffsetSpeedGain : 増加率 (0は等倍, 1につき1オクターブ)
                                nextSampleOffsetSpeedGain = (2 ** (sampleOffsetSpeedCents / 1200)) - 1.0;
                                // ピッチベンド適用 (EG2と同様, ピッチベンドは -8191 ~ 8192のため -0.5(1オクターブ下) ～ 1.0(1オクターブ上))
                                let pitchBendSpeedGain = 0;
                                if (pitchBendMap.get(channelID) && pitchBendMap.get(channelID) !== 0) {
                                    pitchBendSpeedGain = (2 ** (pitchBendMap.get(channelID) / 8192 / 6)) - 1.0;
                                }
                                nextSampleOffsetSpeedGain = (nextSampleOffsetSpeedGain + pitchBendSpeedGain);
                                // if (offset % 1000000 === 10 || offset % 1000000 === 11) console.log(offset, channelID, position, pitchBendMap.get(channelID), lastSampleOffset, sampleOffsetSpeedGain, nextSampleOffsetSpeedGain, pitchBendSpeedGain, sampleOffsetSpeedCents, sampleOffsetDefaultSpeed, freqRate, wsmp?.sFineTune);
                            }
                            let sampleOffset = Math.max(0, lastSampleOffset + sampleOffsetDefaultSpeed * freqRate * (1 + nextSampleOffsetSpeedGain));
                            noteIDAttackedOffsetMap.get(channelID).set(noteID, [attackedOffset, noteInfo, nextSampleOffsetSpeedGain, sampleOffset]);
                            if (waveLooping && sampleOffset >= waveChunk.pcmData.length -1) {
                                sampleOffset = ((sampleOffset - waveChunk.pcmData.length) % waveLoopLength) + waveLoopStart;
                            } else if (!waveLooping && sampleOffset >= waveChunk.pcmData.length-1) {
                                if (offset <= noteInfo.endOffset) {
                                    // NOTE ONのうちにワンショット系の時間が過ぎているので一応警告
                                    console.warn("sampleOffset is out of BOUND", sampleOffset );
                                }
                                noteIDAttackedOffsetMap.get(channelID).delete(noteID);
                                return;
                            }
                            // TODO : 一旦「線形補間」
                            let sampleWaveData = 0;
                            if (Number.isInteger(sampleOffset)) {
                                sampleWaveData = waveChunk.pcmData[sampleOffset];
                            } else {
                                const x1 = Math.trunc(sampleOffset);
                                const x2 = Math.ceil(sampleOffset);
                                const y1 = waveChunk.pcmData[x1];
                                const y2 = waveChunk.pcmData[x2];
                                sampleWaveData = (x2 - sampleOffset) * y1 + (sampleOffset - x1) * y2;
                            }
                            sampleWaveData = Math.round(sampleWaveData * (noteInfo.velocity / 100));
                            // EG1(Envelope Generator for Volume)情報を反映
                            let eg1Velocity = 1.0;
                            let eg1Attenuation = 96;
                            if (art1Info) {
                                let attackTime = art1Info.EG1AttackTime;
                                if (art1Info.EG1VelocityToAttack > 0) {
                                    attackTime -= getSecondsFromArt1Scale(art1Info.EG1VelocityToAttack * (noteInfo.velocity / 128));
                                }
                                let decayTime = art1Info.EG1DecayTime;
                                if (art1Info.EG1KeyToDecay > 0) {
                                    decayTime += getSecondsFromArt1Scale(art1Info.EG1KeyToDecay * (noteInfo.noteID / 128));
                                }
                                if (sec < attackTime) {
                                    // Attack Zone
                                    eg1Velocity = sec / attackTime;
                                    eg1Attenuation = Math.min(96, sec === 0 ? 96 : 20 * Math.log10(attackTime / sec));
                                } else if (positionFromReleased <= 0) {
                                    // Decay or Sustain Zone
                                    if (sec === 0 || decayTime === 0) {
                                        eg1Velocity = 0;
                                        eg1Attenuation = 96;
                                    } else {
                                        if (sec === attackTime) {
                                            eg1Velocity = 1.0;
                                            eg1Attenuation = 0;
                                        } else {
                                            eg1Velocity = -Math.log10(Math.max(0, (sec - attackTime)) / decayTime + 0.1);
                                            if (isNaN(eg1Velocity)) {
                                                console.error("decay", sec, attackTime, secFromReleased, art1Info.EG1ReleaseTime)
                                            }
                                            eg1Attenuation = 96 * (sec - attackTime) / decayTime;
                                        }
                                    }
                                    eg1Velocity = Math.max(eg1Velocity, art1Info.EG1SustainLevel / 100.0);
                                    eg1Attenuation = Math.min(eg1Attenuation, 96 * (1 - art1Info.EG1SustainLevel / 100.0));
                                } else {
                                    // Sustain or Release Zone
                                    let dVolume = 1.0;
                                    let dAttenuation = 96;
                                    if (sec === 0 || decayTime === 0) {
                                        dVolume = 0;
                                        dAttenuation = 96;
                                    } else {
                                        if (sec === attackTime) {
                                            dVolume = 1.0;
                                            dAttenuation = 0;
                                        } else {
                                            dVolume = -Math.log10(Math.max(0, (sec - attackTime)) / decayTime + 0.1);
                                            dAttenuation = 96 * (sec - attackTime) / decayTime;
                                        }
                                    }
                                    dVolume = Math.max(dVolume, art1Info.EG1SustainLevel / 100.0);
                                    dAttenuation = Math.min(dAttenuation, 96 * (1 - art1Info.EG1SustainLevel / 100.0));
                                    if (art1Info.EG1ReleaseTime === 0) {
                                        eg1Velocity = 0;
                                        eg1Attenuation = 96;
                                    } else {
                                        if (offset === noteInfo.endOffset) {
                                            eg1Velocity = dVolume;
                                            eg1Attenuation = dAttenuation;
                                        } else {
                                            eg1Velocity = -Math.log10(Math.max(0, secFromReleased) / (art1Info.EG1ReleaseTime) + 0.1);
                                            if (isNaN(eg1Velocity)) {
                                                console.error("release", secFromReleased, art1Info.EG1ReleaseTime)
                                            }
                                            eg1Attenuation = 96 * secFromReleased / art1Info.EG1ReleaseTime;
                                        }
                                    }
                                    eg1Velocity = Math.min(eg1Velocity, dVolume);
                                    eg1Attenuation = Math.max(eg1Attenuation, dAttenuation);
                                }
                                eg1Velocity = Math.min(1.0, Math.max(0, eg1Velocity));
                                eg1Attenuation = Math.min(96, Math.max(0, eg1Attenuation));
                                // if (positionFromReleased === -1 || positionFromReleased === 0 || positionFromReleased === 1) console.log(offset, channelID, noteID, noteInfo.endOffset, noteInfo.length, position, sec, secFromReleased, sec <= attackTime, positionFromReleased <= 0, eg1Velocity, eg1Attenuation, dAttenuation, attackTime, art1Info.EG1AttackTime, art1Info.EG1VelocityToAttack);
                            }
                            // LFO情報を反映
                            let lfo = 0;
                            let lfoAttenuation = 0;
                            if (art1Info) {
                                if (art1Info.LFOToVolume > 0) {
                                    // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                                    if (sec >= art1Info.LFODelay) {
                                        lfo = Math.sin((sec - art1Info.LFODelay) * Math.PI * 2 * art1Info.LFOFrequency) * art1Info.LFOToVolume;
                                        lfoAttenuation = lfo;
                                    }
                                } 
                            }
                            // WSMPのAttenuationを加味
                            let wsmpAttenuation = 0;
                            if (wsmp) {
                                if (wsmpAttenuation === 0x80000000) {
                                    sampleWaveData = 0;
                                }
                                wsmpAttenuation = wsmp.lAttenuation / 655360;
                            }
                            let sampleWaveDataR = sampleWaveData;
                            let sampleWaveDataL = sampleWaveData;
                            // PAN考慮
                            let panAttenuationR = 0;
                            let panAttenuationL = 0;
                            if (instrumentInfo.controllers.get(CONTROLLER.PAN)) {
                                const pan = instrumentInfo.controllers.get(CONTROLLER.PAN);
                                panAttenuationR = 20 * Math.log10((127/(pan)) ** 0.5)
                                panAttenuationL = 20 * Math.log10((127/(127-pan)) ** 0.5)
                            } else if (art1Info.Pan !== 0) {
                                const pan = 64 - art1Info.Pan / 50 * 64;
                                panAttenuationR = 20 * Math.log10((127/(pan)) ** 0.5)
                                panAttenuationL = 20 * Math.log10((127/(127-pan)) ** 0.5)
                            }
                            // if (offset % 1000000 === 1) console.log(offset, channelID, eg1Attenuation, lfoAttenuation, wsmpAttenuation, wsmpAttenuation, 127 - 10 ** ((wsmpAttenuation*40 + lfoAttenuation)), 20 * Math.log10((127**2)-(eg1Attenuation**2)), 0.1 ** ((eg1Attenuation + lfoAttenuation + wsmpAttenuation) / 20));
                            // if (offset % 1000000 === 0) console.log(offset, channelID, art1Info.LFOFrequency, art1Info.LFOToVolume, art1Info.LFOToPitch, art1Info.LFODelay, lfo);
                            sampleWaveDataR = (sampleWaveData * (0.1 ** ((Math.max(0, eg1Attenuation + wsmpAttenuation + lfoAttenuation + panAttenuationR)) / 20))) * (instrumentInfo.volume / 100.0);
                            sampleWaveDataL = (sampleWaveData * (0.1 ** ((Math.max(0, eg1Attenuation + wsmpAttenuation + lfoAttenuation + panAttenuationL)) / 20))) * (instrumentInfo.volume / 100.0);
                            if (isNaN(sampleWaveData)) {
                                console.error(offset, eg1Velocity, lfo, sampleOffset, sampleWaveData, art1Info.EG1ReleaseTime, instrumentInfo.volume);
                            }
                            waveDataR[offset] += sampleWaveDataR;
                            waveDataL[offset] += sampleWaveDataL;
                            channelWaveDatas.get(channelID)[0][offset] += sampleWaveDataR;
                            channelWaveDatas.get(channelID)[1][offset] += sampleWaveDataL;
                            // console.log(offset, attackedOffset, noteInfo, positionDX, art1Info, wsmp, position, sampleOffset, freqRate, sampleWaveData, eg1Velocity, waveLoopLength, waveLoopStart, waveInfo.wave.pcmData.length);
                        }
                    });
                }
                if (!channelWaveDataMaxMin.get(channelID)) {
                    channelWaveDataMaxMin.set(channelID, [channelWaveDatas.get(channelID)[0][offset] || 1, channelWaveDatas.get(channelID)[0][offset] || -1]);
                } else {
                    const [max, min] = channelWaveDataMaxMin.get(channelID);
                    channelWaveDataMaxMin.set(channelID, [
                        Math.max(max, channelWaveDatas.get(channelID)[0][offset] || 1, channelWaveDatas.get(channelID)[1][offset] || 1), 
                        Math.min(min, channelWaveDatas.get(channelID)[0][offset] || -1, channelWaveDatas.get(channelID)[1][offset] || -1)
                    ]);
                }
            });
            if (waveDataR[offset]) {
                waveDataRMax = Math.max(waveDataRMax, waveDataR[offset], waveDataL[offset]);
                waveDataRMin = Math.min(waveDataRMin, waveDataR[offset], waveDataL[offset]);
            }
        }

        // -32768~32767に範囲をおさえる(音割れ防止)
        const correctRate = Math.min(32767 / waveDataRMax, -32768 / waveDataRMin);
        console.log(waveDataRMax, waveDataRMin, correctRate);
        if (correctRate < 1) {
            for (let offset = 0; offset < maxOffset; offset++) {
                waveDataR[offset] = Math.round(waveDataR[offset] *  correctRate * 0.99);
                waveDataL[offset] = Math.round(waveDataL[offset] *  correctRate * 0.99);
            }
        }

        console.log(maxTick, maxOffset, tickNotesMap, tickInstrumentMap, tickTempoMap, tickToOffset, offsetNotesMap, offsetInstrumentMap);
        
        // console.log(JSON.stringify(waveData.slice(50000, 100000)));

        // waveデータをriffに入れて新waveを作成 (Little Endian)
        for (let i = 0; i < waveDataR.length; i++) {
            const subOffset = 44 + i * 4;
            riffData[subOffset]   = (!waveDataR[i]) ? 0 : waveDataR[i] & 0xFF;
            riffData[subOffset+1] = (!waveDataR[i]) ? 0 : ((waveDataR[i] >> 8) & 0xFF);
            riffData[subOffset+2] = (!waveDataL[i]) ? 0 : waveDataL[i] & 0xFF;
            riffData[subOffset+3] = (!waveDataL[i]) ? 0 : ((waveDataL[i] >> 8) & 0xFF);
        }
        const ret = new Uint8Array(riffData);
        setLittleEndianNumberToUint8Array(ret, 4, 4, waveDataR.length * 4 + 44);
        setLittleEndianNumberToUint8Array(ret, 40, 4, waveDataR.length * 4);

        const channelRiffDatas = new Map<number, Uint8Array>();
        channelIDs.forEach(channelID => {
            const waveDataR = channelWaveDatas.get(channelID)[0];
            const waveDataL = channelWaveDatas.get(channelID)[1];

            const [max, min] = channelWaveDataMaxMin.get(channelID);
            const correctRate = Math.min(1, 32767 / max, -32768 / min);
            if (correctRate < 1) {
                for (let offset = 0; offset < maxOffset; offset++) {
                    waveDataR[offset] = Math.round(waveDataR[offset] * correctRate * 0.99);
                    waveDataL[offset] = Math.round(waveDataR[offset] * correctRate * 0.99);
                }
            }
            // RIFFデータを雑に塗り替えながらチャンネル別のwave作成(波形のみ塗りつぶすため問題なし)
            for (let i = 0; i < waveDataR.length; i++) {
                const subOffset = 44 + i * 4;
                riffData[subOffset]   = (!waveDataR[i]) ? 0 : waveDataR[i] & 0xFF;
                riffData[subOffset+1] = (!waveDataR[i]) ? 0 : ((waveDataR[i] >> 8) & 0xFF);
                riffData[subOffset+2] = (!waveDataL[i]) ? 0 : waveDataL[i] & 0xFF;
                riffData[subOffset+3] = (!waveDataL[i]) ? 0 : ((waveDataL[i] >> 8) & 0xFF);
            }
            const channelRiffData = new Uint8Array(riffData);
            setLittleEndianNumberToUint8Array(channelRiffData, 4, 4, waveDataR.length * 4 + 44);
            setLittleEndianNumberToUint8Array(channelRiffData, 40, 4, waveDataR.length * 4);
            channelRiffDatas.set(channelID, channelRiffData);
        });

        const result = new SynthesizeResult();
        result.waveSegment = ret;
        result.channelToWaveSegment = channelRiffDatas;
        return result;
    }
}
